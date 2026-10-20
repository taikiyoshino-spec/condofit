import { test } from "node:test";
import assert from "node:assert/strict";
import { moveKeyTo } from "../src/lib/client/sort.ts";

const list = [1, 2, 3, 4].map((key) => ({ key }));
const keys = (l: { key: number }[]) => l.map((x) => x.key);

test("moveKeyTo: 指の位置の行の前・後ろへ動かす", () => {
  assert.deepEqual(keys(moveKeyTo(list, 1, 3, true)), [2, 3, 1, 4]);
  assert.deepEqual(keys(moveKeyTo(list, 4, 1, false)), [4, 1, 2, 3]);
  assert.deepEqual(keys(moveKeyTo(list, 2, 4, true)), [1, 3, 4, 2]);
  assert.equal(moveKeyTo(list, 2, 3, false), list, "変わらなければ同じ配列");
  assert.equal(moveKeyTo(list, 2, 2, true), list);
  assert.equal(moveKeyTo(list, 9, 2, true), list);
});
