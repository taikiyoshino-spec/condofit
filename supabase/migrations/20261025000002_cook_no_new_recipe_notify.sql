-- CondoCook: レシピを追加・公開しても通知しない（2026-10-25）
-- 以前は、仲間が新しいレシピを初めてグループ公開したときに、同じグループの全員へ通知していた。
-- 設定の列（notification_settings.cook_new_recipe）と通知の種類は、過去の通知が読めるよう残す

drop trigger if exists recipes_notify_published on public.recipes;
drop function if exists public.recipes_notify_published();
