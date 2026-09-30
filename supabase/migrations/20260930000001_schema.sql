-- CondoFit 基本スキーマ + RLS
-- 方針:
--   * 位置情報（緯度・経度・距離・履歴）は一切保存しない
--   * 権限はDB側（RLS / 列GRANT / トリガー）で強制する
--   * 種目・部位はDBマスタで管理し、履歴のあるものは物理削除しない
--   * 日付の基準はJST

set check_function_bodies = off;

-- =========================================================
-- 共通ヘルパー
-- =========================================================

create or replace function public.jst_today() returns date
language sql stable as $$
  select (now() at time zone 'Asia/Tokyo')::date
$$;

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- =========================================================
-- グループ・ユーザー
-- =========================================================

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- id は auth.users.id と同一
create table public.users (
  id uuid primary key references auth.users (id) on delete restrict,
  display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deactivated_at timestamptz,
  constraint users_display_name_len check (char_length(btrim(display_name)) between 1 and 20),
  constraint users_display_name_trim check (display_name = btrim(display_name))
);
-- グループ内一意（利用停止ユーザーも過去記録に表示されるため名前は予約されたまま）
create unique index users_display_name_key on public.users (lower(display_name));

-- PINハッシュは他メンバーから読めないよう別テーブル（service_role のみアクセス）
create table public.user_secrets (
  user_id uuid primary key references public.users (id) on delete cascade,
  pin_hash text not null,
  updated_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid not null references public.groups (id),
  user_id uuid not null references public.users (id),
  role text not null default 'member' check (role in ('admin', 'member')),
  joined_at timestamptz not null default now(),
  removed_at timestamptz,
  primary key (group_id, user_id)
);

create table public.invite_tokens (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id),
  token_hash text not null unique,
  active boolean not null default true,
  created_by uuid references public.users (id),
  created_at timestamptz not null default now(),
  invalidated_at timestamptz
);
-- 有効なURLはグループにつき1つ
create unique index invite_tokens_one_active on public.invite_tokens (group_id) where active;

-- ログイン試行制限（表示名単位、service_role のみ）
create table public.login_attempts (
  display_name_key text primary key,
  failed_count int not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.group_members gm
    join public.users u on u.id = gm.user_id
    where gm.user_id = auth.uid()
      and gm.removed_at is null
      and u.deactivated_at is null
  )
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.group_members gm
    join public.users u on u.id = gm.user_id
    where gm.user_id = auth.uid()
      and gm.removed_at is null
      and gm.role = 'admin'
      and u.deactivated_at is null
  )
$$;

-- 最後の管理者を削除/降格できない
create or replace function public.guard_last_admin() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  remaining int;
begin
  if old.role = 'admin' and old.removed_at is null
     and (new.role <> 'admin' or new.removed_at is not null) then
    select count(*) into remaining
    from public.group_members gm
    join public.users u on u.id = gm.user_id
    where gm.group_id = old.group_id
      and gm.user_id <> old.user_id
      and gm.role = 'admin'
      and gm.removed_at is null
      and u.deactivated_at is null;
    if remaining = 0 then
      raise exception 'last_admin' using hint = '最後の管理者は削除・降格できません';
    end if;
  end if;
  return new;
end;
$$;

create trigger group_members_guard_last_admin
  before update on public.group_members
  for each row execute function public.guard_last_admin();

create or replace function public.guard_last_admin_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  remaining int;
begin
  if old.deactivated_at is null and new.deactivated_at is not null
     and exists (select 1 from public.group_members
                 where user_id = old.id and role = 'admin' and removed_at is null) then
    select count(*) into remaining
    from public.group_members gm
    join public.users u on u.id = gm.user_id
    where gm.user_id <> old.id
      and gm.role = 'admin'
      and gm.removed_at is null
      and u.deactivated_at is null;
    if remaining = 0 then
      raise exception 'last_admin' using hint = '最後の管理者は利用停止できません';
    end if;
  end if;
  return new;
