import { test } from "node:test";
import assert from "node:assert/strict";
import { dayNumber, niceTicks, pickDateTicks } from "../src/lib/records/chart-scale.ts";

test("目盛りはきりのいい数で、範囲を含む", () => {
  assert.deepEqual(niceTicks(0, 1100), [0, 500, 1000, 1500]);
  assert.deepEqual(niceTicks(0, 900), [0, 250, 500, 750, 1000]);
  assert.deepEqual(niceTicks(47.5, 62.5), [45, 50, 55, 60, 65]);
  const t = niceTicks(60, 60);
  assert.ok(t[0] <= 60 && t.at(-1)! >= 60);
});

test("日数と日付ラベルの間引き", () => {
  assert.equal(dayNumber("2026-10-01") - dayNumber("2026-09-30"), 1);
  assert.deepEqual(pickDateTicks(["a", "b", "c"]), ["a", "b", "c"]);
  const ticks = pickDateTicks(["d1", "d2", "d3", "d4", "d5", "d6", "d7"], 4);
  assert.equal(ticks[0], "d1");
  assert.equal(ticks.at(-1), "d7");
  assert.equal(ticks.length, 4);
});
