import { test } from "node:test";
import assert from "node:assert/strict";
import { groupVisits, peopleOfDay, timeSlotOfHour } from "../src/lib/schedule/visits.ts";

test("時間帯の区切り（朝4〜11・昼11〜15・夕15〜18・夜18〜翌4）", () => {
  const cases: [number, string][] = [
    [3, "night"], [4, "morning"], [10, "morning"], [11, "noon"], [14, "noon"],
    [15, "evening"], [17, "evening"], [18, "night"], [23, "night"], [0, "night"],
  ];
  for (const [h, slot] of cases) assert.equal(timeSlotOfHour(h), slot, `${h}時`);
});

test("日付・時間帯ごとに行った人をまとめる（JST、同じ時間帯の重複は1人）", () => {
  const days = groupVisits([
    { userId: "a", displayName: "A", performedAt: "2026-10-01T10:00:00.000Z" }, // JST 19:00 → 夜
    { userId: "b", displayName: "B", performedAt: "2026-09-30T23:30:00.000Z" }, // JST 10/1 8:30 → 朝
    { userId: "a", displayName: "A", performedAt: "2026-10-01T11:00:00.000Z" }, // JST 20:00 → 夜（重複）
    { userId: "a", displayName: "A", performedAt: "2026-10-01T17:30:00.000Z" }, // JST 10/2 2:30 → 10/2 の夜
  ]);
  const d1 = days.get("2026-10-01")!;
  assert.deepEqual(d1.morning.map((p) => p.userId), ["b"]);
  assert.deepEqual(d1.night.map((p) => p.userId), ["a"]);
  assert.deepEqual(d1.noon, []);
  assert.deepEqual(days.get("2026-10-02")!.night.map((p) => p.userId), ["a"]);
});

test("その日に行った人は時間帯をまたいでも1人", () => {
  const days = groupVisits([
    { userId: "a", displayName: "A", performedAt: "2026-10-01T00:00:00.000Z" }, // JST 9:00 朝
    { userId: "a", displayName: "A", performedAt: "2026-10-01T10:00:00.000Z" }, // JST 19:00 夜
    { userId: "b", displayName: "B", performedAt: "2026-10-01T03:00:00.000Z" }, // JST 12:00 昼
  ]);
  assert.deepEqual(peopleOfDay(days.get("2026-10-01")).map((p) => p.userId), ["a", "b"]);
  assert.deepEqual(peopleOfDay(undefined), []);
});