end;
$$;

create trigger users_guard_last_admin
  before update on public.users
  for each row execute function public.guard_last_admin_user();

-- =========================================================
-- 通知設定
-- =========================================================

create table public.notification_settings (
  user_id uuid primary key references public.users (id) on delete cascade,
  check_in boolean not null default true,
  location_stale boolean not null default true,
  schedule boolean not null default true,
  updated_at timestamptz not null default now()
);

create or replace function public.create_default_notification_settings() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.notification_settings (user_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

create trigger users_default_notification_settings
  after insert on public.users
  for each row execute function public.create_default_notification_settings();

-- =========================================================
-- 通知
-- =========================================================

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references public.users (id),
  type text not null check (type in (
    'check_in', 'location_stale',
    'schedule_join', 'schedule_cancel', 'schedule_update', 'schedule_delete'
  )),
  actor_user_id uuid references public.users (id),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  expires_at timestamptz not null default (now() + interval '7 days')
);
create index notifications_recipient_idx on public.notifications (recipient_user_id, created_at desc);
create index notifications_expires_idx on public.notifications (expires_at);

-- 受信者の通知設定を見てアプリ内通知を作る（トリガーからのみ呼ぶ）
create or replace function public.notify(
  p_recipient uuid, p_type text, p_actor uuid, p_payload jsonb
) returns void
language plpgsql security definer set search_path = public as $$
declare
  enabled boolean;
begin
  if p_recipient is null or p_recipient = p_actor then
    return; -- 自分自身には通知しない
  end if;

  select case
           when p_type = 'check_in' then s.check_in
           when p_type = 'location_stale' then s.location_stale
           else s.schedule
         end
    into enabled
  from public.notification_settings s
  join public.users u on u.id = s.user_id
  where s.user_id = p_recipient and u.deactivated_at is null;

  if coalesce(enabled, false) then
    insert into public.notifications (recipient_user_id, type, actor_user_id, payload)
    values (p_recipient, p_type, p_actor, p_payload);
  end if;
end;
$$;
revoke execute on function public.notify(uuid, text, uuid, jsonb) from public;

create or replace function public.mark_all_notifications_read() returns void
language sql security invoker as $$
  update public.notifications
     set read_at = now()
   where recipient_user_id = auth.uid() and read_at is null
$$;

create or replace function public.purge_expired_notifications() returns int
language sql security definer set search_path = public as $$
  with d as (delete from public.notifications where expires_at <= now() returning 1)
  select count(*)::int from d
$$;
revoke execute on function public.purge_expired_notifications() from public;

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  endpoint text not null unique,
  keys jsonb not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

-- =========================================================
-- チェックイン（緯度経度・距離は保存しない）
-- 書き込みはサーバー（50m判定後に service_role）経由のみ
-- =========================================================

create table public.check_ins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id),
  checked_in_at timestamptz not null default now(),
  checked_out_at timestamptz,
  status text not null default 'active' check (status in ('active', 'checked_out')),
  last_location_verified_at timestamptz not null default now(),
  stale_notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint check_ins_status_consistent check (
    (status = 'active' and checked_out_at is null)
    or (status = 'checked_out' and checked_out_at is not null)
  )
);
create unique index check_ins_one_active on public.check_ins (user_id) where status = 'active';
create index check_ins_checked_in_at_idx on public.check_ins (user_id, checked_in_at desc);

create trigger check_ins_updated_at before update on public.check_ins
  for each row execute function public.set_updated_at();

create or replace function public.check_ins_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r record;
begin
  for r in
    select gm.user_id from public.group_members gm
    where gm.removed_at is null and gm.user_id <> new.user_id
  loop
    perform public.notify(r.user_id, 'check_in', new.user_id,
      jsonb_build_object('check_in_id', new.id));
  end loop;
  return new;
end;
$$;

