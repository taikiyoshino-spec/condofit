-- CondoCook フェーズ1b: レシピへの反応・通知・ランキング（2026-10-19 追加。RECIPE_SPEC.md D20〜D23、docs/CONDOCOOK_1B_DESIGN.md）
-- - 「作った」（何度でも。一言・写真は任意）、お気に入り、「作りたい」、コメント
-- - 見える範囲はレシピと同じ（can_view_recipe）。お気に入り・作りたいは本人だけが見え、数はレシピの列で全員に見える
-- - 通知（アプリ内）は DB トリガーで作る。プッシュはアプリのサーバーが同じ通知を見て送る
-- - ランキングはグループ公開のレシピだけ（D15・D21・D22）

-- ---------------------------------------------------------
-- レシピ: 初めてグループ公開した日時、反応の数
-- ---------------------------------------------------------
alter table public.recipes
  add column published_at timestamptz,
  add column cooked_count int not null default 0,
  add column favorite_count int not null default 0;
update public.recipes set published_at = created_at where visibility = 'group' and deleted_at is null;
create index recipes_published_idx on public.recipes (published_at) where published_at is not null;

-- 反応の数が変わっただけでは更新日時を変えない（内容を変えたときだけ）
drop trigger recipes_updated_at on public.recipes;
create trigger recipes_updated_at before update of
    title, visibility, servings, cook_minutes, category_id, tags, memo, source_url, source_name, photo_path, thumb_path, copied_from, deleted_at
  on public.recipes for each row execute function public.set_updated_at();

create or replace function public.recipes_set_published() returns trigger
language plpgsql as $$
begin
  if new.visibility = 'group' and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end;
$$;
create trigger recipes_set_published before insert or update of visibility on public.recipes
  for each row execute function public.recipes_set_published();

-- ---------------------------------------------------------
-- 反応のテーブル
-- ---------------------------------------------------------
create table public.recipe_cooks (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.users (id),
  note text check (char_length(note) <= 200),
  photo_path text,
  thumb_path text,
  cooked_at timestamptz not null default now()
);
create index recipe_cooks_recipe_idx on public.recipe_cooks (recipe_id, cooked_at desc);
create index recipe_cooks_cooked_idx on public.recipe_cooks (cooked_at);
create index recipe_cooks_user_idx on public.recipe_cooks (user_id, cooked_at desc);

create table public.recipe_favorites (
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.users (id),
  created_at timestamptz not null default now(),
  primary key (recipe_id, user_id)
);
create index recipe_favorites_user_idx on public.recipe_favorites (user_id, created_at desc);

create table public.recipe_wants (
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.users (id),
  created_at timestamptz not null default now(),
  primary key (recipe_id, user_id)
);
create index recipe_wants_user_idx on public.recipe_wants (user_id, created_at desc);

create table public.recipe_comments (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.users (id),
  body text not null check (char_length(btrim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);
create index recipe_comments_recipe_idx on public.recipe_comments (recipe_id, created_at);

-- 書き込み時の値をそろえる（日時はサーバーの時刻、本文は前後の空白を除く）
create or replace function public.recipe_reaction_guard() returns trigger
language plpgsql as $$
begin
  if tg_table_name = 'recipe_cooks' then
    new.cooked_at := now();
    new.note := nullif(btrim(new.note), '');
  elsif tg_table_name = 'recipe_comments' then
    new.created_at := now();
    new.body := btrim(new.body);
  else
    new.created_at := now();
  end if;
  return new;
end;
$$;
create trigger recipe_cooks_guard before insert on public.recipe_cooks for each row execute function public.recipe_reaction_guard();
create trigger recipe_favorites_guard before insert on public.recipe_favorites for each row execute function public.recipe_reaction_guard();
create trigger recipe_wants_guard before insert on public.recipe_wants for each row execute function public.recipe_reaction_guard();
create trigger recipe_comments_guard before insert on public.recipe_comments for each row execute function public.recipe_reaction_guard();

-- ---------------------------------------------------------
-- 通知の種類と設定
-- ---------------------------------------------------------
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'check_in', 'location_stale',
  'schedule_join', 'schedule_cancel', 'schedule_update', 'schedule_delete',
  'day_comment',
  'cook_cooked', 'cook_comment', 'cook_favorite', 'cook_new_recipe'
));

-- ① 作った ② コメント・お気に入り ③ 仲間の新しいレシピ（D23）
alter table public.notification_settings
  add column cook_cooked boolean not null default true,
  add column cook_reaction boolean not null default true,
  add column cook_new_recipe boolean not null default true;
grant update (cook_cooked, cook_reaction, cook_new_recipe) on public.notification_settings to authenticated;

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
           when p_type = 'cook_cooked' then s.cook_cooked
           when p_type in ('cook_comment', 'cook_favorite') then s.cook_reaction
           when p_type = 'cook_new_recipe' then s.cook_new_recipe
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

