-- CondoCook フェーズ3: 食材リスト・いつもある・期限・過去の買い物（2026-10-19 追加。RECIPE_SPEC.md D8〜D11・D17、docs/CONDOCOOK_3_DESIGN.md）
-- - 食材リスト（pantry_items）に冷蔵／冷凍を足し、手で追加・期限の変更・冷凍への切り替えをできるようにする
-- - いつもある（常備品）は食材マスタの is_staple を初期値に、家族ごとに外したり足したりできる（household_staples は初期値との差分だけ持つ）
-- - 過去に買った物（household_purchases）を残し、「よく買う物」から追加できるようにする

alter table public.pantry_items
  add column storage text not null default 'fridge' check (storage in ('fridge', 'freezer'));

-- ---------------------------------------------------------
-- いつもある（家族ごとの差分）
-- ---------------------------------------------------------
create table public.household_staples (
  household_id uuid not null references public.households (id) on delete cascade,
  ingredient_id uuid not null references public.ingredients (id),
  is_staple boolean not null,
  updated_at timestamptz not null default now(),
  primary key (household_id, ingredient_id)
);

-- 自分の家族の「いつもある」食材
create or replace function public.my_staple_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select i.id from public.ingredients i
   where i.merged_into is null and i.active
     and coalesce((select hs.is_staple from public.household_staples hs
                    where hs.household_id = public.my_household_id() and hs.ingredient_id = i.id), i.is_staple)
     and public.is_cook_user()
$$;

