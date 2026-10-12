import { test } from "node:test";
import assert from "node:assert/strict";
import { partBalance, partScore, weakestParts, type PartSession } from "../src/lib/records/parts.ts";

const parts = [
  { id: "chest", name: "胸" },
  { id: "back", name: "背中" },
  { id: "legs", name: "脚" },
  { id: "cardio", name: "有酸素" },
];
const cardioParts = new Set(["cardio"]);
const set = () => ({ duration_min: null, distance_km: null });
const ex = (exerciseId: string, bodyPartId: string | null, n: number, opts: Partial<{ type: "weight" | "cardio"; custom: boolean; minutes: number; km: number }> = {}) => ({
  exerciseId,
  exerciseName: exerciseId,
  type: opts.type ?? ("weight" as const),
  bodyPartId,
  custom: opts.custom ?? false,
  entries: opts.type === "cardio" ? [{ duration_min: opts.minutes ?? null, distance_km: opts.km ?? null }] : Array.from({ length: n }, set),
});
const sessions: PartSession[] = [
  { userId: "a", performedAt: "2026-10-01T10:00:00Z", exercises: [ex("bench", "chest", 3), ex("row", "back", 2), ex("run", "cardio", 1, { type: "cardio", minutes: 20, km: 3 })] },
  { userId: "a", performedAt: "2026-10-05T10:00:00Z", exercises: [ex("bench", "chest", 4), ex("kettle", null, 2, { custom: true }), ex("run", "cardio", 1, { type: "cardio", minutes: 30, km: 4.5 })] },
];

test("部位バランス: 筋トレは部位ごとのセット数、有酸素は日数・時間・距離、自分の種目は別", () => {
  const b = partBalance(sessions, parts, cardioParts);
  assert.deepEqual(b.strength.map((p) => [p.name, p.sets, p.lastDate]), [["胸", 7, "2026-10-05"], ["背中", 2, "2026-10-01"], ["脚", 0, null]]);
  assert.deepEqual(b.cardio, { days: 2, minutes: 50, distanceKm: 7.5, lastDate: "2026-10-05" });
  assert.equal(b.customSets, 2);
});

test("少ない部位: セット数の少ない順（同数なら最後にやった日が古い方）、記録がなければ出さない", () => {
  const b = partBalance(sessions, parts, cardioParts);
  assert.deepEqual(weakestParts(b.strength).map((p) => p.name), ["脚", "背中"]);
  assert.deepEqual(weakestParts(partBalance([], parts, cardioParts).strength), []);
});

test("部位別ランキングの値: 筋トレはセット数と種目の内訳、有酸素の部位は合計時間、自分の種目は数えない", () => {
  const chest = partScore(sessions, "chest", false);
  assert.equal(chest.value, 7);
  assert.deepEqual(chest.breakdown, [{ exerciseId: "bench", name: "bench", value: 7 }]);
  const cardio = partScore(sessions, "cardio", true);
  assert.equal(cardio.value, 50);
  assert.equal(partScore(sessions, "legs", false).value, 0);
});