-- 通知に入れるレシピの情報
create or replace function public.recipe_notify_payload(p_recipe uuid, p_extra jsonb default '{}'::jsonb) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('recipe_id', r.id, 'title', r.title) || p_extra from public.recipes r where r.id = p_recipe
$$;
revoke execute on function public.recipe_notify_payload(uuid, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------
-- 反応の数・通知（トリガー）
-- ---------------------------------------------------------

-- 作った: 作成者本人以外の分を数える（D22）。作ったら「作りたい」から外す。作成者に通知
create or replace function public.recipe_cooks_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
begin
  if tg_op = 'INSERT' then
    select owner_user_id into v_owner from public.recipes where id = new.recipe_id;
    if new.user_id <> v_owner then
      update public.recipes set cooked_count = cooked_count + 1 where id = new.recipe_id;
    end if;
    delete from public.recipe_wants where recipe_id = new.recipe_id and user_id = new.user_id;
    perform public.notify(v_owner, 'cook_cooked', new.user_id,
      public.recipe_notify_payload(new.recipe_id, jsonb_build_object('cook_id', new.id, 'excerpt', left(coalesce(new.note, ''), 40))));
    return new;
  else
    select owner_user_id into v_owner from public.recipes where id = old.recipe_id;
    if old.user_id <> v_owner then
      update public.recipes set cooked_count = greatest(cooked_count - 1, 0) where id = old.recipe_id;
    end if;
    return old;
  end if;
end;
$$;
create trigger recipe_cooks_after after insert or delete on public.recipe_cooks
  for each row execute function public.recipe_cooks_after();

-- お気に入り: 数を数え、作成者に通知
create or replace function public.recipe_favorites_after() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.recipes set favorite_count = favorite_count + 1 where id = new.recipe_id;
    perform public.notify((select owner_user_id from public.recipes where id = new.recipe_id), 'cook_favorite', new.user_id,
      public.recipe_notify_payload(new.recipe_id));
    return new;
  else
    update public.recipes set favorite_count = greatest(favorite_count - 1, 0) where id = old.recipe_id;
    return old;
  end if;
end;
$$;
create trigger recipe_favorites_after after insert or delete on public.recipe_favorites
  for each row execute function public.recipe_favorites_after();

-- コメント: 作成者と、同じレシピに先にコメントした人へ（返事に気づけるように）
create or replace function public.recipe_comments_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r record;
begin
  for r in
    select owner_user_id as user_id from public.recipes where id = new.recipe_id
    union
    select c.user_id from public.recipe_comments c where c.recipe_id = new.recipe_id and c.id <> new.id
  loop
    -- 先にコメントした人でも、今そのレシピが見えない人には送らない
    if exists (select 1 from public.recipes x where x.id = new.recipe_id and x.deleted_at is null
                 and (x.visibility = 'group' or x.owner_user_id = r.user_id
                      or (x.visibility = 'household' and exists (
                            select 1 from public.household_members a join public.household_members b on a.household_id = b.household_id
                             where a.user_id = x.owner_user_id and b.user_id = r.user_id)))) then
      perform public.notify(r.user_id, 'cook_comment', new.user_id,
        public.recipe_notify_payload(new.recipe_id, jsonb_build_object('comment_id', new.id, 'excerpt', left(new.body, 40))));
    end if;
  end loop;
  return new;
end;
$$;
create trigger recipe_comments_notify after insert on public.recipe_comments
  for each row execute function public.recipe_comments_notify();

-- 仲間が新しいレシピをグループ公開したら、同じグループの全員へ（初めて公開したときだけ）
create or replace function public.recipes_notify_published() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r record;
begin
  if new.published_at is null or new.deleted_at is not null
     or (tg_op = 'UPDATE' and old.published_at is not distinct from new.published_at) then
    return new;
  end if;
  for r in
    select gm.user_id
      from public.group_members gm
     where gm.removed_at is null
       and gm.group_id = (select g.group_id from public.group_members g where g.user_id = new.owner_user_id and g.removed_at is null)
  loop
    perform public.notify(r.user_id, 'cook_new_recipe', new.owner_user_id, public.recipe_notify_payload(new.id));
  end loop;
  return new;
end;
$$;
-- 公開日時は BEFORE トリガーが入れるので、列を指定せずに更新ごとに見る（列指定は SET に書いた列でしか動かない）
create trigger recipes_notify_published after insert or update on public.recipes
  for each row execute function public.recipes_notify_published();

revoke execute on function public.recipes_set_published() from public, anon, authenticated;
revoke execute on function public.recipe_reaction_guard() from public, anon, authenticated;
revoke execute on function public.recipe_cooks_after() from public, anon, authenticated;
revoke execute on function public.recipe_favorites_after() from public, anon, authenticated;
revoke execute on function public.recipe_comments_notify() from public, anon, authenticated;
revoke execute on function public.recipes_notify_published() from public, anon, authenticated;

-- ---------------------------------------------------------
-- RLS
-- ---------------------------------------------------------
alter table public.recipe_cooks enable row level security;
alter table public.recipe_favorites enable row level security;
alter table public.recipe_wants enable row level security;
alter table public.recipe_comments enable row level security;
revoke all on public.recipe_cooks, public.recipe_favorites, public.recipe_wants, public.recipe_comments from anon, authenticated;

-- 作った: レシピが見える人に見える。写真はアプリのサーバー（service_role）が付ける
grant select, delete on public.recipe_cooks to authenticated;
grant insert (recipe_id, user_id, note) on public.recipe_cooks to authenticated;
create policy recipe_cooks_select on public.recipe_cooks for select to authenticated using (public.can_view_recipe(recipe_id));
create policy recipe_cooks_insert on public.recipe_cooks for insert to authenticated
  with check (user_id = auth.uid() and public.can_view_recipe(recipe_id));
create policy recipe_cooks_delete on public.recipe_cooks for delete to authenticated
  using ((user_id = auth.uid() and public.is_cook_user()) or public.is_admin());

-- お気に入り・作りたい: 本人だけ
grant select, delete on public.recipe_favorites, public.recipe_wants to authenticated;
grant insert (recipe_id, user_id) on public.recipe_favorites, public.recipe_wants to authenticated;
create policy recipe_favorites_own on public.recipe_favorites for select to authenticated using (user_id = auth.uid());
create policy recipe_favorites_insert on public.recipe_favorites for insert to authenticated
  with check (user_id = auth.uid() and public.can_view_recipe(recipe_id));
create policy recipe_favorites_delete on public.recipe_favorites for delete to authenticated using (user_id = auth.uid());
create policy recipe_wants_own on public.recipe_wants for select to authenticated using (user_id = auth.uid());
create policy recipe_wants_insert on public.recipe_wants for insert to authenticated
  with check (user_id = auth.uid() and public.can_view_recipe(recipe_id));
create policy recipe_wants_delete on public.recipe_wants for delete to authenticated using (user_id = auth.uid());

-- コメント: レシピが見える人に見える。削除は書いた本人と管理者
grant select, delete on public.recipe_comments to authenticated;
grant insert (recipe_id, user_id, body) on public.recipe_comments to authenticated;
create policy recipe_comments_select on public.recipe_comments for select to authenticated using (public.can_view_recipe(recipe_id));
create policy recipe_comments_insert on public.recipe_comments for insert to authenticated
  with check (user_id = auth.uid() and public.can_view_recipe(recipe_id));
create policy recipe_comments_delete on public.recipe_comments for delete to authenticated
  using ((user_id = auth.uid() and public.is_cook_user()) or public.is_admin());

-- ---------------------------------------------------------
-- ランキング（月ごと・JST。グループ公開のレシピだけ。D21・D22）
-- board: recipe = 作られたレシピ（作った人数。作成者本人を除く）
--        cook   = よく料理した人（作ったの回数。自分のレシピも数える）
--        post   = レシピを登録した人（その月に初めてグループ公開した数）
-- 呼んだ人の権限で読む（グループ公開のレシピは同じグループの全員に見える）
-- ---------------------------------------------------------
create or replace function public.cook_monthly_ranking(p_month date)
returns table (board text, id uuid, n int)
language sql stable security invoker set search_path = public as $$
  with bounds as (
    select (date_trunc('month', p_month)::timestamp at time zone 'Asia/Tokyo') as f,
           ((date_trunc('month', p_month) + interval '1 month')::timestamp at time zone 'Asia/Tokyo') as t
  ),
  cooks as (
    select c.recipe_id, c.user_id, r.owner_user_id
      from public.recipe_cooks c
      join public.recipes r on r.id = c.recipe_id and r.visibility = 'group' and r.deleted_at is null
      join public.users u on u.id = c.user_id and u.deactivated_at is null,
      bounds b
     where c.cooked_at >= b.f and c.cooked_at < b.t
  )
  select 'recipe', recipe_id, count(distinct user_id)::int from cooks where user_id <> owner_user_id group by recipe_id
  union all
  select 'cook', user_id, count(*)::int from cooks group by user_id
  union all
  select 'post', r.owner_user_id, count(*)::int
    from public.recipes r
    join public.users u on u.id = r.owner_user_id and u.deactivated_at is null, bounds b
   where r.visibility = 'group' and r.deleted_at is null and r.published_at >= b.f and r.published_at < b.t
   group by r.owner_user_id
$$;
revoke execute on function public.cook_monthly_ranking(date) from public, anon;
grant execute on function public.cook_monthly_ranking(date) to authenticated;
