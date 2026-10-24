import { test } from "node:test";
import assert from "node:assert/strict";
import { expiryLabel, expiryStatus, suggestRecipes, usedPantryItems } from "../src/lib/cook/pantry.ts";

const today = "2026-10-19";

test("期限の表示", () => {
  assert.equal(expiryStatus("2026-10-18", today), "expired");
  assert.equal(expiryStatus("2026-10-21", today), "soon");
  assert.equal(expiryStatus("2026-10-22", today), "ok");
  assert.equal(expiryStatus(null, today), "none");
  assert.equal(expiryLabel("2026-10-18", today), "期限切れ");
  assert.equal(expiryLabel("2026-10-19", today), "今日まで");
  assert.equal(expiryLabel("2026-10-20", today), "あと1日");
  assert.equal(expiryLabel("2026-11-03", today), "11/3まで");
  assert.equal(expiryLabel("2026-11-01", "2026-10-31"), "あと1日", "月をまたぐ");
  assert.equal(expiryLabel("2027-02-01", today), "2/1まで", "年をまたいでも11か月未満は月日");
  assert.equal(expiryLabel("2027-09-18", today), "9/18まで", "11か月に1日足りない");
  assert.equal(expiryLabel("2027-09-19", today), "11か月以上先");
  assert.equal(expiryLabel("2027-10-18", today), "11か月以上先", "1年に1日足りない");
  assert.equal(expiryLabel("2027-10-19", today), "1年以上先");
  assert.equal(expiryLabel("2036-10-17", today), "9年以上先", "塩など（3650日）");
});

const ing = (name: string, ingredientId: string | null = name, optional = false) => ({ ingredientId, name, optional });
const recipe = (id: string, ingredients: ReturnType<typeof ing>[], fav = 0) => ({ id, ingredients, favoriteCount: fav, cookedCount: 0 });

test("suggestRecipes: 買う物が少ない順 → 期限が近い食材を使う順 → 人気。最近作ったものは下げる", () => {
  const pantry = [
    { ingredientId: "chicken", name: "鶏もも肉", expiresOn: "2026-10-20" },
    { ingredientId: "egg", name: "卵", expiresOn: "2026-10-30" },
    { ingredientId: null, name: "長ねぎ", expiresOn: null },
  ];
  const recipes = [
    recipe("oyako", [ing("鶏もも肉", "chicken"), ing("卵", "egg"), ing("玉ねぎ", "onion"), ing("しょうゆ", "soy"), ing("三つ葉", "mitsuba", true)]),
    recipe("tamago", [ing("卵", "egg"), ing("ネギ", null)], 5),
    recipe("karaage", [ing("鶏もも肉", "chicken"), ing("片栗粉", "starch")], 3),
    recipe("curry", [ing("牛肉", "beef"), ing("玉ねぎ", "onion")]),
    recipe("tamagoyaki", [ing("卵", "egg")], 1),
  ];
  const s = suggestRecipes(recipes, { pantry, staples: ["soy"], recentIds: ["tamagoyaki"], today });
  assert.deepEqual(
    s.map((x) => x.recipe.id),
    ["karaage", "oyako", "tamago", "tamagoyaki"],
    "買う物1つが先。そのうち期限が近い鶏肉を使うものが先（同じなら人気順）。家にある食材を使わないカレーは出さない。最近作った卵焼きは最後",
  );
  assert.deepEqual(s.find((x) => x.recipe.id === "oyako")!.toBuy, ["玉ねぎ"], "いつもある・なくても可は買う物に入れない");
  assert.deepEqual(s.find((x) => x.recipe.id === "oyako")!.expiring, ["鶏もも肉"]);
  assert.deepEqual(s.find((x) => x.recipe.id === "tamago")!.toBuy, ["ネギ"], "マスタにない名前は表記が違うと別物");
  assert.equal(s.find((x) => x.recipe.id === "tamagoyaki")!.recent, true);
});

test("usedPantryItems: 使った家にある食材（いつもあるものは除く）", () => {
  const pantry = [
    { ingredientId: "chicken", name: "鶏もも肉", expiresOn: null },
    { ingredientId: "soy", name: "しょうゆ", expiresOn: null },
    { ingredientId: null, name: "長ねぎ", expiresOn: null },
  ];
  const used = usedPantryItems([ing("鶏もも肉", "chicken"), ing("しょうゆ", "soy"), ing("長ねぎ", null), ing("卵", "egg")], pantry, ["soy"]);
  assert.deepEqual(used.map((p) => p.name), ["鶏もも肉", "長ねぎ"]);
});

test("suggestRecipes: 「または」はどれか1つあればよい", () => {
  const pantry = [{ ingredientId: "cut", name: "カット野菜", expiresOn: null }, { ingredientId: "pork", name: "豚肉", expiresOn: null }];
  const alt = (name: string, id: string) => ({ ...ing(name, id), orPrevious: true });
  const s = suggestRecipes(
    [
      recipe("a", [ing("豚肉", "pork"), ing("キャベツ", "cabbage"), alt("カット野菜", "cut")]),
      recipe("b", [ing("豚肉", "pork"), ing("キャベツ", "cabbage"), alt("白菜", "hakusai"), ing("しょうゆ", "soy"), alt("めんつゆ", "tsuyu")]),
    ],
    { pantry, staples: ["soy"], recentIds: [], today },
  );
  assert.deepEqual(s.find((x) => x.recipe.id === "a")!.toBuy, [], "カット野菜があるのでキャベツは買わない");
  assert.deepEqual(s.find((x) => x.recipe.id === "b")!.toBuy, ["キャベツか白菜"], "どちらもなければ「AかB」。しょうゆ（いつもある）があればめんつゆは不要");
});
