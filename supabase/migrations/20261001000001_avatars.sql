-- プロフィール画像
-- 画像は非公開バケットに置き、アプリのサーバー（/api/avatar）がメンバーであることを確認してから返す。
-- アップロード・削除もサーバー（service_role）経由のみ。利用者から直接 Storage を操作するポリシーは作らない。

alter table public.users add column avatar_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 524288, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
