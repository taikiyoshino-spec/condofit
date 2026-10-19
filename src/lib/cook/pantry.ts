// 食材リスト・レシピの提案（純粋関数。D11・D17）
import { alternativeGroups } from "./alternatives.ts";
import { normalizeFood } from "./ingredients.ts";

/** 期限が近いとみなす日数（今日を含めてこの日数以内） */
export const SOON_DAYS = 2;

export type ExpiryStatus = "expired" | "soon" | "ok" | "none";

const dayNumber = (d: string) => Math.round(Date.parse(`${d}T00:00:00Z`) / 86400000);

/** 期限まであと何日か（今日が期限なら0、過ぎていれば負） */
export function daysLeft(expiresOn: string | null, today: string): number | null {
  return expiresOn ? dayNumber(expiresOn) - dayNumber(today) : null;
}

export function expiryStatus(expiresOn: string | null, today: string): ExpiryStatus {
  const left = daysLeft(expiresOn, today);
  if (left === null) return "none";
  if (left < 0) return "expired";
  return left <= SOON_DAYS ? "soon" : "ok";
}

/** 期限の表示（「期限切れ」「今日まで」「あと2日」「10/25まで」） */
export function expiryLabel(expiresOn: string | null, today: string): string | null {
  const left = daysLeft(expiresOn, today);
  if (left === null || !expiresOn) return null;
  if (left < 0) return "期限切れ";
  if (left === 0) return "今日まで";
  if (left <= SOON_DAYS) return `あと${left}日`;
  return `${Number(expiresOn.slice(5, 7))}/${Number(expiresOn.slice(8, 10))}まで`;
}

export type PantryLike = { ingredientId: string | null; name: string; expiresOn: string | null };
export type SuggestIngredient = { ingredientId: string | null; name: string; optional: boolean; orPrevious?: boolean };
export type SuggestRecipe = {
  id: string;
  ingredients: SuggestIngredient[];
  favoriteCount: number;
  cookedCount: number;
};
export type Suggestion<R> = {
  recipe: R;
  /** 買う物（なくても可・いつもある・家にあるものを除く） */
  toBuy: string[];
  /** 使う食材のうち期限が近い・過ぎたもの（期限の早い順） */
  expiring: string[];
  /** 最近（1週間以内）家族が作った */
  recent: boolean;
};

/**
 * レシピの提案の並び（D17）: ①買う物が少ない順 ②同じなら期限が近い食材を使う順 ③お気に入り・作られた数。
 * 最近家族が作ったものは下げる。家にある食材を1つも使わないレシピは出さない。
 * 「または」の材料は、どれか1つが家にある・いつもあるなら買わなくてよい（買う物は「キャベツかカット野菜」）
 */
export function suggestRecipes<R extends SuggestRecipe>(
  recipes: R[],
  { pantry, staples, recentIds, today }: { pantry: PantryLike[]; staples: string[]; recentIds: string[]; today: string },
): Suggestion<R>[] {
  const staple = new Set(staples);
  const recent = new Set(recentIds);
  const byId = new Map(pantry.filter((p) => p.ingredientId).map((p) => [p.ingredientId!, p]));
  const byName = new Map(pantry.map((p) => [normalizeFood(p.name), p]));
  const findPantry = (i: SuggestIngredient) => (i.ingredientId ? byId.get(i.ingredientId) : undefined) ?? byName.get(normalizeFood(i.name));

  const scored = recipes.flatMap((recipe) => {
    const toBuy: string[] = [];
    const used: PantryLike[] = [];
    for (const group of alternativeGroups(recipe.ingredients)) {
      const have = group.map(findPantry).find(Boolean);
      if (have) {
        if (!used.includes(have)) used.push(have);
        continue;
      }
      if (group.every((i) => i.optional) || group.some((i) => i.ingredientId && staple.has(i.ingredientId))) continue;
      const name = group.map((i) => i.name).join("か");
      if (!toBuy.includes(name)) toBuy.push(name);
    }
    if (used.length === 0) return [];
    const expiringItems = used
      .filter((p) => ["expired", "soon"].includes(expiryStatus(p.expiresOn, today)))
      .sort((a, b) => (a.expiresOn ?? "").localeCompare(b.expiresOn ?? ""));
    return [
      {
        recipe,
        toBuy,
        expiring: expiringItems.map((p) => p.name),
        recent: recent.has(recipe.id),
        firstExpiry: expiringItems[0]?.expiresOn ?? "9999-12-31",
      },
    ];
  });
  scored.sort(
    (a, b) =>
      Number(a.recent) - Number(b.recent) ||
      a.toBuy.length - b.toBuy.length ||
      a.firstExpiry.localeCompare(b.firstExpiry) ||
      b.recipe.favoriteCount + b.recipe.cookedCount - (a.recipe.favoriteCount + a.recipe.cookedCount),
  );
  return scored.map((s) => ({ recipe: s.recipe, toBuy: s.toBuy, expiring: s.expiring, recent: s.recent }));
}

/** 「作った」のときに「使い切った？」と聞く食材（そのレシピで使った家にある食材。いつもあるものは出さない。D10） */
export function usedPantryItems<P extends PantryLike>(ingredients: SuggestIngredient[], pantry: P[], staples: string[]): P[] {
  const staple = new Set(staples);
  const out: P[] = [];
  for (const ing of ingredients) {
    if (ing.ingredientId && staple.has(ing.ingredientId)) continue;
    const p = pantry.find((x) => (ing.ingredientId && x.ingredientId === ing.ingredientId) || normalizeFood(x.name) === normalizeFood(ing.name));
    if (p && !out.includes(p) && !(p.ingredientId && staple.has(p.ingredientId))) out.push(p);
  }
  return out;
}
