"use server";

import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/auth/session";
import * as checkin from "@/lib/checkin/service";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { LatLng } from "@/lib/geo";

// 位置情報は引数として受け取り判定するだけ。保存・ログ出力はしない。

export async function checkInAction(position: LatLng) {
  const member = await requireMember();
  const result = await checkin.checkIn(member, position);
  if (result.ok) revalidatePath("/");
  return result;
}

export async function verifyLocationAction(position: LatLng) {
  const member = await requireMember();
  return checkin.verifyLocation(member, position);
}

export async function checkOutAction() {
  await requireMember();
  const result = await checkin.checkOut();
  revalidatePath("/");
  return result;
}

// ---- 通知設定 / Web Push 購読 ----

type Subscription = { endpoint: string; keys: { p256dh: string; auth: string } };

export async function savePushSubscriptionAction(sub: Subscription) {
  const member = await requireMember();
  if (!sub?.endpoint?.startsWith("https://") || !sub.keys?.p256dh || !sub.keys?.auth) return { ok: false };
  // 同じ端末で別ユーザーに切り替えた場合も購読を付け替えられるよう service_role で upsert
  const admin = createAdminClient();
  const { error } = await admin.from("push_subscriptions").upsert(
    { user_id: member.id, endpoint: sub.endpoint, keys: sub.keys, revoked_at: null },
    { onConflict: "endpoint" },
  );
  return { ok: !error };
}

export async function removePushSubscriptionAction(endpoint: string) {
  await requireMember();
  const supabase = await createClient();
  const { error } = await supabase
    .from("push_subscriptions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("endpoint", endpoint);
  return { ok: !error };
}

const SETTING_KEYS = ["check_in", "location_stale", "schedule"] as const;
export type NotificationSettingKey = (typeof SETTING_KEYS)[number];

export async function updateNotificationSettingAction(key: NotificationSettingKey, value: boolean) {
  const member = await requireMember();
  if (!SETTING_KEYS.includes(key)) return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase
    .from("notification_settings")
    .update({ [key]: value })
    .eq("user_id", member.id);
  return { ok: !error };
}
