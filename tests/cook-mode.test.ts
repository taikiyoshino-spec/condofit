import { test } from "node:test";
import assert from "node:assert/strict";
import { findTimers, formatSeconds, ingredientsInStep, voiceCommand } from "../src/lib/cook/cook-mode.ts";

const secs = (s: string) => findTimers(s).map((t) => t.seconds);

test("findTimers: 手順の文から時間を見つける", () => {
  assert.deepEqual(secs("中火で5分煮る"), [300]);
  assert.deepEqual(secs("30秒ほど炒め、さらに２〜３分蒸し焼きにする"), [30, 180]);
  assert.deepEqual(secs("1時間半寝かせる"), [5400]);
  assert.deepEqual(secs("1時間30分煮込む"), [5400]);
  assert.deepEqual(secs("三分ゆでる"), [180], "漢数字");
  assert.deepEqual(secs("5分煮て、ふたをしてまた5分"), [300], "同じ長さは1つ");
  assert.deepEqual(secs("1/2分"), []);
  assert.deepEqual(secs("全体の5分の1を残す"), []);
  assert.deepEqual(secs("十分に冷ます"), [], "「十分」は時間ではない");
  assert.deepEqual(secs("切る"), []);
  assert.equal(findTimers("弱火で10分")[0].label, "10分");
});

test("voiceCommand", () => {
  assert.equal(voiceCommand("次"), "next");
  assert.equal(voiceCommand("ツギ"), "next");
  assert.equal(voiceCommand("次へ進む"), "next");
  assert.equal(voiceCommand("戻る"), "prev");
  assert.equal(voiceCommand("前に戻って"), "prev");
  assert.equal(voiceCommand("もう一回"), "repeat");
  assert.equal(voiceCommand("おいしそう"), null);
});

test("formatSeconds", () => {
  assert.equal(formatSeconds(245), "4:05");
  assert.equal(formatSeconds(3723), "1:02:03");
  assert.equal(formatSeconds(-3), "0:00");
  assert.equal(formatSeconds(0.2), "0:01", "端数は切り上げ（0になるまで表示）");
});

test("ingredientsInStep: 手順に出てくる材料", () => {
  const ings = [{ name: "鶏もも肉" }, { name: "★しょうゆ" }, { name: "卵" }, { name: "玉ねぎ" }];
  assert.deepEqual(ingredientsInStep("鶏もも肉を切り、しょうゆをもみ込む", ings).map((i) => i.name), ["鶏もも肉", "★しょうゆ"]);
  assert.deepEqual(ingredientsInStep("タマネギを薄切りにする", ings), [], "漢字とカタカナで表記が違うものは出さない");
});
