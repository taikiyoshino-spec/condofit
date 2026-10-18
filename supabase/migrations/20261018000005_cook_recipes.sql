-- CondoCook: レシピ（2026-10-18 追加。RECIPE_SPEC.md D12〜D16、docs/CONDOCOOK_1A_DESIGN.md 2.2）
-- - 公開範囲: group = グループ全員 / household = 作成者と同じ家族（作成者の今の家族で判定） / private = 作成者だけ
-- - 編集は作成者だけ、削除（論理削除）は作成者と管理者
-- - 書き込みは save_recipe / delete_recipe だけ（レシピ・材料・手順をまとめて置き換え）

-- カテゴリ（管理者が追加・変更できる）
create table public.recipe_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 20),
  display_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index recipe_categories_name_key on public.recipe_categories (lower(name));
insert into public.recipe_categories (name, display_order) values
  ('主菜', 10), ('副菜', 20), ('汁物', 30), ('ご飯物', 40), ('麺', 50), ('おつまみ', 60), ('デザート', 70), ('その他', 80);

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references public.users (id),
  title text not null check (char_length(btrim(title)) between 1 and 60),
  visibility text not null default 'group' check (visibility in ('group', 'household', 'private')),
  servings int check (servings between 1 and 50),
  cook_minutes int check (cook_minutes between 1 and 1440),
  category_id uuid references public.recipe_categories (id),
  tags text[] not null default '{}' check (cardinality(tags) <= 10),
  memo text check (char_length(memo) <= 1000),
  source_url text check (char_length(source_url) <= 2000 and source_url ~* '^https?://'),
  source_name text check (char_length(source_name) <= 60),
  photo_path text,
  thumb_path text,
  copied_from uuid references public.recipes (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index recipes_owner_idx on public.recipes (owner_user_id, created_at desc);
create index recipes_created_idx on public.recipes (created_at desc) where deleted_at is null;
create trigger recipes_updated_at before update on public.recipes
  for each row execute function public.set_updated_at();

create table public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  position int not null,
  ingredient_id uuid references public.ingredients (id),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  amount text not null default '' check (char_length(amount) <= 30),
  quantity numeric check (quantity >= 0 and quantity < 100000),
  unit text check (char_length(unit) <= 10),
  optional boolean not null default false,
  section text check (char_length(section) <= 20)
);
create index recipe_ingredients_recipe_idx on public.recipe_ingredients (recipe_id, position);
create index recipe_ingredients_ingredient_idx on public.recipe_ingredients (ingredient_id);

create table public.recipe_steps (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  position int not null,
  body text not null check (char_length(btrim(body)) between 1 and 500)
);
create index recipe_steps_recipe_idx on public.recipe_steps (recipe_id, position);

