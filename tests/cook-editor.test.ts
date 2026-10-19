import { test } from "node:test";
import assert from "node:assert/strict";
import { ingredientsToRows, parseTags, rowsToIngredients } from "../src/lib/cook/editor.ts";

const stored = [
  { ingredientId: "a", name: "鶏もも肉", amount: "200g", optional: false, section: null, orPrevious: false },
  { ingredientId: null, name: "しょうゆ", amount: "大さじ2", optional: false, section: "タレ", orPrevious: false },
  { ingredientId: null, name: "めんつゆ", amount: "大さじ2", optional: false, section: "タレ", orPrevious: true },
  { ingredientId: null, name: "みりん", amount: "大さじ1", optional: true, section: "タレ", orPrevious: false },
  { ingredientId: null, name: "ねぎ", amount: "適量", optional: true, section: null, orPrevious: false },
];

test("ingredientsToRows: まとまりが変わるところに見出し", () => {
  let k = 0;
  const rows = ingredientsToRows(stored, () => ++k);
  assert.deepEqual(rows.map((r) => `${r.kind}:${r.name}`), [
    "item:鶏もも肉",
    "heading:タレ",
    "item:しょうゆ",
    "item:めんつゆ",
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
  assert.equal(rowsToIngredients(withoutEnd)[4].section, "タレ");
});

test("parseTags", () => {
  assert.deepEqual(parseTags("簡単、作り置き #お弁当 簡単"), ["簡単", "作り置き", "お弁当"]);
  assert.deepEqual(parseTags("  "), []);
});

test("alternativeGroups / rowsToIngredients: 「または」", async () => {
  const { alternativeGroups } = await import("../src/lib/cook/alternatives.ts");
  const list = [{ name: "A" }, { name: "B", orPrevious: true }, { name: "C" }, { name: "D", orPrevious: true }, { name: "E", orPrevious: true }];
  assert.deepEqual(alternativeGroups(list).map((g) => g.map((i) => i.name).join("")), ["AB", "CDE"]);
  assert.deepEqual(alternativeGroups([{ name: "X", orPrevious: true }]).length, 1, "最初が「または」でもまとまりを作る");
  let k = 0;
  const rows = [
    { key: ++k, kind: "item" as const, ingredientId: null, name: "キャベツ", amount: "", optional: false, orPrevious: true },
    { key: ++k, kind: "item" as const, ingredientId: null, name: "カット野菜", amount: "", optional: false, orPrevious: true },
    { key: ++k, kind: "heading" as const, name: "タレ" },
    { key: ++k, kind: "item" as const, ingredientId: null, name: "しょうゆ", amount: "", optional: false, orPrevious: true },
  ];
  assert.deepEqual(rowsToIngredients(rows).map((i) => i.orPrevious), [false, true, false], "最初・見出しの直後は「または」にしない");
});

test("editorBlocks / appendLooseItem / removeSection: 見出しの中と外", async () => {
  const { editorBlocks, appendLooseItem, removeSection, insertAfter } = await import("../src/lib/cook/editor.ts");
  let k = 0;
  const next = () => ++k;
  const item = (name: string) => ({ key: next(), kind: "item" as const, ingredientId: null, name, amount: "", optional: false });
  const rows = ingredientsToRows(stored, next);
  const view = (rs: typeof rows) => editorBlocks(rs).map((b) => `${b.heading ? b.heading.name : "-"}:${b.items.map((i) => i.row.name).join(",")}`);
  assert.deepEqual(view(rows), ["-:鶏もも肉", "タレ:しょうゆ,めんつゆ,みりん", "-:ねぎ"], "区切りは見出しとして出さない");

  // 見出しのあとに「＋ 材料」（外）を押すと、見出しの外に入る
  const withSection = [item("豚肉"), { key: next(), kind: "heading" as const, name: "下味", isSection: true }, item("酒")];
  const added = appendLooseItem(withSection, item("キャベツ"), next);
  assert.deepEqual(view(added), ["-:豚肉", "下味:酒", "-:キャベツ"]);
  assert.deepEqual(rowsToIngredients(added).map((i) => [i.name, i.section]), [["豚肉", null], ["酒", "下味"], ["キャベツ", null]]);
  assert.deepEqual(view(appendLooseItem(added, item("にんじん"), next)), ["-:豚肉", "下味:酒", "-:キャベツ,にんじん"], "すでに外なら続けて足す");

  // 見出しの中に足す
  const block = editorBlocks(added)[1];
  assert.deepEqual(view(insertAfter(added, block.lastIndex, item("しょうが"))), ["-:豚肉", "下味:酒,しょうが", "-:キャベツ"]);
  // 名前を入れる前の新しい見出しも見出しとして出す
  assert.deepEqual(view([...added, { key: next(), kind: "heading" as const, name: "", isSection: true }]).at(-1), ":");
  // 見出しを外すと中の材料は外に出る
  assert.deepEqual(view(removeSection(added, block.heading!.key)), ["-:豚肉,酒,キャベツ"], "見出しのない並びは1つにまとめて出す");
  assert.deepEqual(rowsToIngredients(removeSection(added, block.heading!.key)).map((i) => i.section), [null, null, null]);
});
