// 「いつ頃Fitに行ったか」の集計（純粋関数）。トレーニング記録の日時を時間帯に振り分ける（チェックインは使わない）
import { jstDateOf, jstTimeOf } from "../records/format.ts";
import { TIME_SLOTS, type TimeSlot } from "./time-slots.ts";

/**
 * JSTの時（0〜23）→ 時間帯
 * 朝 4〜10時台 / 昼 11〜14時台 / 夕 15〜17時台 / 夜 18〜23時台と0〜3時台（深夜はその日の夜）
 */
export function timeSlotOfHour(hour: number): TimeSlot {
  if (hour >= 4 && hour < 11) return "morning";
  if (hour >= 11 && hour < 15) return "noon";
  if (hour >= 15 && hour < 18) return "evening";
  return "night";
}

export type VisitRow = { userId: string; displayName: string; performedAt: string };
export type DayVisits = Record<TimeSlot, { userId: string; displayName: string }[]>;

/** 日付（JST）→ 時間帯 → 行った人（同じ時間帯に同じ人が複数回記録しても1人） */
export function groupVisits(rows: VisitRow[]): Map<string, DayVisits> {
  const sorted = [...rows].sort((a, b) => a.performedAt.localeCompare(b.performedAt));
  const days = new Map<string, DayVisits>();
  for (const r of sorted) {
    const date = jstDateOf(r.performedAt);
    const slot = timeSlotOfHour(Number(jstTimeOf(r.performedAt).slice(0, 2)));
    const day = days.get(date) ?? (Object.fromEntries(TIME_SLOTS.map((s) => [s, []])) as unknown as DayVisits);
    if (!day[slot].some((p) => p.userId === r.userId)) day[slot].push({ userId: r.userId, displayName: r.displayName });
    days.set(date, day);
  }
  return days;
}

/** その日に行った人（時間帯をまたいでも1人として、早い時間帯の順） */
export function peopleOfDay(day: DayVisits | undefined): { userId: string; displayName: string }[] {
  if (!day) return [];
  const seen = new Set<string>();
  return TIME_SLOTS.flatMap((s) => day[s]).filter((p) => (seen.has(p.userId) ? false : (seen.add(p.userId), true)));
}
