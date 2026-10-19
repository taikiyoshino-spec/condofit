-- CondoCook フェーズ2: 買い物リスト（2026-10-19 追加。RECIPE_SPEC.md D8・D19・D23④、docs/CONDOCOOK_2_DESIGN.md）
-- - 家族で共有する買い物リスト。レシピから追加した材料は1行ずつ持ち、画面で同じ食材をまとめて表示する（分量は足さない）
-- - 買い物中は「買った」の印を付け外しでき、「食材リストへ」で家にある食材（pantry_items）に移してリストから消す
-- - 食材リストは量を持たず「ある／ない」だけ（D8）。画面と賞味期限まわりはフェーズ3
-- - 家族が追加したら、追加が続く間はまとめ、最後の追加から約5分たったら1回だけ通知（毎分の定期処理から呼ぶ）

-- ---------------------------------------------------------
-- 買い物リスト
-- ---------------------------------------------------------
create table public.shopping_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  ingredient_id uuid references public.ingredients (id),
  name text not null check (char_length(btrim(name)) between 1 and 30),
  category text not null default 'その他',
  amount text not null default '' check (char_length(amount) <= 30),
  recipe_id uuid references public.recipes (id) on delete set null,
  recipe_title text check (char_length(recipe_title) <= 60),
  added_by uuid not null references public.users (id),
  created_at timestamptz not null default now(),
  bought_at timestamptz,
  bought_by uuid references public.users (id),
  notified boolean not null default false
);
create index shopping_items_household_idx on public.shopping_items (household_id, created_at);
create index shopping_items_unnotified_idx on public.shopping_items (created_at) where not notified;

-- ---------------------------------------------------------
-- 食材リスト（家にある食材。1食材1行）
-- ---------------------------------------------------------
create table public.pantry_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  ingredient_id uuid references public.ingredients (id),
  name text not null check (char_length(btrim(name)) between 1 and 30),
  category text not null default 'その他',
  bought_on date not null default public.jst_today(),
  expires_on date,
  added_by uuid references public.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index pantry_items_ingredient_key on public.pantry_items (household_id, ingredient_id) where ingredient_id is not null;
create unique index pantry_items_name_key on public.pantry_items (household_id, lower(name)) where ingredient_id is null;
create trigger pantry_items_updated_at before update on public.pantry_items
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------
-- 書き込み（RPC）
-- ---------------------------------------------------------

