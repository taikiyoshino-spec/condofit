// レシピの登録・編集画面の材料の行（純粋関数）。
// 画面では「タレ」などの見出しを行として並べ、保存するときは各材料の section（まとまり）にする

export type EditorItem = {
  key: number;
  kind: "item";
  ingredientId: string | null;
  name: string;
  amount: string;
  optional: boolean;
  /** 直前の材料の代わり（「キャベツ または カット野菜」） */
  orPrevious?: boolean;
};
/**
 * 見出し。isSection = false は「ここで見出しのまとまりが終わる」区切り（画面には出さない）。
 * 古い下書きには isSection がないので、名前があれば見出しとみなす
 */
export type EditorHeading = { key: number; kind: "heading"; name: string; isSection?: boolean };
export type EditorRow = EditorItem | EditorHeading;

type StoredIngredient = {
  ingredientId: string | null;
  name: string;
  amount: string;
  optional: boolean;
  section: string | null;
  orPrevious?: boolean;
};

/**
 * 保存済みの材料 → 画面の行（まとまりが変わるところに見出しを入れる）。
 * まとまりのある材料のあとにまとまりのない材料が来たら、空の見出し（まとまりの終わり）を入れる
 */
export function ingredientsToRows(ingredients: StoredIngredient[], nextKey: () => number): EditorRow[] {
  const rows: EditorRow[] = [];
  let section: string | null = null;
  for (const ing of ingredients) {
    if ((ing.section ?? null) !== section) {
      section = ing.section ?? null;
      rows.push({ key: nextKey(), kind: "heading", name: section ?? "", isSection: section !== null });
    }
    rows.push({
      key: nextKey(),
      kind: "item",
      ingredientId: ing.ingredientId,
      name: ing.name,
      amount: ing.amount,
      optional: ing.optional,
      orPrevious: Boolean(ing.orPrevious),
    });
  }
  return rows;
}

/**
 * 画面の行 → 保存する材料（見出しの下の材料に section を付ける。名前が空の行は除く）。
 * 「または」は同じまとまりに直前の材料があるときだけ
 */
export function rowsToIngredients(rows: EditorRow[]): StoredIngredient[] {
  let section = "";
  let first = true;
  const out: StoredIngredient[] = [];
  for (const r of rows) {
    if (r.kind === "heading") {
      section = r.name.trim();
      first = true;
      continue;
    }
    if (!r.name.trim()) continue;
    out.push({
      ingredientId: r.ingredientId,
      name: r.name.trim(),
      amount: r.amount.trim(),
      optional: r.optional,
      section: section || null,
      orPrevious: Boolean(r.orPrevious) && !first,
    });
    first = false;
  }
  return out;
}

/** タグの入力（「、」「,」空白区切り）→ タグの配列（重複・空を除く） */
export function parseTags(text: string): string[] {
  return [...new Set(text.split(/[\s,、，#＃]+/).map((t) => t.trim()).filter(Boolean))];
}

// ---- 画面での見出しのまとまり ----

export const isSectionHeading = (h: EditorHeading) => h.isSection ?? h.name.trim() !== "";

/** 画面に出すまとまり。heading = null は見出しのない材料。index は rows の位置 */
export type EditorBlock = { heading: EditorHeading | null; items: { row: EditorItem; index: number }[]; lastIndex: number };

/** 行 → 見出しごとのまとまり（見出しのない並びが続けば1つに。材料のない、見出しなしのまとまりは出さない） */
export function editorBlocks(rows: EditorRow[]): EditorBlock[] {
  const blocks: EditorBlock[] = [];
  let current: EditorBlock = { heading: null, items: [], lastIndex: -1 };
  rows.forEach((r, index) => {
    if (r.kind === "heading") {
      // 見出しのない並びが続くときは1つにまとめる（区切りだけでは分けない）
      if (!isSectionHeading(r) && !current.heading) return;
      blocks.push(current);
      current = { heading: isSectionHeading(r) ? r : null, items: [], lastIndex: index };
      return;
    }
    current.items.push({ row: r, index });
    current.lastIndex = index;
  });
  blocks.push(current);
  return blocks.filter((b) => b.heading || b.items.length > 0);
}

/** 見出しの中（または見出しのない並び）の最後に材料を足す */
export function insertAfter(rows: EditorRow[], index: number, row: EditorRow): EditorRow[] {
  return [...rows.slice(0, index + 1), row, ...rows.slice(index + 1)];
}

/** 見出しの外（いちばん下）に材料を足す。最後が見出しのまとまりなら、区切りを入れてから足す */
export function appendLooseItem(rows: EditorRow[], item: EditorItem, nextKey: () => number): EditorRow[] {
  const blocks = editorBlocks(rows);
  const last = blocks[blocks.length - 1];
  if (!last?.heading) return [...rows, item];
  return [...rows, { key: nextKey(), kind: "heading", name: "", isSection: false }, item];
}

/** 見出しを外す（中の材料は見出しのない材料になる） */
export function removeSection(rows: EditorRow[], headingKey: number): EditorRow[] {
  return rows.map((r) => (r.kind === "heading" && r.key === headingKey ? { ...r, name: "", isSection: false } : r));
}
