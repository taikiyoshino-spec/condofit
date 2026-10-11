// Fit訪問回数の数え方（純粋関数）。DB の monthly_ranking / my_month_stats と同じ規則
// 同じ日（JST）で、ひとつ前の記録から3時間以内に始まった記録は同じ来店とみなす
import { jstDateOf } from "./format.ts";

export const SAME_VISIT_HOURS = 3;

export function countVisits(performedAt: string[]): number {
  const sorted = [...performedAt].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  let visits = 0;
  let prev: string | null = null;
  for (const at of sorted) {
    const sameDay = prev !== null && jstDateOf(prev) === jstDateOf(at);
    const gapHours = prev !== null ? (new Date(at).getTime() - new Date(prev).getTime()) / 3600e3 : Infinity;
    if (!sameDay || gapHours >= SAME_VISIT_HOURS) visits++;
    prev = at;
  }
  return visits;
}
