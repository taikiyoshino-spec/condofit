-- 位置確認が途切れたチェックインの自動チェックアウト（2026-10-18 追加。仕様6章「自動チェックアウトは行わない」を改訂）
-- 最後の位置確認から1時間以上たったチェックインをチェックアウトする。cronから呼ぶ。
-- チェックアウト時刻は最後に位置を確認できた時刻（実際にFitにいたと分かる最後の時刻）にする
create or replace function public.auto_check_out_stale_check_ins()
returns integer
language plpgsql security definer set search_path = public as $$
declare
  n integer;
begin
  update public.check_ins
     set status = 'checked_out', checked_out_at = last_location_verified_at
   where status = 'active'
     and last_location_verified_at <= now() - interval '1 hour';
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function public.auto_check_out_stale_check_ins() from public, anon, authenticated;
