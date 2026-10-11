import { test } from "node:test";
import assert from "node:assert/strict";
import { countVisits } from "../src/lib/records/visits.ts";

test("同じ日時の記録が2つあっても1回", () => {
  assert.equal(countVisits(["2026-10-02T11:20:00Z", "2026-10-02T11:20:00Z"]), 1);
});

test("同じ日でも3時間以上あけば別の来店", () => {
  // JST 8:00 と 20:00
  assert.equal(countVisits(["2026-10-02T23:00:00Z", "2026-10-03T11:00:00Z"]), 2);
  // JST 19:00 と 21:30（2.5時間）は1回
  assert.equal(countVisits(["2026-10-02T10:00:00Z", "2026-10-02T12:30:00Z"]), 1);
});

test("日をまたげば別の来店（JSTで判定）", () => {
  // JST 10/2 23:30 と 10/3 0:30
  assert.equal(countVisits(["2026-10-02T14:30:00Z", "2026-10-02T15:30:00Z"]), 2);
});

test("amiさんの今月のケース: 10件の記録 → 7回", () => {
  const jst = (s: string) => new Date(`${s}:00+09:00`).toISOString();
  const rows = ["2026-10-01T22:38", "2026-10-02T20:20", "2026-10-02T20:20", "2026-10-03T18:46", "2026-10-05T21:27", "2026-10-05T21:27", "2026-10-06T12:15", "2026-10-07T20:27", "2026-10-07T20:27", "2026-10-11T20:30"].map(jst);
  assert.equal(countVisits(rows), 7);
  assert.equal(countVisits([]), 0);
});
