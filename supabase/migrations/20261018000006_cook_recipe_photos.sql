-- CondoCook: レシピの写真（2026-10-18 追加。docs/CONDOCOOK_1A_DESIGN.md 2.3）
-- 自分で撮った完成写真だけ（D12・D14）。端末側で縮小した表示用（長辺1200px）とサムネイル（長辺240px）の2枚を置く。
-- アバターと同じく非公開バケットにし、アップロード・削除・配信はアプリのサーバー（service_role）経由のみ。
-- 配信（/api/cook/photo）はそのレシピが見える人にだけ返す。

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recipe-photos', 'recipe-photos', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
