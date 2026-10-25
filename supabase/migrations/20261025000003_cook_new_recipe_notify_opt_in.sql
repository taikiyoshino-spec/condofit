-- CondoCook: 新しいレシピの通知を戻し、受け取るかどうかは最初はオフにする（2026-10-25）
-- 20261025000002 で通知そのものをやめたが、仕組みは残して、受け取りたい人だけがマイの通知設定でオンにする形にする。
-- いまの人も含めて全員オフにする（これから入る人もオフから）

alter table public.notification_settings alter column cook_new_recipe set default false;
update public.notification_settings set cook_new_recipe = false where cook_new_recipe;


-- 仲間が新しいレシピをグループ公開したら、同じグループの全員へ（初めて公開したときだけ）
create or replace function public.recipes_notify_published() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r record;
begin
  if new.published_at is null or new.deleted_at is not null
     or (tg_op = 'UPDATE' and old.published_at is not distinct from new.published_at) then
    return new;
  end if;
  for r in
    select gm.user_id
      from public.group_members gm
     where gm.removed_at is null
       and gm.group_id = (select g.group_id from public.group_members g where g.user_id = new.owner_user_id and g.removed_at is null)
  loop
    perform public.notify(r.user_id, 'cook_new_recipe', new.owner_user_id, public.recipe_notify_payload(new.id));
  end loop;
  return new;
end;
$$;
-- 公開日時は BEFORE トリガーが入れるので、列を指定せずに更新ごとに見る（列指定は SET に書いた列でしか動かない）
drop trigger if exists recipes_notify_published on public.recipes;
create trigger recipes_notify_published after insert or update on public.recipes
  for each row execute function public.recipes_notify_published();
revoke execute on function public.recipes_notify_published() from public, anon, authenticated;