create trigger check_ins_notify after insert on public.check_ins
  for each row execute function public.check_ins_notify();

-- 手動チェックアウト（自動チェックアウトは行わない）
create or replace function public.check_out() returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_member() then
    raise exception 'forbidden';
  end if;
  update public.check_ins
     set status = 'checked_out', checked_out_at = now()
   where user_id = auth.uid() and status = 'active';
end;
$$;

-- 15分以上位置確認できないチェックインに確認通知（Fit中は維持）。cronから呼ぶ。
-- 戻り値: 通知対象の user_id（プッシュ送信用）
create or replace function public.mark_stale_check_ins()
returns table (check_in_id uuid, user_id uuid)
language plpgsql security definer set search_path = public as $$
begin
  return query
  with stale as (
    update public.check_ins c
       set stale_notified_at = now()
     where c.status = 'active'
       and c.last_location_verified_at <= now() - interval '15 minutes'
       and (c.stale_notified_at is null or c.stale_notified_at < c.last_location_verified_at)
    returning c.id, c.user_id
  )
  select s.id, s.user_id from stale s;
end;
$$;
revoke execute on function public.mark_stale_check_ins() from public;

-- 本人向けアプリ内通知（notify() は自分宛てを弾くため直接挿入）
create or replace function public.check_ins_stale_notify() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.stale_notified_at is not null
     and new.stale_notified_at is distinct from old.stale_notified_at
     and exists (select 1 from public.notification_settings s
                 where s.user_id = new.user_id and s.location_stale) then
    insert into public.notifications (recipient_user_id, type, payload)
    values (new.user_id, 'location_stale', jsonb_build_object('check_in_id', new.id));
  end if;
  return new;
end;
$$;

create trigger check_ins_stale_notify after update of stale_notified_at on public.check_ins
  for each row execute function public.check_ins_stale_notify();

-- =========================================================
-- 予定
-- =========================================================

