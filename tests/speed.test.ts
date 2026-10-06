import { test } from "node:test";
import assert from "node:assert/strict";
import { distanceFrom, speedFrom, stepSpeed } from "../src/lib/records/speed.ts";

test("時速と時間から距離（小数2桁）", () => {
  assert.equal(distanceFrom("30", "6"), "3");
  assert.equal(distanceFrom("20", "9"), "3");
  assert.equal(distanceFrom("25", "6.5"), "2.71");
  assert.equal(distanceFrom("", "6"), null);
  assert.equal(distanceFrom("30", ""), null);
  assert.equal(distanceFrom("30", "0"), null);
});

test("時間と距離から時速（前回の記録から）", () => {
  assert.equal(speedFrom("30", "3"), "6");
  assert.equal(speedFrom("25", "2.71"), "6.5");
  assert.equal(speedFrom("30", ""), "");
  assert.equal(speedFrom("1", "100"), "", "非現実的な速度は出さない");
});

test("時速の上下（0.1刻み、0〜30）", () => {
  assert.equal(stepSpeed("6", 0.1), "6.1");
  assert.equal(stepSpeed("6", -0.1), "5.9");
  assert.equal(stepSpeed("0", -0.1), "0");
  assert.equal(stepSpeed("", 0.1), "0.1");
  assert.equal(stepSpeed("30", 0.1), "30");
  assert.equal(stepSpeed("8.9", 0.1), "9", "浮動小数の誤差を出さない");
});
