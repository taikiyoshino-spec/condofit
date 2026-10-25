import { test } from "node:test";
import assert from "node:assert/strict";
import { factLines, monthReviewFacts, monthReviewPrompt, type ReviewSession } from "../src/lib/records/review.ts";

const parts = [
  { id: "chest", name: "胸", cardio: false, freeWeight: false },
  { id: "back", name: "背中", cardio: false, freeWeight: false },
  { id: "legs", name: "脚", cardio: false, freeWeight: false },
  { id: "free", name: "フリーウェイト", cardio: false, freeWeight: true },
  { id: "aero", name: "有酸素", cardio: true, freeWeight: false },
];
const w = (weight_kg: number, reps: number) => ({ weight_kg, reps, duration_min: null, distance_km: null });
const c = (duration_min: number, distance_km: number | null) => ({ weight_kg: null, reps: null, duration_min, distance_km });
const bench = (...entries: ReturnType<typeof w>[]) => ({ exerciseId: "bench", exerciseName: "ベンチプレス", type: "weight" as const, bodyPartId: "chest", custom: false, entries });
const row = (...entries: ReturnType<typeof w>[]) => ({ exerciseId: "row", exerciseName: "ローイング", type: "weight" as const, bodyPartId: "back", custom: false, entries });
const run = (min: number, km: number | null) => ({ exerciseId: "run", exerciseName: "ランニング", type: "cardio" as const, bodyPartId: "aero", custom: false, entries: [c(min, km)] });
const s = (performedAt: string, ...exercises: ReviewSession["exercises"]): ReviewSession => ({ userId: "u", performedAt, exercises });

test("月のふりかえり: 回数・前の月・部位・自己ベスト・初めての種目", () => {
  const sessions = [
    s("2026-08-20T01:00:00Z", bench(w(50, 10))),
    s("2026-09-03T01:00:00Z", bench(w(55, 8)), run(20, 3)),
    s("2026-09-03T03:00:00Z", row(w(30, 10))), // 同じ日・3時間以内は同じ来店
    s("2026-09-30T16:00:00Z", bench(w(60, 5), w(55, 8)), run(30, 4.5)), // JSTでは10/1なので10月
    s("2026-09-30T10:00:00Z", bench(w(57.5, 6))),
  ];
  const f = monthReviewFacts(sessions, "2026-09", parts)!;
  assert.equal(f.visits, 2);
  assert.equal(f.prevVisits, 1);
  assert.deepEqual(f.parts, [{ name: "胸", sets: 2 }, { name: "背中", sets: 1 }]);
  assert.deepEqual(f.skippedParts, ["脚"], "フリーウェイトは部位として数えない");
  assert.deepEqual(f.cardio, { days: 1, minutes: 20, distanceKm: 3 });
  assert.deepEqual(f.bests, [{ exercise: "ベンチプレス", value: "57.5kg×6回", previous: "50kg×10回" }], "前の月までの最高と比べる。10/1（JST）の60kgは入れない");
  assert.deepEqual(f.newExercises, ["ランニング", "ローイング"]);
  assert.deepEqual(f.topExercises[0], { name: "ベンチプレス", count: 2 });
});

test("月のふりかえり: その月の記録がなければ null。記録を始めた月は前の月・初めての種目なし", () => {
  assert.equal(monthReviewFacts([s("2026-08-20T01:00:00Z", bench(w(50, 10)))], "2026-09", parts), null);
  const f = monthReviewFacts([s("2026-09-10T01:00:00Z", bench(w(50, 10)))], "2026-09", parts)!;
  assert.equal(f.prevVisits, null);
  assert.deepEqual(f.newExercises, []);
  assert.deepEqual(f.bests, [], "比べる記録がないので自己ベストにしない");
  assert.equal(factLines(f)[0], "Fit 1回（記録を始めた月）");
});

