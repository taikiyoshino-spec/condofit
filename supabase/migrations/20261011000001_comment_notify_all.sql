-- 実績コメントの通知を全員に（書いた本人以外）。通知設定に「コメント」を独立して追加（初期値オン）
-- プッシュ通知はアプリのサーバー側で送る（通知設定の comment を見る）

alter table public.notification_settings add column comment boolean not null default true;
grant update (comment) on public.notification_settings to authenticated;

-- 通知の種類ごとに見る設定: コメントは comment、それ以外は従来どおり
create or replace function public.notify(
  p_recipient uuid, p_type text, p_actor uuid, p_payload jsonb
) returns void
language plpgsql security definer set search_path = public as $$
declare
  enabled boolean;
begin
  if p_recipient is null or p_recipient = p_actor then
    return; -- 自分自身には通知しない
  end if;

  select case
           when p_type = 'check_in' then s.check_in
           when p_type = 'location_stale' then s.location_stale
           when p_type = 'day_comment' then s.comment
           else s.schedule
         end
    into enabled
  from public.notification_settings s
  join public.users u on u.id = s.user_id
  where s.user_id = p_recipient and u.deactivated_at is null;

  if coalesce(enabled, false) then
    insert into public.notifications (recipient_user_id, type, actor_user_id, payload)
    values (p_recipient, p_type, p_actor, p_payload);
  end if;
end;
$$;
revoke execute on function public.notify(uuid, text, uuid, jsonb) from public, anon, authenticated;

-- コメントが書かれたら、利用中のメンバー全員（本人以外）へ
create or replace function public.day_comments_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r record;
begin
  for r in
    select gm.user_id
      from public.group_members gm
     where gm.removed_at is null and gm.user_id <> new.user_id
  loop
    perform public.notify(r.user_id, 'day_comment', new.user_id, jsonb_build_object(
      'date', new.date,
      'comment_id', new.id,
      'excerpt', left(new.body, 40)
    ));
  end loop;
  return new;
end;
$$;
revoke execute on function public.day_comments_notify() from public, anon, authenticated;
