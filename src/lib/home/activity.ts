import { formatDate } from "../date.ts";
import { TIME_SLOT_LABEL, type TimeSlot } from "../schedule/time-slots.ts";

export type ActivityRow = {
  kind: string;
  displayName: string;
  occurredAt: string;
  detail: Record<string, unknown>;
};

/** ホームの「最近の活動」の文言（重量・回数などの詳細は出さない） */
export function formatActivity(a: ActivityRow): string {
  const who = `${a.displayName}さん`;
  const d = a.detail;
  if (a.kind === "visited") {
    const count = Number(d.exercise_count ?? 0);
    const first = typeof d.first_exercise_name === "string" ? d.first_exercise_name : null;
    if (count === 0 || !first) return `${who}がFitに行きました`;
    return count === 1 ? `${who}が${first}を記録しました` : `${who}が${first}ほか${count - 1}種目を記録しました`;
  }
  if (a.kind === "schedule_created") {
    const date = typeof d.date === "string" ? formatDate(d.date, { withWeekday: false }) : "";
    return `${who}が${date}${TIME_SLOT_LABEL[d.time_slot as TimeSlot] ?? ""}の予定を作成しました`;
  }
  return `${who}の活動`;
}
