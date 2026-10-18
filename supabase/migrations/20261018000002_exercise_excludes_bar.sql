-- 「バーの重さを除いて記録する」種目（2026-10-18 追加）
-- ベンチプレスなどはバーを除いた重さで記録しているため、記録入力時に分かるように種目に印を付ける。
-- マスタの種目は管理者が（既存の更新ポリシー）、自分専用の種目は本人が下の関数で切り替える。

alter table public.exercises add column excludes_bar boolean not null default false;
-- 管理者がマスタの種目で切り替えられるよう列の更新権限を付ける（行はRLSで管理者・マスタに限定済み）
grant update (excludes_bar) on public.exercises to authenticated;

-- 自分専用の種目の「バー抜き」だけを本人が切り替える（名前・タイプなどは変えさせない）
create or replace function public.set_my_exercise_excludes_bar(p_exercise uuid, p_value boolean)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  n integer;
begin
  if not public.is_member() then
    raise exception 'forbidden';
  end if;
  update public.exercises
     set excludes_bar = p_value
   where id = p_exercise and owner_user_id = auth.uid() and type = 'weight';
  get diagnostics n = row_count;
  return n > 0;
end;
$$;
revoke execute on function public.set_my_exercise_excludes_bar(uuid, boolean) from public, anon;
grant execute on function public.set_my_exercise_excludes_bar(uuid, boolean) to authenticated;
