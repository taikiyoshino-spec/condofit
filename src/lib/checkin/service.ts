import "server-only";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isValidLatLng, isWithinGym, parseGymLocation, type LatLng } from "@/lib/geo";
import { sendPush } from "@/lib/push";
import type { Member } from "@/lib/auth/session";

export type CheckInResult =
  | { ok: true }
  | { ok: false; reason: "gym_not_configured" | "invalid_position" | "too_far" | "error" };

export type VerifyResult = { status: "verified" | "out_of_range" | "not_checked_in" | "invalid_position" | "error" };

function gymLocation() {
  return parseGymLocation(process.env.GYM_LAT, process.env.GYM_LNG);
}

/** 明示的なチェックイン。50m以内のときだけ開始する（位置情報は判定のみに使い保存しない） */
export async function checkIn(member: Member, position: LatLng): Promise<CheckInResult> {
  const gym = gymLocation();
  if (!gym) return { ok: false, reason: "gym_not_configured" };
  if (!isValidLatLng(position)) return { ok: false, reason: "invalid_position" };
  if (!isWithinGym(position, gym)) return { ok: false, reason: "too_far" };

  const admin = createAdminClient();
  const { error } = await admin.from("check_ins").insert({ user_id: member.id });
  if (error) {
    // すでにチェックイン中（一意制約）なら位置確認として扱う
    if (error.code === "23505") {
      await markVerified(member.id);
      return { ok: true };
    }
    return { ok: false, reason: "error" };
  }

  // プッシュ送信はレスポンス後に行う（アプリ内通知はDBトリガーで作成済み）
  after(async () => {
    const { data: others } = await admin
      .from("group_members")
      .select("user_id")
      .eq("group_id", member.groupId)
      .is("removed_at", null)
      .neq("user_id", member.id);
    await sendPush(
      (others ?? []).map((o) => o.user_id as string),
      "check_in",
      { title: "CondoFit", body: `${member.displayName}さんがFitにチェックインしました`, url: "/", tag: "check_in" },
    );
  });
  return { ok: true };
}

async function markVerified(userId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("check_ins")
    .update({ last_location_verified_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("status", "active")
    .select("id");
  return (data ?? []).length > 0;
}

/**
 * チェックイン中の位置再確認。50m以内なら最終位置確認時刻を更新する。
 * 圏外でも更新しないだけで、チェックアウトはしない。
 */
export async function verifyLocation(member: Member, position: LatLng): Promise<VerifyResult> {
  const gym = gymLocation();
  if (!gym || !isValidLatLng(position)) return { status: "invalid_position" };

  if (!isWithinGym(position, gym)) {
    const active = await getMyActiveCheckIn(member.id);
    return { status: active ? "out_of_range" : "not_checked_in" };
  }
  return { status: (await markVerified(member.id)) ? "verified" : "not_checked_in" };
}

export async function checkOut(): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("check_out");
  return { ok: !error };
}

async function getMyActiveCheckIn(userId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("check_ins")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  return data;
}

export type ActiveCheckIn = {
  userId: string;
  displayName: string;
  checkedInAt: string;
  lastVerifiedAt: string;
};

/** Fit中のメンバー（名前と最終位置確認時刻のみ。位置・距離は持たない） */
export async function listActiveCheckIns(): Promise<ActiveCheckIn[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("check_ins")
    .select("user_id, checked_in_at, last_location_verified_at, users!inner(display_name)")
    .eq("status", "active")
    .order("checked_in_at");
  if (error) throw error;
  return data.map((c) => ({
    userId: c.user_id as string,
    displayName: (c.users as unknown as { display_name: string }).display_name,
    checkedInAt: c.checked_in_at as string,
    lastVerifiedAt: c.last_location_verified_at as string,
  }));
}

/** 定期処理: 15分以上位置確認できないチェックインに確認通知（Fit中は維持） */
export async function notifyStaleCheckIns() {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("mark_stale_check_ins");
  if (error) throw error;
  const userIds = (data as { user_id: string }[]).map((r) => r.user_id);
  await sendPush(userIds, "location_stale", {
    title: "CondoFit",
    body: "位置情報を15分間確認できませんでした。まだFitにいますか？",
    url: "/?fit=1",
    tag: "location_stale",
  });
  return userIds.length;
}

export async function purgeExpiredNotifications() {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("purge_expired_notifications");
  if (error) throw error;
  return data as number;
}
