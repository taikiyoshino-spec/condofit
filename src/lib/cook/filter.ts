// レシピ一覧の絞り込み（純粋関数）
import { normalizeFood } from "./ingredients.ts";

export type Scope = "all" | "household" | "mine";

/**
 * レシピの特徴（登録画面のチェックでタグを付け外しし、一覧・提案で絞り込む）。
 * key は URL の ?f=kids,noknife に使う
 */
export const FEATURES = [
  { key: "kids", tag: "子供向け", hint: "子どもが食べやすい" },
  { key: "noknife", tag: "包丁不要", hint: "包丁・まな板を使わない" },
  { key: "nopan", tag: "フライパン不要", hint: "レンジや鍋だけで作れる" },
] as const;
export type FeatureKey = (typeof FEATURES)[number]["key"];

/** URL の ?f=（「,」区切り）→ 特徴の key（知らないものは除く） */
export function parseFeatureKeys(v: unknown): FeatureKey[] {
  const raw = typeof v === "string" ? v.split(",") : [];
  return FEATURES.filter((f) => raw.includes(f.key)).map((f) => f.key);
}

/** key を足す・外した ?f= の値（なくなれば null） */
export function toggleFeatureKey(keys: FeatureKey[], key: FeatureKey): string | null {
  const next = keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key];
  return next.length ? FEATURES.filter((f) => next.includes(f.key)).map((f) => f.key).join(",") : null;
}

/** レシピに付いている特徴（表示用） */
export const recipeFeatures = (r: { tags: string[] }) => FEATURES.filter((f) => r.tags.includes(f.tag));
type Filterable = { id: string; title: string; ownerId: string; categoryId: string | null; tags: string[]; ingredientNames: string[] };

/**
 * scope: all = 見えるもの全部 / household = 家族（自分を含む）が作ったもの / mine = 自分が作ったもの
 * q: 料理名・材料名・タグの部分一致（空白区切りはすべて含むもの）
 * onlyIds: 指定したレシピだけ（お気に入り・作りたいの一覧）
 * features: 指定した特徴（子供向け・包丁不要など）がすべて付いているものだけ
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
    features = [],
  }: {
    scope: Scope;
    q: string;
    categoryId: string | null;
    myId: string;
    householdIds: string[];
    onlyIds?: string[];
    features?: FeatureKey[];
  },
): T[] {
  const words = q.split(/[\s　]+/).map(normalizeFood).filter(Boolean);
  const only = onlyIds ? new Set(onlyIds) : null;
  return list.filter((r) => {
    if (only && !only.has(r.id)) return false;
    if (features.some((k) => !r.tags.includes(FEATURES.find((f) => f.key === k)!.tag))) return false;
    if (scope === "mine" && r.ownerId !== myId) return false;
    if (scope === "household" && !householdIds.includes(r.ownerId)) return false;
    if (categoryId && r.categoryId !== categoryId) return false;
    if (words.length === 0) return true;
    const hay = [r.title, ...r.ingredientNames, ...r.tags].map(normalizeFood).join("\n");
    return words.every((w) => hay.includes(w));
  });
}
