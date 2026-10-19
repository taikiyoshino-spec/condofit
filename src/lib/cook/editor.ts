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
export type EditorHeading = { key: number; kind: "heading"; name: string };
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
      rows.push({ key: nextKey(), kind: "heading", name: section ?? "" });
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
