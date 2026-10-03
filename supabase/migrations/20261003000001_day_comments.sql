-- 日ごとの実績コメント（予定カレンダーの今日・過去の日に、メンバーが誰でも書ける）
-- - 削除は書いた本人と管理者のみ。編集はなし
-- - 書かれたら、その日にFitに行った人と同じ日にコメントした人へアプリ内通知（プッシュなし、通知設定は「予定関連」）

create table public.day_comments (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  user_id uuid not null default auth.uid() references public.users (id),
  body text not null,
  created_at timestamptz not null default now(),
  constraint day_comments_body_len check (char_length(btrim(body)) between 1 and 500)
);
create index day_comments_date_idx on public.day_comments (date, created_at);

-- 実績へのコメントなので、未来の日には書けない
create or replace function public.day_comments_guard() returns trigger
language plpgsql as $$
begin
  if new.date > public.jst_today() then
    raise exception 'future_date' using hint = '未来の日にはコメントできません';
  end if;
  new.body := btrim(new.body);
  new.created_at := now();
  return new;
end;
$$;

create trigger day_comments_guard before insert on public.day_comments
  for each row execute function public.day_comments_guard();

-- 通知の種類に「実績コメント」を追加
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'check_in', 'location_stale',
  'schedule_join', 'schedule_cancel', 'schedule_update', 'schedule_delete',
  'day_comment'
));

create or replace function public.day_comments_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r record;
begin
  for r in
    select ts.user_id
      from public.training_sessions ts
     where (ts.performed_at at time zone 'Asia/Tokyo')::date = new.date
    union
    select c.user_id from public.day_comments c where c.date = new.date and c.id <> new.id
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

create trigger day_comments_notify after insert on public.day_comments
  for each row execute function public.day_comments_notify();

alter table public.day_comments enable row level security;
revoke all on public.day_comments from anon, authenticated;
grant select, insert, delete on public.day_comments to authenticated;

create policy day_comments_select on public.day_comments for select to authenticated
  using (public.is_member());
create policy day_comments_insert on public.day_comments for insert to authenticated
  with check (user_id = auth.uid() and public.is_member());
create policy day_comments_delete on public.day_comments for delete to authenticated
  using ((user_id = auth.uid() and public.is_member()) or public.is_admin());

revoke execute on function public.day_comments_guard() from public, anon, authenticated;
revoke execute on function public.day_comments_notify() from public, anon, authenticated;

alter publication supabase_realtime add table public.day_comments;
