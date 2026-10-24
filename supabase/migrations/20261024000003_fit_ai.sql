-- 月のふりかえり（2026-10-24 追加）
-- 成長タブで、先月の記録のまとめ（数字はアプリで数えたもの）と、AIが書いたひと言を出す。
-- 毎回AIに頼まないよう、1人1か月に1つ保存する。
-- 書き込みはアプリのサーバー（service_role）だけ。本人は自分の分を読むだけ

create table public.monthly_reviews (
  user_id uuid not null references public.users (id) on delete cascade,
  month text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  facts jsonb not null,
  comment text check (char_length(comment) <= 400),
  tip text check (char_length(tip) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, month)
);
create trigger monthly_reviews_updated_at before update on public.monthly_reviews
  for each row execute function public.set_updated_at();

alter table public.monthly_reviews enable row level security;
revoke all on public.monthly_reviews from anon, authenticated;
grant select on public.monthly_reviews to authenticated;
create policy monthly_reviews_own on public.monthly_reviews for select to authenticated
  using (user_id = auth.uid() and public.is_member());

-- AIの利用記録（2026-10-24 追加）
-- Gemini には残りの回数を問い合わせる仕組みがないため、アプリから呼んだ回数・トークン数を記録して管理画面に出す。
-- 読み書きともアプリのサーバー（service_role）だけ（管理画面は管理者か確かめてから読む）

create table public.ai_usage_logs (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  feature text not null check (char_length(feature) <= 40),
  model text not null check (char_length(model) <= 80),
  ok boolean not null,
  reason text check (char_length(reason) <= 40),
  status int,
  prompt_tokens int,
  output_tokens int,
  total_tokens int,
  duration_ms int
);
create index ai_usage_logs_created_idx on public.ai_usage_logs (created_at desc);

alter table public.ai_usage_logs enable row level security;
revoke all on public.ai_usage_logs from anon, authenticated;
