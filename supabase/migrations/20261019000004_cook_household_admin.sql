-- CondoCook: 家族の管理（管理者）（2026-10-19 追加。RECIPE_SPEC.md D5・D6、docs/CONDOCOOK_1A_DESIGN.md 1.2）
-- - 管理者がメンバーを別の家族に移す・新しい家族を作る・家族の名前を変える
-- - 移したことで空になった家族は、買い物リスト・食材リスト・過去に買った物・いつもあるを移した先にまとめてから消す
--   （同じ食材が両方にあるときは移した先のものを残す。過去に買った回数は足す）

create or replace function public.admin_rename_household(p_household uuid, p_name text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;
  update public.households set name = left(btrim(p_name), 30), updated_at = now() where id = p_household;
  if not found then
    raise exception 'not_found';
  end if;
end;
$$;

-- p_household = null なら、そのメンバーの名前で新しい家族を作って移す。移した先の家族の ID を返す
create or replace function public.admin_move_to_household(p_user uuid, p_household uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_group uuid;
  v_old uuid;
  v_target uuid := p_household;
  v_name text;
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;
  select gm.group_id, u.display_name into v_group, v_name
    from public.group_members gm join public.users u on u.id = gm.user_id
   where gm.user_id = p_user and gm.removed_at is null;
  if not found or v_group <> (select group_id from public.group_members where user_id = auth.uid() and removed_at is null) then
    raise exception 'not_found';
  end if;
  if v_target is null then
    insert into public.households (group_id, name) values (v_group, left(v_name, 30)) returning id into v_target;
  elsif not exists (select 1 from public.households where id = v_target and group_id = v_group) then
    raise exception 'not_found';
  end if;

  select household_id into v_old from public.household_members where user_id = p_user;
  if v_old = v_target then
    return v_target;
  end if;
  insert into public.household_members (user_id, household_id) values (p_user, v_target)
  on conflict (user_id) do update set household_id = excluded.household_id, joined_at = now();

  -- 空になった家族のものを移した先にまとめる
  if v_old is not null and not exists (select 1 from public.household_members where household_id = v_old) then
    update public.shopping_items set household_id = v_target where household_id = v_old;

    delete from public.pantry_items s
     where s.household_id = v_old and exists (
       select 1 from public.pantry_items t where t.household_id = v_target
          and ((s.ingredient_id is not null and t.ingredient_id = s.ingredient_id)
               or (s.ingredient_id is null and t.ingredient_id is null and lower(t.name) = lower(s.name))));
    update public.pantry_items set household_id = v_target where household_id = v_old;

    update public.household_purchases t
       set times = t.times + s.times, last_bought_on = greatest(t.last_bought_on, s.last_bought_on)
      from public.household_purchases s
     where s.household_id = v_old and t.household_id = v_target
       and ((s.ingredient_id is not null and t.ingredient_id = s.ingredient_id)
            or (s.ingredient_id is null and t.ingredient_id is null and lower(t.name) = lower(s.name)));
    delete from public.household_purchases s
     where s.household_id = v_old and exists (
       select 1 from public.household_purchases t where t.household_id = v_target
          and ((s.ingredient_id is not null and t.ingredient_id = s.ingredient_id)
               or (s.ingredient_id is null and t.ingredient_id is null and lower(t.name) = lower(s.name))));
    update public.household_purchases set household_id = v_target where household_id = v_old;

    delete from public.household_staples s
     where s.household_id = v_old
       and exists (select 1 from public.household_staples t where t.household_id = v_target and t.ingredient_id = s.ingredient_id);
    update public.household_staples set household_id = v_target where household_id = v_old;

    delete from public.households where id = v_old;
  end if;
  return v_target;
end;
$$;

revoke execute on function public.admin_rename_household(uuid, text) from public, anon;
revoke execute on function public.admin_move_to_household(uuid, uuid) from public, anon;
grant execute on function public.admin_rename_household(uuid, text) to authenticated;
grant execute on function public.admin_move_to_household(uuid, uuid) to authenticated;
