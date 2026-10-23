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

test("filterRecipes: お気に入り・作りたいの一覧（onlyIds）", () => {
  const rows = [
    { id: "a", title: "親子丼", ownerId: "me", categoryId: null, tags: [], ingredientNames: [] },
    { id: "b", title: "唐揚げ", ownerId: "x", categoryId: null, tags: [], ingredientNames: [] },
  ];
  const opt = { scope: "all" as const, q: "", categoryId: null, myId: "me", householdIds: ["me"] };
  assert.deepEqual(filterRecipes(rows, { ...opt, onlyIds: ["b"] }).map((r) => r.id), ["b"]);
  assert.deepEqual(filterRecipes(rows, { ...opt, onlyIds: [] }), []);
  assert.equal(filterRecipes(rows, opt).length, 2);
});

test("filterRecipes: 子供向けだけ", () => {
  const rows = [
    { id: "a", title: "カレー", ownerId: "me", categoryId: null, tags: ["子供向け"], ingredientNames: [] },
    { id: "b", title: "麻婆豆腐", ownerId: "me", categoryId: null, tags: ["辛い"], ingredientNames: [] },
  ];
  const opt = { scope: "all" as const, q: "", categoryId: null, myId: "me", householdIds: ["me"] };
  assert.deepEqual(filterRecipes(rows, { ...opt, kids: true }).map((r) => r.id), ["a"]);
  assert.equal(filterRecipes(rows, opt).length, 2);
});
