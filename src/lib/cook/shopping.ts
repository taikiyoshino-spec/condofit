// 買い物リストのまとめ方（純粋関数。D19）
import { INGREDIENT_CATEGORIES, normalizeFood } from "./ingredients.ts";

export type ShoppingItem = {
  id: string;
  ingredientId: string | null;
  name: string;
  category: string;
  amount: string;
  recipeTitle: string | null;
  bought: boolean;
};

export type ShoppingGroup = {
  key: string;
  name: string;
  category: string;
  ids: string[];
  /** どのレシピの分か・分量（例「親子丼 300g」「唐揚げ 500g」「2本」）。分量は足さない */
  sources: string[];
};

const categoryOrder = (c: string) => {
  const i = (INGREDIENT_CATEGORIES as readonly string[]).indexOf(c);
  return i < 0 ? INGREDIENT_CATEGORIES.length : i;
};

/**
 * 同じ食材（食材マスタが同じ、またはマスタにない同じ名前）を1行にまとめ、売り場の分類順・名前順に並べる。
 * 買ったもの・まだのものは別々にまとめる
 */
export function groupShoppingItems(items: ShoppingItem[]): { pending: ShoppingGroup[]; bought: ShoppingGroup[] } {
  const build = (list: ShoppingItem[]) => {
    const map = new Map<string, ShoppingGroup>();
    for (const it of list) {
      const key = it.ingredientId ?? `name:${normalizeFood(it.name)}`;
      const g = map.get(key) ?? { key, name: it.name, category: it.category, ids: [], sources: [] };
      g.ids.push(it.id);
      const source = [it.recipeTitle, it.amount].filter(Boolean).join(" ");
      if (source && !g.sources.includes(source)) g.sources.push(source);
      map.set(key, g);
    }
    return [...map.values()].sort((a, b) => categoryOrder(a.category) - categoryOrder(b.category) || a.name.localeCompare(b.name, "ja"));
  };
  return { pending: build(items.filter((i) => !i.bought)), bought: build(items.filter((i) => i.bought)) };
}
