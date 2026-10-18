import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanIngredientName, matchIngredient, normalizeFood, searchIngredients } from "../src/lib/cook/ingredients.ts";

const list = [
  { id: "1", name: "鶏もも肉", reading: "とりももにく", aliases: ["鶏もも", "とりもも", "チキンもも"] },
  { id: "2", name: "鶏むね肉", reading: "とりむねにく", aliases: ["鶏むね"] },
  { id: "3", name: "鶏皮", reading: "とりかわ", aliases: [] },
  { id: "4", name: "しょうゆ", reading: "しょうゆ", aliases: ["醤油", "濃口しょうゆ"] },
  { id: "5", name: "しょうが", reading: "しょうが", aliases: ["生姜", "おろし生姜"] },
  { id: "6", name: "卵", reading: "たまご", aliases: ["たまご", "溶き卵"] },
];

test("normalizeFood: カタカナ・全角・空白の違いを無視", () => {
  assert.equal(normalizeFood("トリ モモ"), "とりもも");
  assert.equal(normalizeFood("ＴＯＭＡＴＯ"), "tomato");
});

test("searchIngredients: 「トリ」で鶏の部位が候補に出る（短い名前から）", () => {
  assert.deepEqual(searchIngredients("トリ", list).map((i) => i.name), ["鶏皮", "鶏もも肉", "鶏むね肉"]);
  assert.deepEqual(searchIngredients("しょう", list).map((i) => i.name), ["しょうゆ", "しょうが"]);
  assert.equal(searchIngredients("醤油", list)[0].name, "しょうゆ", "完全一致が先頭");
  assert.deepEqual(searchIngredients("むね", list).map((i) => i.name), ["鶏むね肉"], "部分一致");
  assert.deepEqual(searchIngredients(" ", list), []);
});

test("cleanIngredientName: 材料名の飾りを外す", () => {
  assert.equal(cleanIngredientName("鶏もも肉（皮なし）"), "鶏もも肉");
  assert.equal(cleanIngredientName("★しょうゆ"), "しょうゆ");
  assert.equal(cleanIngredientName("A 醤油"), "醤油");
  assert.equal(cleanIngredientName("しょうが（チューブ可）"), "しょうが");
});

test("matchIngredient: 名前・読み・別名の完全一致で当てはめる", () => {
  assert.equal(matchIngredient("鶏もも肉", list)?.id, "1");
  assert.equal(matchIngredient("とりもも", list)?.id, "1");
  assert.equal(matchIngredient("濃口しょうゆ", list)?.id, "4");
  assert.equal(matchIngredient("鶏もも肉（皮なし）", list)?.id, "1");
  assert.equal(matchIngredient("●溶き卵", list)?.id, "6");
  assert.equal(matchIngredient("鶏", list), null, "あいまいなものは当てはめない");
  assert.equal(matchIngredient("牛肉", list), null);
});
