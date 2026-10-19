import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAmount, scaleAmount } from "../src/lib/cook/amount.ts";

test("parseAmount: 数値と単位に分ける", () => {
  assert.deepEqual(parseAmount("300g"), { quantity: 300, unit: "g", prefix: false });
  assert.deepEqual(parseAmount("200 ml"), { quantity: 200, unit: "ml", prefix: false });
  assert.deepEqual(parseAmount("大さじ2"), { quantity: 2, unit: "大さじ", prefix: true });
  assert.deepEqual(parseAmount("大さじ1と1/2"), { quantity: 1.5, unit: "大さじ", prefix: true });
  assert.deepEqual(parseAmount("小さじ½"), { quantity: 0.5, unit: "小さじ", prefix: true });
  assert.deepEqual(parseAmount("大匙1"), { quantity: 1, unit: "大さじ", prefix: true });
  assert.deepEqual(parseAmount("1/2個"), { quantity: 0.5, unit: "個", prefix: false });
  assert.deepEqual(parseAmount("１本"), { quantity: 1, unit: "本", prefix: false }, "全角数字");
  assert.deepEqual(parseAmount("3"), { quantity: 3, unit: "", prefix: false });
  assert.deepEqual(parseAmount("1かけ"), { quantity: 1, unit: "かけ", prefix: false });
});

test("parseAmount: 換算しないもの", () => {
  for (const s of ["少々", "適量", "2〜3本", "1~2個", "", "ひとつまみ", "お好みで"]) assert.equal(parseAmount(s), null, s);
});

test("scaleAmount: 人数分に換算", () => {
  assert.equal(scaleAmount("300g", 2), "600g");
  assert.equal(scaleAmount("300g", 0.5), "150g");
  assert.equal(scaleAmount("大さじ1", 1.5), "大さじ1と1/2");
  assert.equal(scaleAmount("大さじ2", 0.5), "大さじ1");
  assert.equal(scaleAmount("小さじ1", 1 / 3), "小さじ1/3");
  assert.equal(scaleAmount("小さじ1/2", 0.5), "小さじ1/4");
  assert.equal(scaleAmount("1/2個", 3), "1と1/2個");
  assert.equal(scaleAmount("1本", 0.75), "3/4本");
  assert.equal(scaleAmount("2本", 0.4), "3/4本", "0.8本は近い分数に");
  assert.equal(scaleAmount("1枚", 0.6), "0.6枚", "どの分数にも近くなければ小数");
  assert.equal(scaleAmount("1/4個", 0.2), "0.1個", "0 にはしない");
  assert.equal(scaleAmount("150g", 0.5), "75g");
  assert.equal(scaleAmount("5g", 1.5), "7.5g", "重さは分数にしない");
  assert.equal(scaleAmount("200ml", 1 / 3), "67ml");
  assert.equal(scaleAmount("3個", 4 / 3), "4個");
  assert.equal(scaleAmount("少々", 2), "少々");
  assert.equal(scaleAmount("2〜3本", 2), "2〜3本");
  assert.equal(scaleAmount("300g", 1), "300g");
});
