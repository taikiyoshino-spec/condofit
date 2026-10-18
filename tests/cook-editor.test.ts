import { test } from "node:test";
import assert from "node:assert/strict";
import { ingredientsToRows, parseTags, rowsToIngredients } from "../src/lib/cook/editor.ts";

const stored = [
  { ingredientId: "a", name: "鶏もも肉", amount: "200g", optional: false, section: null },
  { ingredientId: null, name: "しょうゆ", amount: "大さじ2", optional: false, section: "タレ" },
  { ingredientId: null, name: "みりん", amount: "大さじ1", optional: true, section: "タレ" },
  { ingredientId: null, name: "ねぎ", amount: "適量", optional: true, section: null },
];

test("ingredientsToRows: まとまりが変わるところに見出し", () => {
  let k = 0;
  const rows = ingredientsToRows(stored, () => ++k);
  assert.deepEqual(rows.map((r) => `${r.kind}:${r.name}`), [
    "item:鶏もも肉",
    "heading:タレ",
    "item:しょうゆ",
    "item:みりん",
    "heading:",
    "item:ねぎ",
  ]);
});

test("rowsToIngredients: 見出しの下に section、空の見出しでまとまりを終える、空の行は除く", () => {
  let k = 0;
  const rows = ingredientsToRows(stored, () => ++k);
  rows.push({ key: 99, kind: "item", ingredientId: null, name: "  ", amount: "", optional: false });
  assert.deepEqual(rowsToIngredients(rows), stored, "保存 → 画面 → 保存で元どおり");
  // 空の見出しを消すと、そのあとの材料も「タレ」になる（画面の並びどおり）
  const withoutEnd = rows.filter((r) => !(r.kind === "heading" && r.name === ""));
  assert.equal(rowsToIngredients(withoutEnd)[3].section, "タレ");
});

test("parseTags", () => {
  assert.deepEqual(parseTags("簡単、作り置き #お弁当 簡単"), ["簡単", "作り置き", "お弁当"]);
  assert.deepEqual(parseTags("  "), []);
});