-- 見えるか（RLS と関数で共通）
create or replace function public.can_view_recipe(p_recipe uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_cook_user() and exists (
    select 1 from public.recipes r
    where r.id = p_recipe and r.deleted_at is null
      and (r.visibility = 'group'
           or r.owner_user_id = auth.uid()
           or (r.visibility = 'household' and exists (
                 select 1 from public.household_members hm
                 where hm.user_id = r.owner_user_id and hm.household_id = public.my_household_id())))
  )
$$;
revoke execute on function public.can_view_recipe(uuid) from public, anon;
grant execute on function public.can_view_recipe(uuid) to authenticated;

alter table public.recipe_categories enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.recipe_steps enable row level security;
revoke all on public.recipe_categories, public.recipes, public.recipe_ingredients, public.recipe_steps from anon, authenticated;

grant select on public.recipe_categories to authenticated;
grant insert (name, display_order) on public.recipe_categories to authenticated;
grant update (name, display_order, active) on public.recipe_categories to authenticated;
create policy recipe_categories_select on public.recipe_categories for select to authenticated using (public.is_cook_user());
create policy recipe_categories_admin_insert on public.recipe_categories for insert to authenticated with check (public.is_admin());
create policy recipe_categories_admin_update on public.recipe_categories for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

grant select on public.recipes, public.recipe_ingredients, public.recipe_steps to authenticated;
create policy recipes_select on public.recipes for select to authenticated using (public.can_view_recipe(id));
create policy recipe_ingredients_select on public.recipe_ingredients for select to authenticated using (public.can_view_recipe(recipe_id));
create policy recipe_steps_select on public.recipe_steps for select to authenticated using (public.can_view_recipe(recipe_id));

-- レシピの保存（新規は p_id = null）。レシピ・材料・手順をまとめて置き換える。編集は作成者だけ
-- p_recipe: {title, visibility, servings, cook_minutes, category_id, tags[], memo, source_url, source_name, copied_from,
--            ingredients: [{ingredient_id, name, amount, quantity, unit, optional, section}], steps: [{body}]}
create or replace function public.save_recipe(p_id uuid, p_recipe jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  rid uuid := p_id;
  it jsonb;
  idx int := 0;
  v_copied uuid := nullif(p_recipe ->> 'copied_from', '')::uuid;
  v_tags text[];
begin
  if not public.is_cook_user() then
    raise exception 'forbidden';
  end if;
  if jsonb_array_length(coalesce(p_recipe -> 'ingredients', '[]')) > 60
     or jsonb_array_length(coalesce(p_recipe -> 'steps', '[]')) > 40 then
    raise exception 'too_many';
  end if;
  select coalesce(array_agg(btrim(t)) filter (where btrim(t) <> ''), '{}')
    into v_tags
    from jsonb_array_elements_text(coalesce(p_recipe -> 'tags', '[]')) t
   where char_length(btrim(t)) <= 20;

  if rid is null then
    -- コピー元は自分に見えるレシピだけ
    if v_copied is not null and not public.can_view_recipe(v_copied) then
      v_copied := null;
    end if;
    insert into public.recipes (owner_user_id, title, visibility, servings, cook_minutes, category_id, tags, memo,
                                source_url, source_name, copied_from)
    values (auth.uid(), btrim(p_recipe ->> 'title'), coalesce(p_recipe ->> 'visibility', 'group'),
            nullif(p_recipe ->> 'servings', '')::int, nullif(p_recipe ->> 'cook_minutes', '')::int,
            nullif(p_recipe ->> 'category_id', '')::uuid, v_tags, nullif(btrim(p_recipe ->> 'memo'), ''),
            nullif(btrim(p_recipe ->> 'source_url'), ''), nullif(btrim(p_recipe ->> 'source_name'), ''), v_copied)
    returning id into rid;
  else
    update public.recipes
       set title = btrim(p_recipe ->> 'title'),
           visibility = coalesce(p_recipe ->> 'visibility', 'group'),
           servings = nullif(p_recipe ->> 'servings', '')::int,
           cook_minutes = nullif(p_recipe ->> 'cook_minutes', '')::int,
           category_id = nullif(p_recipe ->> 'category_id', '')::uuid,
           tags = v_tags,
           memo = nullif(btrim(p_recipe ->> 'memo'), ''),
           source_url = nullif(btrim(p_recipe ->> 'source_url'), ''),
           source_name = nullif(btrim(p_recipe ->> 'source_name'), '')
     where id = rid and owner_user_id = auth.uid() and deleted_at is null;
    if not found then
      raise exception 'forbidden';
    end if;
    delete from public.recipe_ingredients where recipe_id = rid;
    delete from public.recipe_steps where recipe_id = rid;
  end if;

  for it in select * from jsonb_array_elements(coalesce(p_recipe -> 'ingredients', '[]')) loop
    insert into public.recipe_ingredients (recipe_id, position, ingredient_id, name, amount, quantity, unit, optional, section)
    values (rid, idx, nullif(it ->> 'ingredient_id', '')::uuid, btrim(it ->> 'name'), coalesce(btrim(it ->> 'amount'), ''),
            nullif(it ->> 'quantity', '')::numeric, nullif(btrim(it ->> 'unit'), ''),
            coalesce((it ->> 'optional')::boolean, false), nullif(btrim(it ->> 'section'), ''));
    idx := idx + 1;
  end loop;
  idx := 0;
  for it in select * from jsonb_array_elements(coalesce(p_recipe -> 'steps', '[]')) loop
    insert into public.recipe_steps (recipe_id, position, body) values (rid, idx, btrim(it ->> 'body'));
    idx := idx + 1;
  end loop;
  return rid;
end;
$$;
revoke execute on function public.save_recipe(uuid, jsonb) from public, anon;
grant execute on function public.save_recipe(uuid, jsonb) to authenticated;

-- 削除（論理削除）。作成者と管理者
create or replace function public.delete_recipe(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_cook_user() then
    raise exception 'forbidden';
  end if;
  update public.recipes set deleted_at = now()
   where id = p_id and deleted_at is null and (owner_user_id = auth.uid() or public.is_admin());
  if not found then
    raise exception 'forbidden';
  end if;
end;
$$;
revoke execute on function public.delete_recipe(uuid) from public, anon;
grant execute on function public.delete_recipe(uuid) to authenticated;
