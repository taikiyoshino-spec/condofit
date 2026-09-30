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
