-- Fit訪問回数の数え方を変更（2026-10-11）
-- 以前: トレーニング記録の数。同じ来店で記録を2つに分けると2回になっていた
-- 以後: 同じ日（JST）で、ひとつ前の記録から3時間以内に始まった記録は同じ来店とみなす（3時間以上あけば別の来店）
-- アプリ側の countVisits（src/lib/records/visits.ts）と同じ規則

-- 記録ごとに「新しい来店か」を判定する（他の集計から使う）
create or replace function public.visit_flags(p_user uuid, p_from timestamptz, p_to timestamptz)
returns table (session_id uuid, is_new_visit boolean)
language sql stable security invoker set search_path = public as $$
  select id,
         prev is null
           or (prev at time zone 'Asia/Tokyo')::date <> (performed_at at time zone 'Asia/Tokyo')::date
           or performed_at - prev >= interval '3 hours'
  from (
    select ts.id, ts.performed_at,
           lag(ts.performed_at) over (order by ts.performed_at, ts.created_at) as prev
    from public.training_sessions ts
    where ts.user_id = p_user and ts.performed_at >= p_from and ts.performed_at < p_to
  ) x
$$;

create or replace function public.my_month_stats()
returns table (visits int, training_days int, exercise_kinds int)
language sql stable security invoker set search_path = public as $$
  with bounds as (
    select (date_trunc('month', now() at time zone 'Asia/Tokyo') at time zone 'Asia/Tokyo') as f,
           ((date_trunc('month', now() at time zone 'Asia/Tokyo') + interval '1 month') at time zone 'Asia/Tokyo') as t
  ),
  s as (
    select ts.id, (ts.performed_at at time zone 'Asia/Tokyo')::date as d
    from public.training_sessions ts, bounds b
    where ts.user_id = auth.uid() and ts.performed_at >= b.f and ts.performed_at < b.t
  )
  select
    (select count(*) from bounds b, public.visit_flags(auth.uid(), b.f, b.t) v where v.is_new_visit)::int,
    (select count(distinct d) from s)::int,
    (select count(distinct se.exercise_id) from public.session_exercises se where se.session_id in (select id from s))::int
$$;

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
  join public.group_members gm on gm.user_id = u.id and gm.removed_at is null
  where u.deactivated_at is null
$$;

revoke execute on function public.visit_flags(uuid, timestamptz, timestamptz), public.my_month_stats(), public.monthly_ranking(date) from public, anon;
grant execute on function public.visit_flags(uuid, timestamptz, timestamptz), public.my_month_stats(), public.monthly_ranking(date) to authenticated;
