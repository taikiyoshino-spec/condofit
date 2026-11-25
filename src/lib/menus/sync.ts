// メニューの重さ・負荷を変えたとき、ほかのメニューの同じ種目にも合わせる（純粋関数）
import type { Entry } from "../records/format.ts";

/** 合わせる値: 重量系の重さ・有酸素の負荷 */
export type SyncField = "weight_kg" | "load";
export const SYNC_FIELDS: SyncField[] = ["weight_kg", "load"];

/** 「この種目のこの値（from）を to に変えた」 */
export type ValueChange = { exerciseId: string; field: SyncField; from: number; to: number };

type Items = { exerciseId: string; sets: Partial<Entry>[] }[];

const value = (s: Partial<Entry> | undefined, field: SyncField): number | null => {
  const v = s?.[field];
  return v === null || v === undefined ? null : Number(v);
};

/**
 * 編集の前後から、変えた値を取り出す。
 * 同じ種目の何個目か・何セット目かで前後を対応させる（並べ替えても同じ種目どうしで比べる）。
 * 同じ値を別々の値に変えたとき（40kg → 45kg と 40kg → 50kg）は、どちらにすればよいか決まらないので出さない
 */
export function valueChanges(before: Items, after: Items): ValueChange[] {
  const nth = (items: Items) => {
    const seen = new Map<string, number>();
    return items.map((it) => {
      const n = seen.get(it.exerciseId) ?? 0;
      seen.set(it.exerciseId, n + 1);
      return { key: `${it.exerciseId}#${n}`, it };
    });
  };
  const beforeByKey = new Map(nth(before).map(({ key, it }) => [key, it]));

  const found = new Map<string, ValueChange>();
  const conflicts = new Set<string>();
  for (const { key, it } of nth(after)) {
    const prev = beforeByKey.get(key);
    if (!prev) continue;
    it.sets.forEach((s, j) => {
      for (const field of SYNC_FIELDS) {
        const from = value(prev.sets[j], field);
        const to = value(s, field);
        if (from === null || to === null || from === to) continue;
        const id = `${it.exerciseId}|${field}|${from}`;
        const same = found.get(id);
        if (same && same.to !== to) conflicts.add(id);
        else found.set(id, { exerciseId: it.exerciseId, field, from, to });
      }
    });
  }
  return [...found.entries()].filter(([id]) => !conflicts.has(id)).map(([, c]) => c);
}

/** ほかのメニューに当てはめた結果。count は変わるセットの数 */
export type AppliedChange = ValueChange & { count: number };

/** 同じ種目で、変える前と同じ値のセットだけを変える。違う値のセットには触らない */
export function applyValueChanges<T extends Items[number]>(items: T[], changes: ValueChange[]): { items: T[]; applied: AppliedChange[] } {
  const counts = new Map<ValueChange, number>();
  const next = items.map((it) => ({
    ...it,
    sets: it.sets.map((s) => {
      let out = s;
      for (const c of changes) {
        if (c.exerciseId !== it.exerciseId || value(s, c.field) !== c.from) continue;
        out = { ...out, [c.field]: c.to };
        counts.set(c, (counts.get(c) ?? 0) + 1);
      }
      return out;
    }),
  }));
  const applied = changes.filter((c) => counts.has(c)).map((c) => ({ ...c, count: counts.get(c)! }));
  return { items: next, applied };
}
