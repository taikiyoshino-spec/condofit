import { test } from "node:test";
import assert from "node:assert/strict";
import {
  detectPersonalBests,
  estimate1rm,
  formatDelta,
  formatMetric,
  progressSeries,
  sessionMetrics,
  summarizeProgress,
} from "../src/lib/records/progress.ts";

const w = (weight_kg: number | null, reps: number | null) => ({ weight_kg, reps, duration_min: null, distance_km: null });
const c = (duration_min: number | null, distance_km: number | null) => ({ weight_kg: null, reps: null, duration_min, distance_km });

test("1セッションの指標: 最大重量（同重量なら回数の多い方）・総挙上量・推定MAX", () => {
  const m = sessionMetrics([w(40, 10), w(50, 8), w(60, 5), w(60, 6)]);
  assert.equal(m.maxWeight, 60);
  assert.equal(m.repsAtMax, 6);
  assert.equal(m.volume, 40 * 10 + 50 * 8 + 60 * 5 + 60 * 6);
  assert.equal(m.e1rm, 72); // 60 × (1 + 6/30)
});

test("回数のない行は総挙上量・推定MAXに入れない", () => {
  const m = sessionMetrics([w(80, null), w(50, 10)]);
  assert.equal(m.maxWeight, 80);
  assert.equal(m.volume, 500);
  assert.equal(m.e1rm, 66.7);
  assert.equal(sessionMetrics([w(null, null)]).volume, null);
});

test("推定MAX: 1回はそのまま、16回以上は出さない", () => {
  assert.equal(estimate1rm(100, 1), 100);
  assert.equal(estimate1rm(50, 10), 66.7);
  assert.equal(estimate1rm(20, 16), null);
  assert.equal(estimate1rm(0, 5), null);
});

test("有酸素は合計", () => {
  const m = sessionMetrics([c(20, 1.5), c(10, 0.75)]);
  assert.equal(m.duration, 30);
  assert.equal(m.distance, 2.25);
});

test("グラフ用の点: 古い順、値のない日は除く、最高記録に印", () => {
  const s = progressSeries(
    [
      { date: "2026-09-15", entries: [w(55, 5)] },
      { date: "2026-09-01", entries: [w(50, 8)] },
      { date: "2026-09-08", entries: [w(null, null)] },
      { date: "2026-09-22", entries: [w(55, 6)] },
    ],
    "maxWeight",
  );
  assert.deepEqual(s.map((p) => p.date), ["2026-09-01", "2026-09-15", "2026-09-22"]);
  assert.deepEqual(s.map((p) => p.isBest), [false, true, false], "同値なら最初に到達した日");
  assert.equal(s[1].repsAtMax, 5);
});

test("自己ベスト更新: 過去の最高を上回った指標だけ。初記録は対象外", () => {
  const past = [[w(50, 8)], [w(55, 5), w(50, 5)]];
  const pbs = detectPersonalBests("weight", [w(60, 5)], past);
  assert.deepEqual(pbs.map((p) => p.metric), ["maxWeight"]);
  assert.equal(pbs[0].previous, 55);
  assert.equal(pbs[0].repsAtMax, 5);

  const both = detectPersonalBests("weight", [w(60, 5), w(60, 5)], past);
  assert.deepEqual(both.map((p) => p.metric), ["maxWeight", "volume"]);

  assert.deepEqual(detectPersonalBests("weight", [w(60, 5)], []), []);
  assert.deepEqual(detectPersonalBests("weight", [w(55, 5)], past), [], "同じ値は更新ではない");
  assert.deepEqual(detectPersonalBests("cardio", [c(40, null)], [[c(30, 3)]]).map((p) => p.metric), ["duration"]);
});

test("表示形式", () => {
  assert.equal(formatMetric("maxWeight", 60, 5), "60kg×5回");
  assert.equal(formatMetric("volume", 1100), "1,100kg");
  assert.equal(formatMetric("distance", 2.25), "2.25km");
});


test("最近の成長の要約: 重量系は最大重量、前回との差、自己ベスト", () => {
  const s = summarizeProgress("weight", [
    { date: "2026-09-01", entries: [w(50, 8)] },
    { date: "2026-09-08", entries: [w(55, 5)] },
    { date: "2026-09-15", entries: [w(60, 5)] },
  ])!;
  assert.equal(s.metric, "maxWeight");
  assert.deepEqual(s.series, [50, 55, 60]);
  assert.equal(s.latest, 60);
  assert.equal(s.latestReps, 5);
  assert.equal(s.delta, 5);
  assert.equal(s.isBest, true);

  const down = summarizeProgress("weight", [
    { date: "2026-09-01", entries: [w(60, 5)] },
    { date: "2026-09-08", entries: [w(57.5, 6)] },
  ])!;
  assert.equal(down.delta, -2.5);
  assert.equal(down.isBest, false);

  const first = summarizeProgress("weight", [{ date: "2026-09-01", entries: [w(40, 10)] }])!;
  assert.equal(first.delta, null);
  assert.equal(first.isBest, false, "初回は自己ベスト扱いにしない");
});

test("最近の成長の要約: 有酸素は時間、時間がなければ距離。値がなければ null", () => {
  assert.equal(summarizeProgress("cardio", [{ date: "2026-09-01", entries: [c(20, 2)] }])!.metric, "duration");
  assert.equal(summarizeProgress("cardio", [{ date: "2026-09-01", entries: [c(null, 2)] }])!.metric, "distance");
  assert.equal(summarizeProgress("weight", [{ date: "2026-09-01", entries: [w(null, null)] }]), null);
});

test("差の表示", () => {
  assert.equal(formatDelta("maxWeight", 2.5), "+2.5kg");
  assert.equal(formatDelta("duration", -5), "−5分");
  assert.equal(formatDelta("maxWeight", 0), "±0kg");
});
