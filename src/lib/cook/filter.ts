// レシピ一覧の絞り込み（純粋関数）
import { normalizeFood } from "./ingredients.ts";

export type Scope = "all" | "household" | "mine";
type Filterable = { title: string; ownerId: string; categoryId: string | null; tags: string[]; ingredientNames: string[] };

/**
 * scope: all = 見えるもの全部 / household = 家族（自分を含む）が作ったもの / mine = 自分が作ったもの
 * q: 料理名・材料名・タグの部分一致（空白区切りはすべて含むもの）
 */
export function filterRecipes<T extends Filterable>(
  list: T[],
  { scope, q, categoryId, myId, householdIds }: { scope: Scope; q: string; categoryId: string | null; myId: string; householdIds: string[] },
): T[] {
  const words = q.split(/[\s　]+/).map(normalizeFood).filter(Boolean);
  return list.filter((r) => {
    if (scope === "mine" && r.ownerId !== myId) return false;
    if (scope === "household" && !householdIds.includes(r.ownerId)) return false;
    if (categoryId && r.categoryId !== categoryId) return false;
    if (words.length === 0) return true;
    const hay = [r.title, ...r.ingredientNames, ...r.tags].map(normalizeFood).join("\n");
    return words.every((w) => hay.includes(w));
  });
}
