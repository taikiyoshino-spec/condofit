-- CondoCook: 家族ごとの「いつも作る人数」（2026-10-24 追加。RECIPE_SPEC.md D18 の変更）
-- レシピ画面の「− N人分 ＋」・作るモード・買い物リストに入れる分量の最初の人数。
-- これまでは家族の人数（1人ずつの家族が多く1人分）だったが、子どものいる家族が多いため初期値は3人。家族ごとに変えられる

alter table public.households add column servings int not null default 3 check (servings between 1 and 20);

-- 自分の家族の人数を変える（家族の誰でも）
create or replace function public.set_household_servings(p_servings int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_cook_user() or public.my_household_id() is null then
    raise exception 'forbidden';
  end if;
  if p_servings is null or p_servings < 1 or p_servings > 20 then
    raise exception 'invalid';
  end if;
  update public.households set servings = p_servings, updated_at = now() where id = public.my_household_id();
end;
$$;
revoke execute on function public.set_household_servings(int) from public, anon;
grant execute on function public.set_household_servings(int) to authenticated;
