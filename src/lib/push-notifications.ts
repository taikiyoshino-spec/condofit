import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPush } from "@/lib/push";
import { formatNotification } from "@/lib/notifications/format";

/**
 * DBトリガーが作ったアプリ内通知と同じ相手・同じ内容でプッシュを送る（送り先がずれないように）。
 * 予定の操作のあとに呼ぶ。対象は「この人の操作で、この予定について、since 以降に作られた通知」。
 */
export async function pushScheduleNotifications(actorId: string, actorName: string, scheduleId: string, since: Date) {
  const admin = createAdminClient();
  // サーバーとDBの時計のわずかなずれを見込んで1秒前から（連続操作で前の通知を再送しないよう短く）
  const from = new Date(since.getTime() - 1000).toISOString();
  const { data } = await admin
    .from("notifications")
    .select("recipient_user_id, type, payload")
    .eq("actor_user_id", actorId)
    .in("type", ["schedule_join", "schedule_cancel", "schedule_update", "schedule_delete", "schedule_depart"])
    .eq("payload->>schedule_id", scheduleId)
    .gte("created_at", from);
  if (!data?.length) return;

  // 同じ内容ごとにまとめて送る
  const groups = new Map<string, { type: string; payload: Record<string, unknown>; recipients: string[] }>();
  for (const n of data) {
    const key = `${n.type}:${JSON.stringify(n.payload)}`;
    const g = groups.get(key) ?? { type: n.type as string, payload: (n.payload ?? {}) as Record<string, unknown>, recipients: [] };
    g.recipients.push(n.recipient_user_id as string);
    groups.set(key, g);
  }
  for (const g of groups.values()) {
    const f = formatNotification({ id: "", type: g.type, actorName, payload: g.payload, createdAt: "", readAt: null });
    await sendPush(g.recipients, "schedule", { title: f.text, body: f.sub ?? "", url: f.href, tag: `schedule-${scheduleId}` });
  }
}