test("月のふりかえり: 同じ重さで回数が増えたのも自己ベスト。有酸素は距離を優先", () => {
  const f = monthReviewFacts(
    [
      s("2026-08-01T01:00:00Z", bench(w(60, 5)), run(30, 4)),
      s("2026-09-01T01:00:00Z", bench(w(60, 6)), run(25, 4.2)),
    ],
    "2026-09",
    parts,
  )!;
  assert.deepEqual(
    f.bests.map((b) => `${b.exercise} ${b.value}/${b.previous}`),
    ["ベンチプレス 60kg×6回/60kg×5回", "ランニング 4.2km/4km"],
  );
});

test("ふりかえりの依頼文: 数字はまとめから。名前は入れない", () => {
  const f = monthReviewFacts([s("2026-08-01T01:00:00Z", bench(w(50, 10))), s("2026-09-01T01:00:00Z", bench(w(52.5, 10)))], "2026-09", parts)!;
  const p = monthReviewPrompt(f);
  assert.match(p, /2026年9月/);
  assert.match(p, /Fit 1回（前の月 1回）/);
  assert.match(p, /自己ベスト: ベンチプレス 52.5kg×10回（前は50kg×10回）/);
});

test("月のふりかえり: 前の月との部位・有酸素の比較、重さの流れ、通うペース", () => {
  // 新しい順に渡しても古い順に並べ直して数える
  const sessions = [
    s("2026-09-28T01:00:00Z", bench(w(60, 8)), row(w(25, 10))),
    s("2026-09-20T01:00:00Z", row(w(30, 10))),
    s("2026-09-06T01:00:00Z", bench(w(55, 8)), row(w(30, 10))),
    s("2026-09-02T01:00:00Z", bench(w(55, 8))),
    s("2026-08-25T01:00:00Z", bench(w(50, 10), w(50, 10)), row(w(30, 10)), run(30, 4)),
  ];
  const f = monthReviewFacts(sessions, "2026-09", parts)!;
  assert.deepEqual(f.prevParts, [{ name: "胸", sets: 2 }, { name: "背中", sets: 1 }]);
  assert.deepEqual(f.prevCardio, { days: 1, minutes: 30 });
  assert.deepEqual(f.weightChanges, [
    { exercise: "ベンチプレス", from: "50kg×10回", to: "60kg×8回", up: true },
    { exercise: "ローイング", from: "30kg×10回", to: "25kg×10回", up: false },
  ], "前の月までの最後から、その月の最後まで。上がった種目が先");
  assert.deepEqual(f.pace, { perWeek: 0.9, longestGap: { days: 14, from: "2026-09-06", to: "2026-09-20" } });
  const lines = factLines(f);
  assert.ok(lines.includes("通うペース: 週0.9回・いちばん空いたのは14日（9/6〜9/20）"));
  assert.ok(lines.includes("筋トレ: 胸3セット（前の月2）・背中3セット（前の月1）"));
  assert.ok(lines.includes("しなかった部位: 脚"));
  assert.ok(lines.includes("有酸素: なし（前の月 1日・30分）"));
  assert.ok(lines.includes("重さの流れ: ベンチプレス 50kg×10回→60kg×8回、ローイング 30kg×10回→25kg×10回"));
});

test("月のふりかえり: 記録を始めた月の重さの流れはその月の最初と最後。前に保存したふりかえり（新しい項目なし）も出せる", () => {
  const f = monthReviewFacts([s("2026-09-01T01:00:00Z", bench(w(50, 10))), s("2026-09-15T01:00:00Z", bench(w(50, 12)))], "2026-09", parts)!;
  assert.equal(f.prevParts, null);
  assert.deepEqual(f.weightChanges, [{ exercise: "ベンチプレス", from: "50kg×10回", to: "50kg×12回", up: true }]);
  assert.deepEqual(monthReviewFacts([s("2026-09-01T01:00:00Z", bench(w(50, 10)))], "2026-09", parts)!.pace, { perWeek: 0.2, longestGap: null });
  const { prevParts: _a, prevCardio: _b, weightChanges: _c, pace: _d, ...old } = f;
  assert.deepEqual(factLines(old), ["Fit 2回（記録を始めた月）", "筋トレ: 胸2セット", "しなかった部位: 背中・脚", "よくやった種目: ベンチプレス（2回）"]);
});
