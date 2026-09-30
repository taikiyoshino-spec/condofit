import { test } from "node:test";
import assert from "node:assert/strict";
import { formatEntry, fromJstInputValue, jstDateOf, parseNumber, toJstInputValue } from "../src/lib/records/format.ts";

const e = (weight_kg: number | null, reps: number | null, duration_min: number | null = null, distance_km: number | null = null) =>
  ({ weight_kg, reps, duration_min, distance_km });

test("重量系の表示（片方だけ・なしも可）", () => {
  assert.equal(formatEntry("weight", e(60, 5)), "60kg × 5回");
  assert.equal(formatEntry("weight", e(42.5, null)), "42.5kg");
  assert.equal(formatEntry("weight", e(null, 10)), "10回");
  assert.equal(formatEntry("weight", e(null, null)), null);
});

test("有酸素の表示（存在する値のみ）", () => {
  assert.equal(formatEntry("cardio", e(null, null, 20, 1.5)), "20分 / 1.5km");
  assert.equal(formatEntry("cardio", e(null, null, 30, null)), "30分");
  assert.equal(formatEntry("cardio", e(null, null, null, 3)), "3km");
});

test("数値入力の変換", () => {
  assert.equal(parseNumber(""), null);
  assert.equal(parseNumber(" 42.5 "), 42.5);
  assert.equal(parseNumber("６０"), 60);
  assert.equal(parseNumber("-1"), null);
  assert.equal(parseNumber("abc"), null);
  assert.equal(parseNumber("5.5", { integer: true }), null);
  assert.equal(parseNumber("12", { integer: true }), 12);
  assert.equal(parseNumber("100000"), null);
});

test("JSTの日時入力との相互変換（日付またぎ）", () => {
  assert.equal(toJstInputValue("2026-09-29T15:30:00.000Z"), "2026-09-30T00:30");
  assert.equal(fromJstInputValue("2026-09-30T00:30"), "2026-09-29T15:30:00.000Z");
  assert.equal(fromJstInputValue("2026-09-30"), null);
  assert.equal(jstDateOf("2026-09-29T15:30:00.000Z"), "2026-09-30");
});

import { sessionRepresentative } from "../src/lib/records/format.ts";

test("代表値: 重量系は最大重量 + その重量での回数", () => {
  const rows = [e(40, 10), e(60, 5), e(60, 6), e(50, 8)];
  assert.deepEqual(sessionRepresentative("weight", rows), e(60, 6));
  assert.deepEqual(sessionRepresentative("weight", [e(null, 12), e(null, 15)]), e(null, 15));
  assert.deepEqual(sessionRepresentative("weight", [e(20, null), e(null, 30)]), e(20, null));
  assert.equal(sessionRepresentative("weight", [e(null, null)]), null);
});

test("代表値: 有酸素は合計時間 + 合計距離（片方だけなら存在する方）", () => {
  const c = (d: number | null, k: number | null) => e(null, null, d, k);
  assert.deepEqual(sessionRepresentative("cardio", [c(20, 1.5), c(10, 0.8)]), c(30, 2.3));
  assert.deepEqual(sessionRepresentative("cardio", [c(20, null), c(null, 2)]), c(20, 2));
  assert.deepEqual(sessionRepresentative("cardio", [c(15, null)]), c(15, null));
  assert.equal(sessionRepresentative("cardio", [c(null, null)]), null);
});
