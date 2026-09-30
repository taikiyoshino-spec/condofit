import { formatDate } from "../date.ts";
import { INTENTION_LABEL, TIME_SLOT_LABEL, type Intention, type TimeSlot } from "../schedule/time-slots.ts";

export type NotificationRow = {
  id: string;
  type: string;
  actorName: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
  readAt: string | null;
};

const slot = (v: unknown) => TIME_SLOT_LABEL[v as TimeSlot] ?? "";
const day = (v: unknown) => (typeof v === "string" ? formatDate(v, { withWeekday: false }) : "");

/** 通知の表示文言と遷移先 */
export function formatNotification(n: NotificationRow): { text: string; sub?: string; href: string } {
  const who = n.actorName ? `${n.actorName}さん` : "メンバー";
  const p = n.payload;
  const scheduleHref = typeof p.schedule_id === "string" ? `/schedule/s/${p.schedule_id}` : "/schedule";

  switch (n.type) {
    case "check_in":
      return { text: `${who}がFitにチェックインしました`, href: "/?fit=1" };
    case "location_stale":
      return { text: "位置情報を15分間確認できませんでした。まだFitにいますか？", href: "/?fit=1" };
    case "schedule_join":
      return {
        text: `${who}が予定に「${INTENTION_LABEL[p.intention as Intention] ?? "参加"}」で参加しました`,
        sub: `${day(p.date)} ${slot(p.time_slot)}`,
        href: scheduleHref,
      };
    case "schedule_cancel":
      return { text: `${who}が予定の参加をキャンセルしました`, sub: `${day(p.date)} ${slot(p.time_slot)}`, href: scheduleHref };
    case "schedule_update": {
      const sameDay = p.old_date === p.new_date;
      const to = sameDay ? slot(p.new_time_slot) : `${day(p.new_date)} ${slot(p.new_time_slot)}`;
      return {
        text: `${who}が予定を変更しました`,
        sub: `${day(p.old_date)} ${slot(p.old_time_slot)} → ${to}`,
        href: scheduleHref,
      };
    }
    case "schedule_delete":
      return { text: `${who}が予定を削除しました`, sub: `${day(p.date)} ${slot(p.time_slot)}の予定`, href: scheduleHref };
    default:
      return { text: "お知らせがあります", href: "/" };
  }
}