-- 買い物リストに追加する。p_items: [{ingredient_id, name, amount, recipe_id}]
-- 分類は食材マスタから、レシピ名は見えるレシピのものを入れる。同じレシピの同じ材料がまだ買っていない状態であれば足さない
create or replace function public.add_shopping_items(p_items jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare
  hid uuid := public.my_household_id();
  it jsonb;
  v_ing uuid;
  v_name text;
  v_recipe uuid;
  v_title text;
  v_category text;
  added int := 0;
begin
  if not public.is_cook_user() or hid is null then
    raise exception 'forbidden';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 100 then
    raise exception 'invalid';
  end if;
  for it in select * from jsonb_array_elements(p_items) loop
    v_ing := nullif(it ->> 'ingredient_id', '')::uuid;
    v_recipe := nullif(it ->> 'recipe_id', '')::uuid;
    v_name := btrim(coalesce(it ->> 'name', ''));
    v_title := null;
    v_category := 'その他';
    if v_ing is not null then
      select i.category, coalesce(nullif(v_name, ''), i.name) into v_category, v_name
        from public.ingredients i where i.id = v_ing and i.merged_into is null;
      if not found then
        v_ing := null;
        v_category := 'その他';
      end if;
    end if;
    if v_name = '' then
      continue;
    end if;
    if v_recipe is not null then
      if public.can_view_recipe(v_recipe) then
        select title into v_title from public.recipes where id = v_recipe;
      else
        v_recipe := null;
      end if;
    end if;
    if v_recipe is not null and exists (
      select 1 from public.shopping_items s
       where s.household_id = hid and s.recipe_id = v_recipe and s.bought_at is null
         and (s.ingredient_id = v_ing or (v_ing is null and s.ingredient_id is null and lower(s.name) = lower(v_name)))
    ) then
      continue;
    end if;
    insert into public.shopping_items (household_id, ingredient_id, name, category, amount, recipe_id, recipe_title, added_by)
    values (hid, v_ing, left(v_name, 30), v_category, left(btrim(coalesce(it ->> 'amount', '')), 30), v_recipe, v_title, auth.uid());
    added := added + 1;
  end loop;
  return added;
end;
$$;

-- 「買った」の印を付ける・外す（自分の家族のリストだけ）
create or replace function public.set_shopping_bought(p_ids uuid[], p_bought boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_cook_user() then
    raise exception 'forbidden';
  end if;
  update public.shopping_items
     set bought_at = case when p_bought then coalesce(bought_at, now()) end,
         bought_by = case when p_bought then coalesce(bought_by, auth.uid()) end
   where id = any (p_ids) and household_id = public.my_household_id();
end;
$$;

-- 買ったものを食材リストに入れ、買い物リストから消す。入れた食材の数を返す
-- すでにある食材は買った日と期限の目安を新しくする。期限の目安は 買った日 + 食材マスタの冷蔵の日数（D11）
create or replace function public.move_bought_to_pantry() returns int
language plpgsql security definer set search_path = public as $$
declare
  hid uuid := public.my_household_id();
  r record;
  moved int := 0;
  today date := public.jst_today();
begin
  if not public.is_cook_user() or hid is null then
    raise exception 'forbidden';
  end if;
  for r in
    select distinct on (coalesce(s.ingredient_id::text, lower(s.name)))
           s.ingredient_id, s.name, s.category, i.name as master_name, i.fridge_days
      from public.shopping_items s
      left join public.ingredients i on i.id = s.ingredient_id
     where s.household_id = hid and s.bought_at is not null
     order by coalesce(s.ingredient_id::text, lower(s.name)), s.bought_at desc
  loop
    if r.ingredient_id is not null then
      insert into public.pantry_items (household_id, ingredient_id, name, category, bought_on, expires_on, added_by)
      values (hid, r.ingredient_id, coalesce(r.master_name, r.name), r.category, today, today + r.fridge_days, auth.uid())
      on conflict (household_id, ingredient_id) where ingredient_id is not null
      do update set bought_on = excluded.bought_on, expires_on = excluded.expires_on;
    else
      insert into public.pantry_items (household_id, name, category, bought_on, added_by)
      values (hid, r.name, r.category, today, auth.uid())
      on conflict (household_id, lower(name)) where ingredient_id is null
      do update set bought_on = excluded.bought_on;
    end if;
    moved := moved + 1;
  end loop;
  delete from public.shopping_items where household_id = hid and bought_at is not null;
  return moved;
end;
$$;

revoke execute on function public.add_shopping_items(jsonb) from public, anon;
revoke execute on function public.set_shopping_bought(uuid[], boolean) from public, anon;
revoke execute on function public.move_bought_to_pantry() from public, anon;
grant execute on function public.add_shopping_items(jsonb) to authenticated;
grant execute on function public.set_shopping_bought(uuid[], boolean) to authenticated;
grant execute on function public.move_bought_to_pantry() to authenticated;

-- ---------------------------------------------------------
-- RLS（見る・消すのは自分の家族の分だけ。追加・買った・食材リストへは RPC）
-- ---------------------------------------------------------
alter table public.shopping_items enable row level security;
alter table public.pantry_items enable row level security;
revoke all on public.shopping_items, public.pantry_items from anon, authenticated;
grant select, delete on public.shopping_items, public.pantry_items to authenticated;
create policy shopping_items_household on public.shopping_items for select to authenticated
  using (public.is_cook_user() and household_id = public.my_household_id());
create policy shopping_items_delete on public.shopping_items for delete to authenticated
  using (public.is_cook_user() and household_id = public.my_household_id());
create policy pantry_items_household on public.pantry_items for select to authenticated
  using (public.is_cook_user() and household_id = public.my_household_id());
create policy pantry_items_delete on public.pantry_items for delete to authenticated
  using (public.is_cook_user() and household_id = public.my_household_id());

-- 家族のリストの変化を画面にすぐ反映する
alter publication supabase_realtime add table public.shopping_items;

-- ---------------------------------------------------------
-- 通知（D23④）: 追加が続く間はまとめ、最後の追加から5分たったら家族へ1回
-- ---------------------------------------------------------
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'check_in', 'location_stale',
  'schedule_join', 'schedule_cancel', 'schedule_update', 'schedule_delete',
  'day_comment',
  'cook_cooked', 'cook_comment', 'cook_favorite', 'cook_new_recipe', 'cook_shopping'
));

alter table public.notification_settings add column cook_shopping boolean not null default true;
grant update (cook_shopping) on public.notification_settings to authenticated;

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
           when p_type = 'cook_shopping' then s.cook_shopping
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

-- 定期処理（service_role）から呼ぶ。まとめた通知を作り、プッシュ用に作った通知を返す
create or replace function public.flush_shopping_notifications(p_quiet interval default interval '5 minutes')
returns table (recipient_user_id uuid, actor_user_id uuid, payload jsonb)
language plpgsql security definer set search_path = public as $$
declare
  b record;
  m record;
  p jsonb;
begin
  for b in
    select s.household_id, s.added_by,
           array_agg(s.id) as ids,
           count(*)::int as n,
           (array_agg(s.name order by s.created_at))[1:3] as names
      from public.shopping_items s
     where not s.notified
     group by s.household_id, s.added_by
    having max(s.created_at) <= now() - p_quiet
  loop
    update public.shopping_items set notified = true where id = any (b.ids);
    p := jsonb_build_object('count', b.n, 'names', to_jsonb(b.names));
    for m in select hm.user_id from public.household_members hm where hm.household_id = b.household_id and hm.user_id <> b.added_by loop
      perform public.notify(m.user_id, 'cook_shopping', b.added_by, p);
      if exists (select 1 from public.notifications n
                  where n.recipient_user_id = m.user_id and n.type = 'cook_shopping' and n.actor_user_id = b.added_by
                    and n.payload = p and n.created_at = now()) then
        recipient_user_id := m.user_id;
        actor_user_id := b.added_by;
        payload := p;
        return next;
      end if;
    end loop;
  end loop;
end;
$$;
revoke execute on function public.flush_shopping_notifications(interval) from public, anon, authenticated;
