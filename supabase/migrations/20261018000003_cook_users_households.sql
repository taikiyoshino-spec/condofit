-- CondoCook: CondoCook だけ使えるメンバー（家族）と、家族（households）（2026-10-18 追加）
-- 設計: docs/CONDOCOOK_1A_DESIGN.md 1章
-- - group_members.apps: 'all' = CondoFit・CondoCook 両方（既存メンバー）、'cook' = CondoCook だけ
-- - is_member() / is_admin() は CondoFit 用の判定として 'all' の人だけにする（家族がトレーニング記録などを読めないように）
-- - is_cook_user() は CondoCook 用の判定（'all' / 'cook' どちらも）

alter table public.group_members add column apps text not null default 'all' check (apps in ('all', 'cook'));

create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.group_members gm
    join public.users u on u.id = gm.user_id
    where gm.user_id = auth.uid()
      and gm.removed_at is null
      and gm.apps = 'all'
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
      and gm.apps = 'all'
      and gm.role = 'admin'
      and u.deactivated_at is null
  )
$$;

create or replace function public.is_cook_user() returns boolean
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
revoke execute on function public.is_cook_user() from public, anon;
grant execute on function public.is_cook_user() to authenticated;

-- 名前・アイコン・自分の所属は CondoCook だけの人も読める（ログイン判定と表示に必要）
drop policy groups_select on public.groups;
create policy groups_select on public.groups for select to authenticated using (public.is_cook_user());
drop policy users_select on public.users;
create policy users_select on public.users for select to authenticated using (public.is_cook_user());
drop policy users_update_self on public.users;
create policy users_update_self on public.users for update to authenticated
  using (id = auth.uid() and public.is_cook_user()) with check (id = auth.uid());
drop policy group_members_select on public.group_members;
create policy group_members_select on public.group_members for select to authenticated
  using (public.is_cook_user());
drop policy push_subscriptions_own on public.push_subscriptions;
create policy push_subscriptions_own on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_cook_user());

-- CondoFit の通知（チェックイン・予定・実績コメントなど）は CondoCook だけの人に作らない
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
  if p_type in ('check_in', 'location_stale', 'schedule_join', 'schedule_cancel', 'schedule_update', 'schedule_delete', 'day_comment')
     and not exists (select 1 from public.group_members gm
                     where gm.user_id = p_recipient and gm.removed_at is null and gm.apps = 'all') then
    return;
  end if;

  select case
           when p_type = 'check_in' then s.check_in
           when p_type = 'location_stale' then s.location_stale
           when p_type = 'day_comment' then s.comment
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
revoke execute on function public.notify(uuid, text, uuid, jsonb) from public, anon, authenticated;

-- ランキングは CondoFit のメンバーだけ（20261011000003 の定義に apps の条件を追加）
create or replace function public.monthly_ranking(p_month date)
returns table (user_id uuid, display_name text, visits int, exercise_kinds int)
language sql stable security invoker set search_path = public as $$
  with bounds as (
    select (date_trunc('month', p_month)::timestamp at time zone 'Asia/Tokyo') as f,
           ((date_trunc('month', p_month) + interval '1 month')::timestamp at time zone 'Asia/Tokyo') as t
  ),
  sess as (
    select ts.id, ts.user_id
    from public.training_sessions ts, bounds b
    where ts.performed_at >= b.f and ts.performed_at < b.t
  )
  select u.id, u.display_name,
    (select count(*) from bounds b, public.visit_flags(u.id, b.f, b.t) v where v.is_new_visit)::int,
    (select count(distinct se.exercise_id)
       from public.session_exercises se
       join sess on sess.id = se.session_id
       join public.exercises ex on ex.id = se.exercise_id and ex.owner_user_id is null
      where sess.user_id = u.id)::int
  from public.users u
  join public.group_members gm on gm.user_id = u.id and gm.removed_at is null and gm.apps = 'all'
  where u.deactivated_at is null
$$;

-- =========================================================
-- 家族（食材・買い物リストを共有する単位。1人1家族）
-- =========================================================

create table public.households (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id),
  name text not null check (char_length(btrim(name)) between 1 and 30),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger households_updated_at before update on public.households
  for each row execute function public.set_updated_at();

create table public.household_members (
  user_id uuid primary key references public.users (id),
  household_id uuid not null references public.households (id) on delete cascade,
  joined_at timestamptz not null default now()
);
create index household_members_household_idx on public.household_members (household_id);

create or replace function public.my_household_id() returns uuid
language sql stable security definer set search_path = public as $$
  select household_id from public.household_members where user_id = auth.uid()
$$;
revoke execute on function public.my_household_id() from public, anon;
grant execute on function public.my_household_id() to authenticated;

-- 家族に入っていなければ「1人の家族」を作って入る（CondoCook を開いたときに呼ぶ）。家族のIDを返す
create or replace function public.ensure_my_household() returns uuid
language plpgsql security definer set search_path = public as $$
declare
  hid uuid;
  gid uuid;
  uname text;
begin
  if not public.is_cook_user() then
    raise exception 'forbidden';
  end if;
  select household_id into hid from public.household_members where user_id = auth.uid();
  if hid is not null then
    return hid;
  end if;
  select gm.group_id, u.display_name into gid, uname
    from public.group_members gm join public.users u on u.id = gm.user_id
   where gm.user_id = auth.uid() and gm.removed_at is null
   limit 1;
  insert into public.households (group_id, name) values (gid, left(uname, 30)) returning id into hid;
  insert into public.household_members (user_id, household_id) values (auth.uid(), hid)
    on conflict (user_id) do nothing;
  -- 同時に呼ばれて別の家族に入っていた場合はそちらを使い、作った家族は消す
  if not exists (select 1 from public.household_members where user_id = auth.uid() and household_id = hid) then
    delete from public.households where id = hid;
    select household_id into hid from public.household_members where user_id = auth.uid();
  end if;
  return hid;
end;
$$;
revoke execute on function public.ensure_my_household() from public, anon;
grant execute on function public.ensure_my_household() to authenticated;

alter table public.households enable row level security;
alter table public.household_members enable row level security;

-- 見えるのは自分の家族（管理者は全部）。作成・変更・メンバーの出し入れは管理者がサーバー経由（service_role）で行う
revoke all on public.households, public.household_members from anon, authenticated;
grant select on public.households, public.household_members to authenticated;
create policy households_select on public.households for select to authenticated
  using ((public.is_cook_user() and id = public.my_household_id()) or public.is_admin());
create policy household_members_select on public.household_members for select to authenticated
  using ((public.is_cook_user() and household_id = public.my_household_id()) or public.is_admin());
