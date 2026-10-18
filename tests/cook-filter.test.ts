import { test } from "node:test";
import assert from "node:assert/strict";
import { filterRecipes } from "../src/lib/cook/filter.ts";

const list = [
  { id: "1", title: "親子丼", ownerId: "me", categoryId: "rice", tags: ["簡単"], ingredientNames: ["鶏もも肉", "卵", "玉ねぎ"] },
  { id: "2", title: "唐揚げ", ownerId: "wife", categoryId: "main", tags: [], ingredientNames: ["鶏もも肉", "しょうゆ"] },
  { id: "3", title: "ナポリタン", ownerId: "friend", categoryId: "noodle", tags: ["子ども"], ingredientNames: ["スパゲッティ", "ケチャップ"] },
];
const base = { scope: "all" as const, q: "", categoryId: null, myId: "me", householdIds: ["me", "wife"] };
const ids = (r: { id: string }[]) => r.map((x) => x.id);

test("filterRecipes: みんな／家族／自分", () => {
  assert.deepEqual(ids(filterRecipes(list, base)), ["1", "2", "3"]);
  assert.deepEqual(ids(filterRecipes(list, { ...base, scope: "household" })), ["1", "2"]);
  assert.deepEqual(ids(filterRecipes(list, { ...base, scope: "mine" })), ["1"]);
});

test("filterRecipes: 料理名・材料名・タグで検索（カタカナ・ひらがなの違いは無視、空白区切りはすべて含む）", () => {
  assert.deepEqual(ids(filterRecipes(list, { ...base, q: "鶏もも" })), ["1", "2"]);
  assert.deepEqual(ids(filterRecipes(list, { ...base, q: "なぽりたん" })), ["3"]);
  assert.deepEqual(ids(filterRecipes(list, { ...base, q: "鶏もも　卵" })), ["1"]);
  assert.deepEqual(ids(filterRecipes(list, { ...base, q: "子ども" })), ["3"]);
});

test("filterRecipes: カテゴリ", () => {
  assert.deepEqual(ids(filterRecipes(list, { ...base, categoryId: "main" })), ["2"]);
});
