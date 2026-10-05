import { test } from "node:test";
import assert from "node:assert/strict";
import { swipeDirection } from "../src/lib/client/swipe.ts";

test("横に十分動いたらスワイプ", () => {
  assert.equal(swipeDirection(-80, 5), "left");
  assert.equal(swipeDirection(90, -10), "right");
});

test("短い動き・縦スクロールはスワイプにしない", () => {
  assert.equal(swipeDirection(-40, 0), null);
  assert.equal(swipeDirection(-80, 70), null, "斜め（縦に近い）");
  assert.equal(swipeDirection(5, 200), null);
});
