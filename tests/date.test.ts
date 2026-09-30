import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addDays,
  addMonths,
  formatDate,
  isValidDateString,
  monthGrid,
  monthRange,
  todayJst,
} from "../src/lib/date.ts";

test("JSTの今日（UTC 15:00 以降は翌日）", () => {
  assert.equal(todayJst(new Date("2026-09-30T14:59:00Z")), "2026-09-30");
  assert.equal(todayJst(new Date("2026-09-30T15:00:00Z")), "2026-10-01");
});

test("日付の検証", () => {
  assert.ok(isValidDateString("2026-02-28"));
  assert.ok(!isValidDateString("2026-02-29"));
  assert.ok(isValidDateString("2028-02-29"));
  assert.ok(!isValidDateString("2026-9-1"));
  assert.ok(!isValidDateString("2026-13-01"));
});

test("日付の加算・月の加算（月またぎ・年またぎ）", () => {
  assert.equal(addDays("2026-09-30", 1), "2026-10-01");
  assert.equal(addDays("2026-01-01", -1), "2025-12-31");
  assert.equal(addMonths("2026-12", 1), "2027-01");
  assert.equal(addMonths("2026-01", -1), "2025-12");
});

test("表示形式", () => {
  assert.equal(formatDate("2026-09-28"), "9/28（月）");
  assert.equal(formatDate("2026-09-27"), "9/27（日）");
  assert.equal(formatDate("2026-09-28", { withWeekday: false }), "9/28");
});

test("月間カレンダー（2026年9月は火曜始まり・30日）", () => {
  const grid = monthGrid("2026-09");
  assert.deepEqual(grid[0].slice(0, 3), [null, null, "2026-09-01"]);
  assert.ok(grid.every((w) => w.length === 7));
  const days = grid.flat().filter(Boolean);
  assert.equal(days.length, 30);
  assert.equal(days.at(-1), "2026-09-30");
  assert.deepEqual(monthRange("2026-02"), { start: "2026-02-01", end: "2026-02-28" });
});
