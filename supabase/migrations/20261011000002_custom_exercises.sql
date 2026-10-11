-- 自分専用の種目（自由入力）
-- - 種目マスタ（owner_user_id が null）とは別に、メンバーが自分用の種目を名前・タイプを決めて作れる
-- - 本人にしか見えない（RLS）。ランキングの種目数・内訳、最近の活動の種目名には含めない
-- - 部位は持たない（種目選択の「自分の種目」に出る）

alter table public.exercises add column owner_user_id uuid references public.users (id);
alter table public.exercises alter column body_part_id drop not null;
alter table public.exercises add constraint exercises_part_or_owner check (owner_user_id is not null or body_part_id is not null);
alter table public.exercises add constraint exercises_name_len check (char_length(btrim(name)) between 1 and 40);

-- 名前の一意性はマスタ内・各個人内でそれぞれ
drop index public.exercises_name_key;
create unique index exercises_name_key on public.exercises (coalesce(owner_user_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));
create index exercises_owner_idx on public.exercises (owner_user_id) where owner_user_id is not null;

-- 見えるのはマスタと自分の種目だけ
drop policy exercises_select on public.exercises;
create policy exercises_select on public.exercises for select to authenticated
  using (public.is_member() and (owner_user_id is null or owner_user_id = auth.uid()));

-- マスタの追加・変更は管理者（自分専用の種目は対象外）
drop policy exercises_admin_insert on public.exercises;
create policy exercises_admin_insert on public.exercises for insert to authenticated
  with check (public.is_admin() and owner_user_id is null);
drop policy exercises_admin_update on public.exercises;
create policy exercises_admin_update on public.exercises for update to authenticated
  using (public.is_admin() and owner_user_id is null) with check (public.is_admin() and owner_user_id is null);

-- メンバーは自分専用の種目を作れる（部位なし）
create policy exercises_own_insert on public.exercises for insert to authenticated
  with check (public.is_member() and owner_user_id = auth.uid() and body_part_id is null);

-- ランキングの「種目の数」はマスタの種目だけ数える
create or replace function public.monthly_ranking(p_month date)
returns table (user_id uuid, display_name text, visits int, exercise_kinds int)
language sql stable security invoker set search_path = public as $$
  with bounds as (
    select date_trunc('month', p_month)::date as s,
           (date_trunc('month', p_month) + interval '1 month')::date as e
  ),
  sess as (
    select ts.id, ts.user_id
    from public.training_sessions ts, bounds b
    where (ts.performed_at at time zone 'Asia/Tokyo')::date >= b.s
      and (ts.performed_at at time zone 'Asia/Tokyo')::date < b.e
  )
  select u.id, u.display_name,
    (select count(*) from sess where sess.user_id = u.id)::int,
    (select count(distinct se.exercise_id)
       from public.session_exercises se
       join sess on sess.id = se.session_id
       join public.exercises ex on ex.id = se.exercise_id and ex.owner_user_id is null
      where sess.user_id = u.id)::int
  from public.users u
  join public.group_members gm on gm.user_id = u.id and gm.removed_at is null
  where u.deactivated_at is null
$$;

-- 最近の活動の種目名・種目数もマスタの種目だけ（自分専用の種目名は他の人に出さない）
create or replace function public.recent_activity()
returns table (kind text, actor_user_id uuid, display_name text, occurred_at timestamptz, detail jsonb)
language sql stable security invoker set search_path = public as $$
  select * from (
    select 'visited'::text, ts.user_id, u.display_name, ts.created_at,
           jsonb_build_object(
             'session_id', ts.id,
             'exercise_count', (select count(distinct se.exercise_id) from public.session_exercises se
                                join public.exercises ex on ex.id = se.exercise_id and ex.owner_user_id is null
                                where se.session_id = ts.id),
             'first_exercise_name', (select ex.name from public.session_exercises se
                                     join public.exercises ex on ex.id = se.exercise_id and ex.owner_user_id is null
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

revoke execute on function public.monthly_ranking(date), public.recent_activity() from public, anon;
grant execute on function public.monthly_ranking(date), public.recent_activity() to authenticated;
