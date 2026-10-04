// 記録入力の行・メニュー（予定のセット）まわりの純粋関数
import { parseNumber, type Entry, type ExerciseType } from "./format.ts";

/** done: 記録に残す / planned: メニューの予定でまだ未実施 / skipped: やらなかった（記録に残さない） */
export type RowStatus = "done" | "planned" | "skipped";
type Values = { weight: string; reps: string; duration: string; distance: string };
/** fromPlan の行は plan に予定の値を持つ（「元に戻す」で予定に戻すため） */
export type Row = Values & { status: RowStatus; fromPlan?: boolean; plan?: Values };
export type Block = { key: number; exerciseId: string; name: string; type: ExerciseType; rows: Row[] };

export const EMPTY_ROW: Row = { weight: "", reps: "", duration: "", distance: "", status: "done" };

const str = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n));
export const entryToRow = (e: Partial<Entry>, status: RowStatus = "done", fromPlan = false): Row => {
  const values = { weight: str(e.weight_kg), reps: str(e.reps), duration: str(e.duration_min), distance: str(e.distance_km) };
  return { ...values, status, ...(fromPlan ? { fromPlan: true, plan: values } : {}) };
};

/** 手入力の行として複製（予定の印は外す） */
export const asManualRow = (r: Row): Row => ({ weight: r.weight, reps: r.reps, duration: r.duration, distance: r.distance, status: "done" });

export function rowToEntry(r: Row): Entry {
  return {
    weight_kg: parseNumber(r.weight, { max: 999 }),
    reps: parseNumber(r.reps, { integer: true }),
    duration_min: parseNumber(r.duration),
    distance_km: parseNumber(r.distance, { max: 999 }),
  };
}

/** 保存する内容: 「done」の行だけ。done の行がない種目は記録しない */
export function blocksToExercises(blocks: Block[]): { exerciseId: string; entries: Entry[] }[] {
  return blocks
    .map((b) => ({ exerciseId: b.exerciseId, entries: b.rows.filter((r) => r.status === "done").map(rowToEntry) }))
    .filter((b) => b.entries.length > 0);
}

/** メニュー由来のセットの進み具合（やらなかった分も「済み」に数える） */
export function planProgress(blocks: Block[]): { finished: number; total: number } {
  const planRows = blocks.flatMap((b) => b.rows.filter((r) => r.fromPlan));
  return { finished: planRows.filter((r) => r.status !== "planned").length, total: planRows.length };
}

/** 回数の増減（0〜999） */
export function adjustCount(value: string, delta: number): string {
  const n = parseNumber(value, { integer: true }) ?? 0;
  return String(Math.min(999, Math.max(0, n + delta)));
}

/** メニューの項目 → 記録入力の種目ブロック（全セット「予定」） */
export function menuToBlocks(
  items: { exerciseId: string; name: string; type: ExerciseType; sets: Partial<Entry>[] }[],
  nextKey: () => number,
): Block[] {
  return items.map((it) => ({
    key: nextKey(),
    exerciseId: it.exerciseId,
    name: it.name,
    type: it.type,
    rows: it.sets.length ? it.sets.map((s) => entryToRow(s, "planned", true)) : [entryToRow({}, "planned", true)],
  }));
}
