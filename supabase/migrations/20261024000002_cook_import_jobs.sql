-- CondoCook: レシピの取り込み（URL・写真）の受付（2026-10-24 追加）
-- AIでの読み取りに時間がかかり、スマホで別のアプリを開くと画面が止まって結果を受け取れないため、
-- 受け付けたらすぐ返事をして、読み取りはサーバーで続ける。画面は戻ってきたときにここを見て結果を受け取る。
-- 書き込みはアプリのサーバー（service_role）だけ。本人は自分の分を読むだけ

create table public.recipe_import_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'done', 'failed')),
  result jsonb,
  error text check (char_length(error) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index recipe_import_jobs_user_idx on public.recipe_import_jobs (user_id, created_at desc);
create trigger recipe_import_jobs_updated_at before update on public.recipe_import_jobs
  for each row execute function public.set_updated_at();

alter table public.recipe_import_jobs enable row level security;
revoke all on public.recipe_import_jobs from anon, authenticated;
grant select on public.recipe_import_jobs to authenticated;
create policy recipe_import_jobs_own on public.recipe_import_jobs for select to authenticated
  using (user_id = auth.uid() and public.is_cook_user());