create table public.schedules (
  id uuid primary key default gen_random_uuid(),
  creator_user_id uuid not null default auth.uid() references public.users (id),
  date date not null,
  time_slot text not null check (time_slot in ('morning', 'noon', 'evening', 'night')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index schedules_date_idx on public.schedules (date) where deleted_at is null;

create table public.schedule_participants (
  schedule_id uuid not null references public.schedules (id),
  user_id uuid not null default auth.uid() references public.users (id),
  intention text not null check (intention in ('going', 'maybe')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (schedule_id, user_id)
);

create trigger schedules_updated_at before update on public.schedules
  for each row execute function public.set_updated_at();
create trigger schedule_participants_updated_at before update on public.schedule_participants
  for each row execute function public.set_updated_at();

-- 作成・編集は今日以降のみ。過去予定は編集不可。削除済みは変更不可。
create or replace function public.schedules_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.date < public.jst_today() then
      raise exception 'past_date' using hint = '過去日には予定を作成できません';
    end if;
    return new;
  end if;

  if old.deleted_at is not null then
    raise exception 'schedule_deleted';
  end if;
  if old.date < public.jst_today() then
    raise exception 'past_schedule' using hint = '過去の予定は変更できません';
  end if;
  if (new.date, new.time_slot) is distinct from (old.date, old.time_slot)
     and new.date < public.jst_today() then
    raise exception 'past_date' using hint = '変更先は今日以降にしてください';
  end if;
  if new.deleted_at is not null and old.deleted_at is null
     and (new.date, new.time_slot) is distinct from (old.date, old.time_slot) then
    raise exception 'invalid_update';
  end if;
  new.creator_user_id := old.creator_user_id;
  new.created_at := old.created_at;
  return new;
end;
$$;

create trigger schedules_guard before insert or update on public.schedules
  for each row execute function public.schedules_guard();

-- 作成者は自動で「行く！」（予定作成は通知なし）
create or replace function public.schedules_auto_join() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.schedule_participants (schedule_id, user_id, intention)
  values (new.id, new.creator_user_id, 'going');
  return new;
end;
$$;

create trigger schedules_auto_join after insert on public.schedules
  for each row execute function public.schedules_auto_join();

-- 編集・削除通知: 参加中メンバー（本人除く）
create or replace function public.schedules_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r record;
  n_type text;
  payload jsonb;
begin
  if new.deleted_at is not null and old.deleted_at is null then
    n_type := 'schedule_delete';
    payload := jsonb_build_object('schedule_id', new.id,
      'date', old.date, 'time_slot', old.time_slot);
  elsif (new.date, new.time_slot) is distinct from (old.date, old.time_slot) then
    n_type := 'schedule_update';
    payload := jsonb_build_object('schedule_id', new.id,
      'old_date', old.date, 'old_time_slot', old.time_slot,
      'new_date', new.date, 'new_time_slot', new.time_slot);
  else
    return new;
  end if;

  for r in select p.user_id from public.schedule_participants p where p.schedule_id = new.id loop
    perform public.notify(r.user_id, n_type, auth.uid(), payload);
  end loop;
  return new;
end;
$$;

create trigger schedules_notify after update on public.schedules
  for each row execute function public.schedules_notify();

-- 参加意思は今日以降かつ未削除の予定のみ変更可
create or replace function public.schedule_participants_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  s record;
begin
  select date, deleted_at into s from public.schedules
   where id = coalesce(new.schedule_id, old.schedule_id);
  if s.deleted_at is not null then
    raise exception 'schedule_deleted';
  end if;
  if s.date < public.jst_today() then
    raise exception 'past_schedule' using hint = '過去の予定の参加意思は変更できません';
  end if;
  if tg_op = 'UPDATE' then
    new.schedule_id := old.schedule_id;
    new.user_id := old.user_id;
    new.created_at := old.created_at;
  end if;
  return coalesce(new, old);
end;
$$;

create trigger schedule_participants_guard
  before insert or update or delete on public.schedule_participants
  for each row execute function public.schedule_participants_guard();

-- 参加: 作成者 + 既存参加者 / キャンセル: 作成者 + 他参加者 / 行く↔行けたら: なし
create or replace function public.schedule_participants_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r record;
  sch record;
  actor uuid;
  n_type text;
begin
  if tg_op = 'UPDATE' then
    return new;
  end if;

  actor := coalesce(new.user_id, old.user_id);
  select id, creator_user_id, date, time_slot into sch
    from public.schedules where id = coalesce(new.schedule_id, old.schedule_id);
  n_type := case when tg_op = 'INSERT' then 'schedule_join' else 'schedule_cancel' end;

  for r in
    select sch.creator_user_id as user_id
    union
    select p.user_id from public.schedule_participants p where p.schedule_id = sch.id
  loop
    perform public.notify(r.user_id, n_type, actor, jsonb_build_object(
      'schedule_id', sch.id, 'date', sch.date, 'time_slot', sch.time_slot,
      'intention', case when tg_op = 'INSERT' then new.intention else old.intention end));
  end loop;
  return coalesce(new, old);
end;
$$;

create trigger schedule_participants_notify
  after insert or update or delete on public.schedule_participants
  for each row execute function public.schedule_participants_notify();

-- =========================================================
-- 種目マスタ
-- =========================================================

create table public.body_parts (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  display_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  body_part_id uuid not null references public.body_parts (id),
  type text not null check (type in ('weight', 'cardio')),
  display_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index exercises_name_key on public.exercises (lower(name));

create trigger body_parts_updated_at before update on public.body_parts
  for each row execute function public.set_updated_at();
create trigger exercises_updated_at before update on public.exercises
  for each row execute function public.set_updated_at();

-- =========================================================
-- トレーニング記録（チェックインとは独立）
-- =========================================================

create table public.training_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.users (id),
  performed_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index training_sessions_user_idx on public.training_sessions (user_id, performed_at desc);
create index training_sessions_performed_idx on public.training_sessions (performed_at desc);

create table public.session_exercises (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.training_sessions (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id),
  display_order int not null default 0
);
create index session_exercises_session_idx on public.session_exercises (session_id);
create index session_exercises_exercise_idx on public.session_exercises (exercise_id);

-- 1行 = 1セット相当（セット数フィールドは持たない）。数値はすべて任意。
create table public.exercise_entries (
  id uuid primary key default gen_random_uuid(),
  session_exercise_id uuid not null references public.session_exercises (id) on delete cascade,
  display_order int not null default 0,
  weight_kg numeric(5, 1) check (weight_kg >= 0),
  reps int check (reps >= 0),
  duration_min numeric(6, 1) check (duration_min >= 0),
  distance_km numeric(6, 2) check (distance_km >= 0)
);
create index exercise_entries_se_idx on public.exercise_entries (session_exercise_id);

create trigger training_sessions_updated_at before update on public.training_sessions
  for each row execute function public.set_updated_at();

create or replace function public.training_sessions_guard() returns trigger
language plpgsql as $$
begin
  new.user_id := old.user_id;
  new.created_at := old.created_at;
  return new;
end;
$$;

create trigger training_sessions_guard before update on public.training_sessions
  for each row execute function public.training_sessions_guard();

-- セッションを種目・エントリごと一括保存（本人のみ。RLSが適用される）
-- p_exercises: [{"exercise_id": uuid, "entries": [{"weight_kg","reps","duration_min","distance_km"}]}]
-- 配列の順序がそのまま表示順になる
create or replace function public.save_training_session(
  p_session_id uuid, p_performed_at timestamptz, p_exercises jsonb
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  sid uuid := p_session_id;
  ex jsonb;
  en jsonb;
  se_id uuid;
  ex_idx int := 0;
  en_idx int;
begin
  if sid is null then
    insert into public.training_sessions (user_id, performed_at)
    values (auth.uid(), p_performed_at)
    returning id into sid;
  else
    update public.training_sessions set performed_at = p_performed_at
     where id = sid and user_id = auth.uid();
    if not found then
      raise exception 'forbidden';
    end if;
    delete from public.session_exercises where session_id = sid;
  end if;

  for ex in select * from jsonb_array_elements(coalesce(p_exercises, '[]'::jsonb)) loop
    insert into public.session_exercises (session_id, exercise_id, display_order)
    values (sid, (ex ->> 'exercise_id')::uuid, ex_idx)
    returning id into se_id;
    ex_idx := ex_idx + 1;

    en_idx := 0;
    for en in select * from jsonb_array_elements(coalesce(ex -> 'entries', '[]'::jsonb)) loop
      insert into public.exercise_entries
        (session_exercise_id, display_order, weight_kg, reps, duration_min, distance_km)
      values (se_id, en_idx,
        nullif(en ->> 'weight_kg', '')::numeric,
        nullif(en ->> 'reps', '')::int,
        nullif(en ->> 'duration_min', '')::numeric,
        nullif(en ->> 'distance_km', '')::numeric);
      en_idx := en_idx + 1;
    end loop;
  end loop;

  return sid;
end;
$$;

-- =========================================================
-- 集計
-- =========================================================

-- 今月の自分（Fit訪問 = セッション数。チェックインは使わない）
create or replace function public.my_month_stats()
returns table (visits int, training_days int, exercise_kinds int)
language sql stable security invoker set search_path = public as $$
  with s as (
    select ts.id, (ts.performed_at at time zone 'Asia/Tokyo')::date as d
    from public.training_sessions ts
    where ts.user_id = auth.uid()
      and ts.performed_at at time zone 'Asia/Tokyo' >= date_trunc('month', now() at time zone 'Asia/Tokyo')
      and ts.performed_at at time zone 'Asia/Tokyo' < date_trunc('month', now() at time zone 'Asia/Tokyo') + interval '1 month'
  )
  select
    (select count(*) from s)::int,
    (select count(distinct d) from s)::int,
    (select count(distinct se.exercise_id) from public.session_exercises se where se.session_id in (select id from s))::int
$$;

-- 種目タブ: 今月のメンバー代表値（ランキングではないので表示名順）
--  重量系: 今月の最大重量とその回数（同重量なら回数が多い方）
--  有酸素: 今月で合計値が最大のセッション1回分（合計時間 + 合計距離）
create or replace function public.exercise_month_summary(p_exercise_id uuid)
returns table (
  user_id uuid, display_name text,
  weight_kg numeric, reps int,
  duration_min numeric, distance_km numeric
)
language sql stable security invoker set search_path = public as $$
  with month_sessions as (
    select ts.id, ts.user_id, ts.performed_at
    from public.training_sessions ts
    where ts.performed_at at time zone 'Asia/Tokyo' >= date_trunc('month', now() at time zone 'Asia/Tokyo')
      and ts.performed_at at time zone 'Asia/Tokyo' < date_trunc('month', now() at time zone 'Asia/Tokyo') + interval '1 month'
  ),
  rows as (
    select ms.user_id, ms.id as session_id, ms.performed_at,
           e.weight_kg, e.reps, e.duration_min, e.distance_km
    from month_sessions ms
    join public.session_exercises se on se.session_id = ms.id and se.exercise_id = p_exercise_id
    join public.exercise_entries e on e.session_exercise_id = se.id
  ),
  ex as (select type from public.exercises where id = p_exercise_id),
  weight_best as (
    select distinct on (r.user_id) r.user_id, r.weight_kg, r.reps
    from rows r
    where r.weight_kg is not null or r.reps is not null
    order by r.user_id, r.weight_kg desc nulls last, r.reps desc nulls last, r.performed_at desc
  ),
  cardio_sessions as (
    select r.user_id, r.session_id, max(r.performed_at) as performed_at,
           sum(r.duration_min) as duration_min, sum(r.distance_km) as distance_km
    from rows r
    group by r.user_id, r.session_id
    having sum(r.duration_min) is not null or sum(r.distance_km) is not null
  ),
  cardio_best as (
    select distinct on (c.user_id) c.user_id, c.duration_min, c.distance_km
    from cardio_sessions c
    order by c.user_id, c.duration_min desc nulls last, c.distance_km desc nulls last, c.performed_at desc
  )
  select u.id, u.display_name, w.weight_kg, w.reps, null::numeric, null::numeric
  from weight_best w join public.users u on u.id = w.user_id
  where (select type from ex) = 'weight'
  union all
  select u.id, u.display_name, null::numeric, null::int, c.duration_min, c.distance_km
  from cardio_best c join public.users u on u.id = c.user_id
  where (select type from ex) = 'cardio'
  order by 2
$$;

-- ホーム: 最近の活動（直近7日・最大20件）。重量・回数などの詳細は含めない
--  visited: セッション記録（"Fitに行きました" / "〜を記録しました"）
--  schedule_created: 予定作成
create or replace function public.recent_activity()
returns table (kind text, actor_user_id uuid, display_name text, occurred_at timestamptz, detail jsonb)
language sql stable security invoker set search_path = public as $$
  select * from (
    select 'visited'::text, ts.user_id, u.display_name, ts.created_at,
           jsonb_build_object(
             'session_id', ts.id,
             'exercise_count', (select count(distinct se.exercise_id) from public.session_exercises se
                                where se.session_id = ts.id),
             'first_exercise_name', (select ex.name from public.session_exercises se
                                     join public.exercises ex on ex.id = se.exercise_id
                                     where se.session_id = ts.id
                                     order by se.display_order limit 1))
    from public.training_sessions ts join public.users u on u.id = ts.user_id
    where ts.created_at >= now() - interval '7 days'
    union all
    select 'schedule_created', s.creator_user_id, u.display_name, s.created_at,
           jsonb_build_object('schedule_id', s.id, 'date', s.date, 'time_slot', s.time_slot)
    from public.schedules s join public.users u on u.id = s.creator_user_id
    where s.created_at >= now() - interval '7 days' and s.deleted_at is null
  ) a
  order by 4 desc
  limit 20
$$;

-- =========================================================
-- RLS / 権限
-- =========================================================

alter table public.groups enable row level security;
alter table public.users enable row level security;
alter table public.user_secrets enable row level security;
alter table public.group_members enable row level security;
alter table public.invite_tokens enable row level security;
alter table public.login_attempts enable row level security;
alter table public.notification_settings enable row level security;
alter table public.notifications enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.check_ins enable row level security;
alter table public.schedules enable row level security;
alter table public.schedule_participants enable row level security;
alter table public.body_parts enable row level security;
alter table public.exercises enable row level security;
alter table public.training_sessions enable row level security;
alter table public.session_exercises enable row level security;
alter table public.exercise_entries enable row level security;

-- Supabase の既定GRANTを外し、必要なものだけ付与する
revoke all on all tables in schema public from anon, authenticated;

-- groups
grant select on public.groups to authenticated;
create policy groups_select on public.groups for select to authenticated using (public.is_member());

-- users（表示名は本人のみ変更。利用停止は管理者がサーバー経由で行う）
grant select on public.users to authenticated;
grant update (display_name) on public.users to authenticated;
create policy users_select on public.users for select to authenticated using (public.is_member());
create policy users_update_self on public.users for update to authenticated
  using (id = auth.uid() and public.is_member()) with check (id = auth.uid());

-- user_secrets / login_attempts / invite_tokens の書き込みは service_role のみ（ポリシーなし）
grant select on public.invite_tokens to authenticated;
create policy invite_tokens_admin_select on public.invite_tokens for select to authenticated
  using (public.is_admin());

-- group_members（ロール変更・利用停止は管理者のみ。最後のadminはトリガーで保護）
grant select on public.group_members to authenticated;
grant update (role, removed_at) on public.group_members to authenticated;
create policy group_members_select on public.group_members for select to authenticated
  using (public.is_member());
create policy group_members_admin_update on public.group_members for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- notification_settings
grant select on public.notification_settings to authenticated;
grant update (check_in, location_stale, schedule) on public.notification_settings to authenticated;
create policy notification_settings_own on public.notification_settings for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- notifications（作成はトリガー/サーバーのみ。既読化のみ本人可）
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
create policy notifications_own_select on public.notifications for select to authenticated
  using (recipient_user_id = auth.uid() and expires_at > now());
create policy notifications_own_update on public.notifications for update to authenticated
  using (recipient_user_id = auth.uid()) with check (recipient_user_id = auth.uid());

-- push_subscriptions
grant select, insert, delete on public.push_subscriptions to authenticated;
grant update (revoked_at) on public.push_subscriptions to authenticated;
create policy push_subscriptions_own on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_member());

-- check_ins（閲覧のみ。開始・位置確認はサーバー、チェックアウトは check_out()）
grant select on public.check_ins to authenticated;
create policy check_ins_select on public.check_ins for select to authenticated
  using (public.is_member());

-- schedules（作成は全員、編集・論理削除は作成者のみ。物理削除不可）
grant select, insert on public.schedules to authenticated;
grant update (date, time_slot, deleted_at) on public.schedules to authenticated;
create policy schedules_select on public.schedules for select to authenticated
  using (public.is_member());
create policy schedules_insert on public.schedules for insert to authenticated
  with check (creator_user_id = auth.uid() and public.is_member());
create policy schedules_update_creator on public.schedules for update to authenticated
  using (creator_user_id = auth.uid() and public.is_member())
  with check (creator_user_id = auth.uid());

-- schedule_participants（本人の参加意思のみ）
grant select, insert, delete on public.schedule_participants to authenticated;
grant update (intention) on public.schedule_participants to authenticated;
create policy schedule_participants_select on public.schedule_participants for select to authenticated
  using (public.is_member());
create policy schedule_participants_insert on public.schedule_participants for insert to authenticated
  with check (user_id = auth.uid() and public.is_member());
create policy schedule_participants_update on public.schedule_participants for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy schedule_participants_delete on public.schedule_participants for delete to authenticated
  using (user_id = auth.uid());

-- body_parts / exercises（閲覧は全員、変更は管理者。物理削除は不可 → active=false）
grant select, insert on public.body_parts to authenticated;
grant update (name, display_order, active) on public.body_parts to authenticated;
create policy body_parts_select on public.body_parts for select to authenticated using (public.is_member());
create policy body_parts_admin_insert on public.body_parts for insert to authenticated with check (public.is_admin());
create policy body_parts_admin_update on public.body_parts for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

grant select, insert on public.exercises to authenticated;
grant update (name, body_part_id, type, display_order, active) on public.exercises to authenticated;
create policy exercises_select on public.exercises for select to authenticated using (public.is_member());
create policy exercises_admin_insert on public.exercises for insert to authenticated with check (public.is_admin());
create policy exercises_admin_update on public.exercises for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- training_sessions / session_exercises / exercise_entries（閲覧は全員、変更は本人のみ）
grant select, insert, delete on public.training_sessions to authenticated;
grant update (performed_at) on public.training_sessions to authenticated;
create policy training_sessions_select on public.training_sessions for select to authenticated
  using (public.is_member());
create policy training_sessions_insert on public.training_sessions for insert to authenticated
  with check (user_id = auth.uid() and public.is_member());
create policy training_sessions_update on public.training_sessions for update to authenticated
  using (user_id = auth.uid() and public.is_member()) with check (user_id = auth.uid());
create policy training_sessions_delete on public.training_sessions for delete to authenticated
  using (user_id = auth.uid() and public.is_member());

create or replace function public.owns_session(p_session_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.training_sessions
                 where id = p_session_id and user_id = auth.uid())
    and public.is_member()
$$;

create or replace function public.owns_session_exercise(p_se_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.session_exercises se
                 join public.training_sessions ts on ts.id = se.session_id
                 where se.id = p_se_id and ts.user_id = auth.uid())
    and public.is_member()
$$;

grant select, insert, update, delete on public.session_exercises to authenticated;
create policy session_exercises_select on public.session_exercises for select to authenticated
  using (public.is_member());
create policy session_exercises_write on public.session_exercises for all to authenticated
  using (public.owns_session(session_id)) with check (public.owns_session(session_id));

grant select, insert, update, delete on public.exercise_entries to authenticated;
create policy exercise_entries_select on public.exercise_entries for select to authenticated
  using (public.is_member());
create policy exercise_entries_write on public.exercise_entries for all to authenticated
  using (public.owns_session_exercise(session_exercise_id))
  with check (public.owns_session_exercise(session_exercise_id));

-- =========================================================
-- Realtime
-- =========================================================

alter publication supabase_realtime add table
  public.check_ins,
  public.schedules,
  public.schedule_participants,
  public.notifications,
  public.training_sessions;

-- =========================================================
-- 関数の実行権限（全関数定義の後に置く）
-- =========================================================

revoke execute on all functions in schema public from public, anon, authenticated;
-- RLS内で使うヘルパーと、利用者が呼ぶRPCだけ許可
grant execute on function
  public.jst_today(),
  public.is_member(),
  public.is_admin(),
  public.owns_session(uuid),
  public.owns_session_exercise(uuid),
  public.mark_all_notifications_read(),
  public.check_out(),
  public.save_training_session(uuid, timestamptz, jsonb),
  public.my_month_stats(),
  public.exercise_month_summary(uuid),
  public.recent_activity()
to authenticated;
