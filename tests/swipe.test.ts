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

import { shouldDismissSheet } from "../src/lib/client/swipe.ts";

test("ボトムシート: 80px以上下げたら閉じる", () => {
  assert.equal(shouldDismissSheet(100, 800), true);
  assert.equal(shouldDismissSheet(60, 800), false, "ゆっくり少しだけなら戻る");
});

test("ボトムシート: 素早く下に払えば短くても閉じる", () => {
  assert.equal(shouldDismissSheet(40, 50), true);
  assert.equal(shouldDismissSheet(20, 10), false, "短すぎる動きは閉じない");
  assert.equal(shouldDismissSheet(-50, 50), false, "上方向は閉じない");
});
