import { test } from "node:test";
import assert from "node:assert/strict";
import { groupShoppingItems, type ShoppingItem } from "../src/lib/cook/shopping.ts";

const item = (over: Partial<ShoppingItem>): ShoppingItem => ({
  id: Math.random().toString(36).slice(2),
  ingredientId: null,
  name: "",
  category: "その他",
  amount: "",
  recipeTitle: null,
  bought: false,
  ...over,
});

test("groupShoppingItems: 同じ食材は1行にまとめ、レシピと分量を添える（足し算はしない）", () => {
  const { pending, bought } = groupShoppingItems([
    item({ id: "1", ingredientId: "chicken", name: "鶏もも肉", category: "肉", amount: "300g", recipeTitle: "親子丼" }),
    item({ id: "2", ingredientId: "chicken", name: "鶏もも肉", category: "肉", amount: "500g", recipeTitle: "唐揚げ" }),
    item({ id: "3", name: "キッチンペーパー" }),
    item({ id: "4", ingredientId: "onion", name: "玉ねぎ", category: "野菜", amount: "1個" }),
    item({ id: "5", name: "ｷｯﾁﾝﾍﾟｰﾊﾟｰ" }),
    item({ id: "6", ingredientId: "onion", name: "玉ねぎ", category: "野菜", bought: true }),
  ]);
  assert.deepEqual(
    pending.map((g) => [g.name, g.ids, g.sources]),
    [
      ["鶏もも肉", ["1", "2"], ["親子丼 300g", "唐揚げ 500g"]],
      ["玉ねぎ", ["4"], ["1個"]],
      ["キッチンペーパー", ["3", "5"], []],
    ],
    "売り場の分類順（肉→野菜→その他）。マスタにないものは表記ゆれをそろえてまとめる",
  );
  assert.deepEqual(bought.map((g) => g.ids), [["6"]], "買ったものは別にまとめる");
});
