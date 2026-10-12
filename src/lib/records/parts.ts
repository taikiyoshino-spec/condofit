// 部位ごとの集計（純粋関数）。成長タブの「部位のバランス」とランキングの「部位別」で共通
// - 筋トレ（重量系）は部位ごとのセット数（記録した行の数）
// - 有酸素（種目タイプ cardio）は部位に関係なく、日数・合計時間・合計距離
// - 自分専用の種目（部位なし）は「自分の種目」として別に数える（ランキングでは数えない）
import { jstDateOf } from "./format.ts";

export type PartSessionExercise = {
  exerciseId: string;
  exerciseName: string;
  type: "weight" | "cardio";
  bodyPartId: string | null;
  custom: boolean;
  entries: { duration_min: number | null; distance_km: number | null }[];
};
export type PartSession = { userId: string; performedAt: string; exercises: PartSessionExercise[] };
export type BodyPartRef = { id: string; name: string };

export type PartBalance = {
  strength: { partId: string; name: string; sets: number; lastDate: string | null }[];
  cardio: { days: number; minutes: number; distanceKm: number; lastDate: string | null };
  customSets: number;
};

const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

/** 1人分の部位バランス。parts は表示順（マスタの部位）。筋トレの部位に有酸素の種目しかない部位は出さない */
export function partBalance(sessions: PartSession[], parts: BodyPartRef[], cardioPartIds: Set<string>): PartBalance {
  const sets = new Map<string, number>();
  const last = new Map<string, string>();
  const cardioDays = new Set<string>();
  let minutes = 0;
  let distance = 0;
  let cardioLast: string | null = null;
  let customSets = 0;

  for (const s of sessions) {
    const date = jstDateOf(s.performedAt);
    for (const ex of s.exercises) {
      if (ex.type === "cardio") {
        cardioDays.add(date);
        for (const e of ex.entries) {
          minutes += e.duration_min ?? 0;
          distance += e.distance_km ?? 0;
        }
        if (!cardioLast || date > cardioLast) cardioLast = date;
        continue;
      }
      if (ex.custom || !ex.bodyPartId) {
        customSets += ex.entries.length;
        continue;
      }
      sets.set(ex.bodyPartId, (sets.get(ex.bodyPartId) ?? 0) + ex.entries.length);
      const prev = last.get(ex.bodyPartId);
      if (!prev || date > prev) last.set(ex.bodyPartId, date);
    }
  }

  return {
    strength: parts
      .filter((p) => !cardioPartIds.has(p.id))
      .map((p) => ({ partId: p.id, name: p.name, sets: sets.get(p.id) ?? 0, lastDate: last.get(p.id) ?? null })),
    cardio: { days: cardioDays.size, minutes: round(minutes), distanceKm: round(distance, 2), lastDate: cardioLast },
    customSets,
  };
}

/** いちばん少ない部位（同数なら最後にやった日が古い方）。全部0なら null（まだ記録がない） */
export function weakestParts(strength: PartBalance["strength"], count = 2): PartBalance["strength"] {
  if (strength.every((p) => p.sets === 0)) return [];
  return [...strength]
    .sort((a, b) => a.sets - b.sets || (a.lastDate ?? "").localeCompare(b.lastDate ?? ""))
    .slice(0, count);
}

/**
 * ランキングの部位別: その部位の値（筋トレはセット数、有酸素の部位は合計時間）と、その部位の種目の内訳。
 * 自分専用の種目は数えない。
 */
export function partScore(
  sessions: PartSession[],
  partId: string,
  isCardioPart: boolean,
): { value: number; breakdown: { exerciseId: string; name: string; value: number }[] } {
  const byExercise = new Map<string, { exerciseId: string; name: string; value: number }>();
  for (const s of sessions) {
    for (const ex of s.exercises) {
      if (ex.custom || ex.bodyPartId !== partId) continue;
      const add = isCardioPart ? ex.entries.reduce((sum, e) => sum + (e.duration_min ?? 0), 0) : ex.entries.length;
      const cur = byExercise.get(ex.exerciseId) ?? { exerciseId: ex.exerciseId, name: ex.exerciseName, value: 0 };
      cur.value = round(cur.value + add);
      byExercise.set(ex.exerciseId, cur);
    }
  }
  const breakdown = [...byExercise.values()].filter((b) => b.value > 0).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, "ja"));
  return { value: round(breakdown.reduce((sum, b) => sum + b.value, 0)), breakdown };
}
