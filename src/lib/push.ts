import "server-only";
import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

export type PushMessage = { title: string; body: string; url?: string; tag?: string };
type Category = "check_in" | "location_stale" | "comment" | "schedule" | "cook_cooked" | "cook_reaction" | "cook_new_recipe" | "cook_shopping";

let configured: boolean | null = null;
function configure() {
  if (configured !== null) return configured;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    configured = false;
    return false;
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:admin@example.com", publicKey, privateKey);
  configured = true;
  return true;
}

/**
 * 指定ユーザーへWeb Pushを送る（ベストエフォート）。
 * 通知設定でOFFのカテゴリ、利用停止ユーザー、失効した購読には送らない。
 */
export async function sendPush(userIds: string[], category: Category, message: PushMessage) {
  if (userIds.length === 0 || !configure()) return;
  const admin = createAdminClient();

  const { data: settings } = await admin
    .from("notification_settings")
    .select("user_id, check_in, location_stale, comment, schedule, cook_cooked, cook_reaction, cook_new_recipe, cook_shopping, users!inner(deactivated_at)")
    .in("user_id", userIds)
    .is("users.deactivated_at", null);
  let enabled = (settings ?? []).filter((s) => s[category]).map((s) => s.user_id as string);
  if (enabled.length === 0) return;

  // CondoFit の通知は CondoCook だけの人（家族）には送らない
  let members = admin.from("group_members").select("user_id").in("user_id", enabled).is("removed_at", null);
  if (!category.startsWith("cook_")) members = members.eq("apps", "all");
  const { data: active } = await members;
  const allowed = new Set((active ?? []).map((m) => m.user_id as string));
  enabled = enabled.filter((id) => allowed.has(id));
  // CondoCook の通知は、CondoCook を一度でも開いた人（家族ができている人）にだけ送る。
  // CondoFit だけ使っている人に届くと、押したときに CondoFit のアプリの中でレシピの画面が開いてしまうため
  if (category.startsWith("cook_") && enabled.length > 0) {
    const { data: cookUsers } = await admin.from("household_members").select("user_id").in("user_id", enabled);
    const opened = new Set((cookUsers ?? []).map((m) => m.user_id as string));
    enabled = enabled.filter((id) => opened.has(id));
  }
  if (enabled.length === 0) return;

  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, keys")
    .in("user_id", enabled)
    .is("revoked_at", null);

  const payload = JSON.stringify(message);
  await Promise.all(
    (subs ?? []).map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint as string, keys: sub.keys as { p256dh: string; auth: string } },
          payload,
          { TTL: 60 * 60 },
        );
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await admin.from("push_subscriptions").update({ revoked_at: new Date().toISOString() }).eq("id", sub.id);
        } else {
          console.error("push failed", status);
        }
      }
    }),
  );
}
