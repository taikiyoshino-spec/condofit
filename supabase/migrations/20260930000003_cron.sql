-- 定期処理: 毎分 Next.js の /api/cron/tick を呼ぶ（15分確認通知・期限切れ通知の削除）
-- 事前に Vault へ次の2つを登録すること（未登録の間は何もしない）:
--   select vault.create_secret('https://<アプリのドメイン>', 'condofit_app_origin');
--   select vault.create_secret('<CRON_SECRET と同じ値>', 'condofit_cron_secret');

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create or replace function public.invoke_cron_tick() returns void
language plpgsql security definer set search_path = public as $$
declare
  origin text;
  secret text;
begin
  select decrypted_secret into origin from vault.decrypted_secrets where name = 'condofit_app_origin';
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'condofit_cron_secret';
  if origin is null or secret is null then
    return;
  end if;
  perform net.http_post(
    url := rtrim(origin, '/') || '/api/cron/tick',
    headers := jsonb_build_object('Authorization', 'Bearer ' || secret, 'Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
end;
$$;
revoke execute on function public.invoke_cron_tick() from public, anon, authenticated;

select cron.schedule('condofit-tick', '* * * * *', 'select public.invoke_cron_tick()');
