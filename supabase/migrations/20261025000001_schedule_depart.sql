-- 予定の「出発します」（2026-10-25 追加）
-- 今日の予定に参加している人が出発するときに押すと、同じ予定のほかの参加者（行く！・行けたら行く）にだけ知らせる。
-- 出発した時刻は参加者の行に残し、予定の画面で「出発済み」と出す。1つの予定で1回だけ

alter table public.schedule_participants add column departed_at timestamptz;

-- 通知の種類に「出発」を足す
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'check_in', 'location_stale',
  'schedule_join', 'schedule_cancel', 'schedule_update', 'schedule_delete', 'schedule_depart',
  'day_comment',
  'cook_cooked', 'cook_comment', 'cook_favorite', 'cook_new_recipe', 'cook_shopping'
));

-- CondoFit の通知に schedule_depart を足す（CondoCook だけの家族には送らない。設定は「予定」に従う）
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
  if p_type in ('check_in', 'location_stale', 'schedule_join', 'schedule_cancel', 'schedule_update', 'schedule_delete', 'schedule_depart', 'day_comment')
     and not exists (select 1 from public.group_members gm
                     where gm.user_id = p_recipient and gm.removed_at is null and gm.apps = 'all') then
    return;
  end if;

  select case
           when p_type = 'check_in' then s.check_in
           when p_type = 'location_stale' then s.location_stale
           when p_type = 'day_comment' then s.comment
           when p_type = 'cook_cooked' then s.cook_cooked
           when p_type in ('cook_comment', 'cook_favorite') then s.cook_reaction
           when p_type = 'cook_new_recipe' then s.cook_new_recipe
           when p_type = 'cook_shopping' then s.cook_shopping
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

-- 出発する。今日の予定で、自分が参加しているときだけ。戻り値はほかの参加者の人数
create or replace function public.depart_for_schedule(p_schedule_id uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  sch record;
  prev timestamptz;
  r record;
  n int := 0;
begin
  if not public.is_member() then
    raise exception 'forbidden';
  end if;
  select id, date, time_slot, deleted_at into sch from public.schedules where id = p_schedule_id;
  if sch.id is null or sch.deleted_at is not null then
    raise exception 'schedule_deleted';
  end if;
  if sch.date <> public.jst_today() then
    raise exception 'not_today';
  end if;
  select p.departed_at into prev from public.schedule_participants p
   where p.schedule_id = p_schedule_id and p.user_id = auth.uid()
   for update;
  if not found then
    raise exception 'not_participant';
  end if;
  if prev is not null then
    raise exception 'already_departed';
  end if;

  update public.schedule_participants set departed_at = now()
   where schedule_id = p_schedule_id and user_id = auth.uid();

  for r in
    select p.user_id from public.schedule_participants p
     where p.schedule_id = p_schedule_id and p.user_id <> auth.uid()
  loop
    perform public.notify(r.user_id, 'schedule_depart', auth.uid(), jsonb_build_object(
      'schedule_id', sch.id, 'date', sch.date, 'time_slot', sch.time_slot));
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke execute on function public.depart_for_schedule(uuid) from public, anon;
grant execute on function public.depart_for_schedule(uuid) to authenticated;

-- 出発の時刻は depart_for_schedule でだけ入れる（参加するときに入れられないように）
drop policy schedule_participants_insert on public.schedule_participants;
create policy schedule_participants_insert on public.schedule_participants for insert to authenticated
  with check (user_id = auth.uid() and public.is_member() and departed_at is null);
