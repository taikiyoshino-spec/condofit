// レシピ一覧の絞り込み（純粋関数）
import { normalizeFood } from "./ingredients.ts";

export type Scope = "all" | "household" | "mine";

/** 子供向けのレシピに付けるタグ（登録画面のチェックで付け外しする） */
export const KIDS_TAG = "子供向け";
export const isKidsRecipe = (r: { tags: string[] }) => r.tags.includes(KIDS_TAG);
type Filterable = { id: string; title: string; ownerId: string; categoryId: string | null; tags: string[]; ingredientNames: string[] };

/**
 * scope: all = 見えるもの全部 / household = 家族（自分を含む）が作ったもの / mine = 自分が作ったもの
 * q: 料理名・材料名・タグの部分一致（空白区切りはすべて含むもの）
 * onlyIds: 指定したレシピだけ（お気に入り・作りたいの一覧）
 * kids: 子供向けだけ
 */
export function filterRecipes<T extends Filterable>(
  list: T[],
  {
    scope,
    q,
    categoryId,
    myId,
    householdIds,
    onlyIds,
    kids = false,
  }: { scope: Scope; q: string; categoryId: string | null; myId: string; householdIds: string[]; onlyIds?: string[]; kids?: boolean },
): T[] {
  const words = q.split(/[\s　]+/).map(normalizeFood).filter(Boolean);
  const only = onlyIds ? new Set(onlyIds) : null;
  return list.filter((r) => {
    if (only && !only.has(r.id)) return false;
    if (kids && !isKidsRecipe(r)) return false;
    if (scope === "mine" && r.ownerId !== myId) return false;
    if (scope === "household" && !householdIds.includes(r.ownerId)) return false;
    if (categoryId && r.categoryId !== categoryId) return false;
    if (words.length === 0) return true;
    const hay = [r.title, ...r.ingredientNames, ...r.tags].map(normalizeFood).join("\n");
    return words.every((w) => hay.includes(w));
  });
}