-- いつもあるに入れる・外す。初期値と同じになったら差分を消す
create or replace function public.set_staple(p_ingredient uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  hid uuid := public.my_household_id();
  v_default boolean;
begin
  if not public.is_cook_user() or hid is null then
    raise exception 'forbidden';
  end if;
  select is_staple into v_default from public.ingredients where id = p_ingredient and merged_into is null;
  if not found then
    raise exception 'not_found';
  end if;
  if v_default = p_on then
    delete from public.household_staples where household_id = hid and ingredient_id = p_ingredient;
  else
    insert into public.household_staples (household_id, ingredient_id, is_staple) values (hid, p_ingredient, p_on)
    on conflict (household_id, ingredient_id) do update set is_staple = excluded.is_staple, updated_at = now();
  end if;
end;
$$;

-- ---------------------------------------------------------
-- 過去に買った物（家族ごと。1食材1行）
-- ---------------------------------------------------------
create table public.household_purchases (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  ingredient_id uuid references public.ingredients (id),
  name text not null check (char_length(btrim(name)) between 1 and 30),
  category text not null default 'その他',
  times int not null default 1,
  last_bought_on date not null default public.jst_today()
);
create unique index household_purchases_ingredient_key on public.household_purchases (household_id, ingredient_id) where ingredient_id is not null;
create unique index household_purchases_name_key on public.household_purchases (household_id, lower(name)) where ingredient_id is null;

-- 今の食材リストを過去に買った物として入れておく
insert into public.household_purchases (household_id, ingredient_id, name, category, last_bought_on)
select household_id, ingredient_id, name, category, bought_on from public.pantry_items
on conflict do nothing;

-- ---------------------------------------------------------
-- 食材リストに入れる（共通）。すでにあれば買った日・期限の目安を新しくする（冷凍のものは冷凍のまま）。過去に買った物にも残す
-- ---------------------------------------------------------
create or replace function public.pantry_put(p_household uuid, p_ingredient uuid, p_name text, p_category text, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  today date := public.jst_today();
  v_fridge int;
  v_freezer int;
begin
  if p_ingredient is not null then
    select fridge_days, freezer_days into v_fridge, v_freezer from public.ingredients where id = p_ingredient;
    insert into public.pantry_items (household_id, ingredient_id, name, category, bought_on, expires_on, added_by)
    values (p_household, p_ingredient, p_name, p_category, today, today + v_fridge, p_user)
    on conflict (household_id, ingredient_id) where ingredient_id is not null
    do update set bought_on = excluded.bought_on,
                  expires_on = case when pantry_items.storage = 'freezer' then today + v_freezer else excluded.expires_on end;
    insert into public.household_purchases (household_id, ingredient_id, name, category)
    values (p_household, p_ingredient, p_name, p_category)
    on conflict (household_id, ingredient_id) where ingredient_id is not null
    do update set times = household_purchases.times + 1, last_bought_on = today, name = excluded.name;
  else
    insert into public.pantry_items (household_id, name, category, bought_on, added_by)
    values (p_household, p_name, p_category, today, p_user)
    on conflict (household_id, lower(name)) where ingredient_id is null
    do update set bought_on = excluded.bought_on;
    insert into public.household_purchases (household_id, name, category)
    values (p_household, p_name, p_category)
    on conflict (household_id, lower(name)) where ingredient_id is null
    do update set times = household_purchases.times + 1, last_bought_on = today;
  end if;
end;
$$;
revoke execute on function public.pantry_put(uuid, uuid, text, text, uuid) from public, anon, authenticated;

-- 買ったものを食材リストへ（20261019000002 の定義を pantry_put を使う形に）
create or replace function public.move_bought_to_pantry() returns int
language plpgsql security definer set search_path = public as $$
declare
  hid uuid := public.my_household_id();
  r record;
  moved int := 0;
begin
  if not public.is_cook_user() or hid is null then
    raise exception 'forbidden';
  end if;
  for r in
    select distinct on (coalesce(s.ingredient_id::text, lower(s.name)))
           s.ingredient_id, coalesce(i.name, s.name) as name, s.category
      from public.shopping_items s
      left join public.ingredients i on i.id = s.ingredient_id
     where s.household_id = hid and s.bought_at is not null
     order by coalesce(s.ingredient_id::text, lower(s.name)), s.bought_at desc
  loop
    perform public.pantry_put(hid, r.ingredient_id, r.name, r.category, auth.uid());
    moved := moved + 1;
  end loop;
  delete from public.shopping_items where household_id = hid and bought_at is not null;
  return moved;
end;
$$;

-- 手で食材リストに入れる。p_items: [{ingredient_id, name}]
create or replace function public.add_pantry_items(p_items jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare
  hid uuid := public.my_household_id();
  it jsonb;
  v_ing uuid;
  v_name text;
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
    v_name := left(btrim(coalesce(it ->> 'name', '')), 30);
    v_category := 'その他';
    if v_ing is not null then
      select i.name, i.category into v_name, v_category from public.ingredients i where i.id = v_ing and i.merged_into is null;
      if not found then
        v_ing := null;
        v_name := left(btrim(coalesce(it ->> 'name', '')), 30);
        v_category := 'その他';
      end if;
    end if;
    if v_name = '' then
      continue;
    end if;
    perform public.pantry_put(hid, v_ing, v_name, v_category, auth.uid());
    added := added + 1;
  end loop;
  return added;
end;
$$;

-- 冷蔵／冷凍の切り替え・期限の変更。冷蔵／冷凍を変えたら期限の目安を買った日から計算し直す（p_expires を渡せばそれを使う）
create or replace function public.update_pantry_item(p_id uuid, p_storage text, p_expires date) returns void
language plpgsql security definer set search_path = public as $$
declare
  r record;
begin
  if not public.is_cook_user() or p_storage not in ('fridge', 'freezer') then
    raise exception 'forbidden';
  end if;
  select p.*, i.fridge_days, i.freezer_days into r
    from public.pantry_items p left join public.ingredients i on i.id = p.ingredient_id
   where p.id = p_id and p.household_id = public.my_household_id();
  if not found then
    raise exception 'not_found';
  end if;
  update public.pantry_items
     set storage = p_storage,
         expires_on = case
           when p_expires is not null then p_expires
           when p_storage <> r.storage then r.bought_on + (case when p_storage = 'freezer' then r.freezer_days else r.fridge_days end)
           else r.expires_on
         end
   where id = p_id;
end;
$$;

revoke execute on function public.my_staple_ids() from public, anon;
revoke execute on function public.set_staple(uuid, boolean) from public, anon;
revoke execute on function public.add_pantry_items(jsonb) from public, anon;
revoke execute on function public.update_pantry_item(uuid, text, date) from public, anon;
grant execute on function public.my_staple_ids() to authenticated;
grant execute on function public.set_staple(uuid, boolean) to authenticated;
grant execute on function public.add_pantry_items(jsonb) to authenticated;
grant execute on function public.update_pantry_item(uuid, text, date) to authenticated;

-- ---------------------------------------------------------
-- RLS
-- ---------------------------------------------------------
alter table public.household_staples enable row level security;
alter table public.household_purchases enable row level security;
revoke all on public.household_staples, public.household_purchases from anon, authenticated;
grant select on public.household_staples to authenticated;
grant select, delete on public.household_purchases to authenticated;
create policy household_staples_select on public.household_staples for select to authenticated
  using (public.is_cook_user() and household_id = public.my_household_id());
create policy household_purchases_select on public.household_purchases for select to authenticated
  using (public.is_cook_user() and household_id = public.my_household_id());
create policy household_purchases_delete on public.household_purchases for delete to authenticated
  using (public.is_cook_user() and household_id = public.my_household_id());

alter publication supabase_realtime add table public.pantry_items;
