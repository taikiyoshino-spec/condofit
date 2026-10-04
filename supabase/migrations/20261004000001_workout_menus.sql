-- トレーニングメニュー（自分専用）。記録の前に選んで、セットごとに「できた／できなかった」で進める
-- sets は [{weight_kg, reps, duration_min, distance_km}] の配列（各値は任意）

create table public.workout_menus (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.users (id),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workout_menus_name_len check (char_length(btrim(name)) between 1 and 40)
);
create index workout_menus_user_idx on public.workout_menus (user_id, updated_at desc);

create table public.workout_menu_items (
  id uuid primary key default gen_random_uuid(),
  menu_id uuid not null references public.workout_menus (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id),
  display_order int not null default 0,
  sets jsonb not null default '[]'::jsonb,
  constraint workout_menu_items_sets_array check (jsonb_typeof(sets) = 'array' and jsonb_array_length(sets) <= 30)
);
create index workout_menu_items_menu_idx on public.workout_menu_items (menu_id);

create trigger workout_menus_updated_at before update on public.workout_menus
  for each row execute function public.set_updated_at();

create or replace function public.owns_menu(p_menu_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.workout_menus where id = p_menu_id and user_id = auth.uid())
    and public.is_member()
$$;

alter table public.workout_menus enable row level security;
alter table public.workout_menu_items enable row level security;
revoke all on public.workout_menus, public.workout_menu_items from anon, authenticated;

-- 自分のメニューだけ読み書きできる
grant select, insert, delete on public.workout_menus to authenticated;
grant update (name) on public.workout_menus to authenticated;
create policy workout_menus_own on public.workout_menus for all to authenticated
  using (user_id = auth.uid() and public.is_member())
  with check (user_id = auth.uid() and public.is_member());

grant select, insert, update, delete on public.workout_menu_items to authenticated;
create policy workout_menu_items_own on public.workout_menu_items for all to authenticated
  using (public.owns_menu(menu_id)) with check (public.owns_menu(menu_id));

-- メニューを種目・セットごと一括保存（本人のみ。RLSが適用される）
-- p_items: [{"exercise_id": uuid, "sets": [{"weight_kg","reps","duration_min","distance_km"}]}]（配列の順が表示順）
create or replace function public.save_workout_menu(p_menu_id uuid, p_name text, p_items jsonb) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  mid uuid := p_menu_id;
  it jsonb;
  idx int := 0;
begin
  if mid is null then
    insert into public.workout_menus (user_id, name) values (auth.uid(), btrim(p_name)) returning id into mid;
  else
    update public.workout_menus set name = btrim(p_name) where id = mid and user_id = auth.uid();
    if not found then
      raise exception 'forbidden';
    end if;
    delete from public.workout_menu_items where menu_id = mid;
  end if;

  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    insert into public.workout_menu_items (menu_id, exercise_id, display_order, sets)
    values (mid, (it ->> 'exercise_id')::uuid, idx, coalesce(it -> 'sets', '[]'::jsonb));
    idx := idx + 1;
  end loop;
  return mid;
end;
$$;

revoke execute on function public.owns_menu(uuid), public.save_workout_menu(uuid, text, jsonb) from public, anon;
grant execute on function public.owns_menu(uuid), public.save_workout_menu(uuid, text, jsonb) to authenticated;
