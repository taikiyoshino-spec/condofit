-- 総合ランキング用の月間集計（Fit訪問回数 = トレーニングセッション数、種目の数）
-- 利用中のメンバー全員を返す（記録0件の人も0として含める）。順位付けはアプリ側で行う。

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
       from public.session_exercises se join sess on sess.id = se.session_id
      where sess.user_id = u.id)::int
  from public.users u
  join public.group_members gm on gm.user_id = u.id and gm.removed_at is null
  where u.deactivated_at is null
$$;

revoke execute on function public.monthly_ranking(date) from public, anon;
grant execute on function public.monthly_ranking(date) to authenticated;
