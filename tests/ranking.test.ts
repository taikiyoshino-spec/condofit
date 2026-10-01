import { test } from "node:test";
import assert from "node:assert/strict";
import { assignRanks, byDesc } from "../src/lib/ranking.ts";

type Row = { name: string; visits: number; kinds: number };
const rows: Row[] = [
  { name: "A", visits: 3, kinds: 2 },
  { name: "B", visits: 8, kinds: 5 },
  { name: "C", visits: 3, kinds: 6 },
  { name: "D", visits: 0, kinds: 0 },
];

test("大きい順に並べ、同じ値は同順位（次の順位は飛ばす）", () => {
  const r = assignRanks(rows, byDesc((x) => x.visits));
  assert.deepEqual(r.map((x) => [x.name, x.rank]), [["B", 1], ["A", 2], ["C", 2], ["D", 4]]);
});

test("第2キーで同順位を解消できる", () => {
  const r = assignRanks(rows, byDesc((x) => x.visits, (x) => x.kinds));
  assert.deepEqual(r.map((x) => [x.name, x.rank]), [["B", 1], ["C", 2], ["A", 3], ["D", 4]]);
});

test("null は最後", () => {
  const r = assignRanks([{ v: null }, { v: 10 }, { v: 5 }], byDesc((x: { v: number | null }) => x.v));
  assert.deepEqual(r.map((x) => [x.v, x.rank]), [[10, 1], [5, 2], [null, 3]]);
});

test("全員0なら全員1位", () => {
  const r = assignRanks([{ v: 0 }, { v: 0 }], byDesc((x: { v: number }) => x.v));
  assert.deepEqual(r.map((x) => x.rank), [1, 1]);
});
