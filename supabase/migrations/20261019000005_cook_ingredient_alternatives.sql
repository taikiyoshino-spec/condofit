-- CondoCook: 材料の「または」（2026-10-19 追加）
-- 「キャベツ 1/2玉 または カット野菜 1袋」のように、材料を直前の材料の代わりとして登録できるようにする。
-- or_previous = true の材料は直前の材料の代わり。続けて並んだものを1つの選択肢のまとまりとして扱う
-- （買い物リストにはどれか1つを入れる。提案では、どれか1つが家にあれば「ある」）

alter table public.recipe_ingredients add column or_previous boolean not null default false;

-- save_recipe（20261018000005）に or_previous を足す
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
    insert into public.recipe_ingredients (recipe_id, position, ingredient_id, name, amount, quantity, unit, optional, section, or_previous)
    values (rid, idx, nullif(it ->> 'ingredient_id', '')::uuid, btrim(it ->> 'name'), coalesce(btrim(it ->> 'amount'), ''),
            nullif(it ->> 'quantity', '')::numeric, nullif(btrim(it ->> 'unit'), ''),
            coalesce((it ->> 'optional')::boolean, false), nullif(btrim(it ->> 'section'), ''),
            -- 最初の材料と、まとまり（タレなど）の最初の材料は「または」にできない
            idx > 0 and coalesce((it ->> 'or_previous')::boolean, false)
              and nullif(btrim(it ->> 'section'), '') is not distinct from
                  (select section from public.recipe_ingredients where recipe_id = rid and position = idx - 1));
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
