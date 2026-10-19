import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { ShoppingItem } from "./shopping";
import type { SuggestIngredient } from "./pantry";

/** RPC が返す uuid の集合（値の配列でも {関数名: 値} の配列でも受ける） */
const uuidList = (data: unknown): string[] =>
  ((data ?? []) as unknown[]).map((x) => String(x && typeof x === "object" ? Object.values(x)[0] : x));

// CondoCook の読み取り。見える範囲（グループ／家族だけ／自分だけ）は RLS で絞られている

export type Visibility = "group" | "household" | "private";
export type Category = { id: string; name: string };

export type RecipeSummary = {
  id: string;
  title: string;
  ownerId: string;
  visibility: Visibility;
  servings: number | null;
  cookMinutes: number | null;
  categoryId: string | null;
  tags: string[];
  thumbPath: string | null;
  createdAt: string;
  ingredientNames: string[];
  /** 材料（提案の計算に使う） */
  ingredients: SuggestIngredient[];
  /** 作られた回数（作成者本人の分を除く）・お気に入りの数 */
  cookedCount: number;
  favoriteCount: number;
};

export type RecipeIngredient = {
  ingredientId: string | null;
  name: string;
  amount: string;
  optional: boolean;
  section: string | null;
};

export type RecipeDetail = Omit<RecipeSummary, "ingredientNames" | "ingredients"> & {
  memo: string | null;
  sourceUrl: string | null;
  sourceName: string | null;
  photoPath: string | null;
  copiedFrom: { id: string; title: string; ownerId: string } | null;
  ingredients: RecipeIngredient[];
  steps: string[];
};

export async function listCategories(): Promise<Category[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("recipe_categories").select("id, name").eq("active", true).order("display_order");
  if (error) throw error;
  return data.map((c) => ({ id: c.id as string, name: c.name as string }));
}

type SummaryRow = {
  id: string;
  title: string;
  owner_user_id: string;
  visibility: Visibility;
  servings: number | null;
  cook_minutes: number | null;
  category_id: string | null;
  tags: string[];
  thumb_path: string | null;
  created_at: string;
  cooked_count: number;
  favorite_count: number;
};

const SUMMARY =
  "id, title, owner_user_id, visibility, servings, cook_minutes, category_id, tags, thumb_path, created_at, cooked_count, favorite_count";

const toSummary = (r: SummaryRow, ingredients: SuggestIngredient[] = []): RecipeSummary => ({
  id: r.id,
  title: r.title,
  ownerId: r.owner_user_id,
  visibility: r.visibility,
  servings: r.servings,
  cookMinutes: r.cook_minutes,
  categoryId: r.category_id,
  tags: r.tags ?? [],
  thumbPath: r.thumb_path,
  createdAt: r.created_at,
  ingredientNames: ingredients.map((i) => i.name),
  ingredients,
  cookedCount: r.cooked_count ?? 0,
  favoriteCount: r.favorite_count ?? 0,
});

/** 自分に見えるレシピ（新しい順。少人数の仲間内なので絞り込みは画面側で行う） */
export async function listRecipes(): Promise<RecipeSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("recipes")
    .select(`${SUMMARY}, recipe_ingredients(name, ingredient_id, optional)`)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  type Row = SummaryRow & { recipe_ingredients: { name: string; ingredient_id: string | null; optional: boolean }[] };
  return (data as unknown as Row[]).map((r) =>
    toSummary(r, r.recipe_ingredients.map((i) => ({ name: i.name, ingredientId: i.ingredient_id, optional: i.optional }))),
  );
}

export const getRecipe = cache(async (id: string): Promise<RecipeDetail | null> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("recipes")
    .select(
      `${SUMMARY}, memo, source_url, source_name, photo_path, copied_from,
       recipe_ingredients(ingredient_id, name, amount, optional, section, position),
       recipe_steps(body, position)`,
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) return null;
  const r = data as unknown as SummaryRow & {
    memo: string | null;
    source_url: string | null;
    source_name: string | null;
    photo_path: string | null;
    copied_from: string | null;
    recipe_ingredients: { ingredient_id: string | null; name: string; amount: string; optional: boolean; section: string | null; position: number }[];
    recipe_steps: { body: string; position: number }[];
  };
  // コピー元は見える場合だけ表示（見えなければ RLS で取れない）
  let copiedFrom: RecipeDetail["copiedFrom"] = null;
  if (r.copied_from) {
    const { data: src } = await supabase.from("recipes").select("id, title, owner_user_id").eq("id", r.copied_from).maybeSingle();
    if (src) copiedFrom = { id: src.id as string, title: src.title as string, ownerId: src.owner_user_id as string };
  }
  return {
    ...toSummary(r),
    memo: r.memo,
    sourceUrl: r.source_url,
    sourceName: r.source_name,
    photoPath: r.photo_path,
    copiedFrom,
    ingredients: [...r.recipe_ingredients]
      .sort((a, b) => a.position - b.position)
      .map((i) => ({ ingredientId: i.ingredient_id, name: i.name, amount: i.amount, optional: i.optional, section: i.section })),
    steps: [...r.recipe_steps].sort((a, b) => a.position - b.position).map((s) => s.body),
  };
});

/** 自分の家族のメンバー（自分を含む） */
export const myHouseholdMemberIds = cache(async (): Promise<string[]> => {
  const supabase = await createClient();
  const [{ data }, { data: mine }] = await Promise.all([
    supabase.from("household_members").select("user_id, household_id"),
    supabase.rpc("my_household_id"),
  ]);
  return (data ?? []).filter((m) => m.household_id === mine).map((m) => m.user_id as string);
});

/** 自分の家族の人数（人数分の換算の初期値。D18） */
export async function myHouseholdSize(): Promise<number> {
  return Math.max(1, (await myHouseholdMemberIds()).length);
}

export type IngredientOption = { id: string; name: string; reading: string; aliases: string[] };

/** 食材マスタ（統合済み・非表示を除く）。材料名の候補出しと当てはめに使う */
export async function listIngredients(): Promise<IngredientOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ingredients")
    .select("id, name, reading, aliases")
    .eq("active", true)
    .is("merged_into", null)
    .order("reading");
  if (error) throw error;
  return data.map((i) => ({ id: i.id as string, name: i.name as string, reading: i.reading as string, aliases: (i.aliases as string[]) ?? [] }));
}

// ---- 管理画面 ----

export type AdminCategory = Category & { active: boolean };

/** カテゴリ（非表示も含む、表示順） */
export async function listAllCategories(): Promise<AdminCategory[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("recipe_categories").select("id, name, active").order("display_order").order("name");
  if (error) throw error;
  return data.map((c) => ({ id: c.id as string, name: c.name as string, active: c.active as boolean }));
}

export type AdminIngredient = IngredientOption & {
  category: string;
  active: boolean;
  /** メンバーがレシピ登録中に追加した食材（初期データは null） */
  createdBy: string | null;
};

/** 食材マスタ（非表示も含む。統合済みは除く） */
export async function listAllIngredients(): Promise<AdminIngredient[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ingredients")
    .select("id, name, reading, aliases, category, active, created_by")
    .is("merged_into", null)
    .order("reading");
  if (error) throw error;
  return data.map((i) => ({
    id: i.id as string,
    name: i.name as string,
    reading: i.reading as string,
    aliases: (i.aliases as string[]) ?? [],
    category: i.category as string,
    active: i.active as boolean,
    createdBy: (i.created_by as string | null) ?? null,
  }));
}

// ---- 反応（作った・お気に入り・作りたい・コメント） ----

export type CookLog = { id: string; userId: string; note: string | null; photoPath: string | null; thumbPath: string | null; cookedAt: string };
export type RecipeComment = { id: string; userId: string; body: string; createdAt: string };
export type RecipeReactions = { cooks: CookLog[]; comments: RecipeComment[]; favorite: boolean; want: boolean };

/** レシピの「みんなの作った」・コメントと、自分のお気に入り・作りたい */
export async function getRecipeReactions(recipeId: string, myId: string): Promise<RecipeReactions> {
  const supabase = await createClient();
  const [cooks, comments, fav, want] = await Promise.all([
    supabase.from("recipe_cooks").select("id, user_id, note, photo_path, thumb_path, cooked_at").eq("recipe_id", recipeId).order("cooked_at", { ascending: false }).limit(50),
    supabase.from("recipe_comments").select("id, user_id, body, created_at").eq("recipe_id", recipeId).order("created_at").limit(200),
    supabase.from("recipe_favorites").select("recipe_id").eq("recipe_id", recipeId).eq("user_id", myId).maybeSingle(),
    supabase.from("recipe_wants").select("recipe_id").eq("recipe_id", recipeId).eq("user_id", myId).maybeSingle(),
  ]);
  return {
    cooks: (cooks.data ?? []).map((c) => ({
      id: c.id as string,
      userId: c.user_id as string,
      note: (c.note as string | null) ?? null,
      photoPath: (c.photo_path as string | null) ?? null,
      thumbPath: (c.thumb_path as string | null) ?? null,
      cookedAt: c.cooked_at as string,
    })),
    comments: (comments.data ?? []).map((c) => ({ id: c.id as string, userId: c.user_id as string, body: c.body as string, createdAt: c.created_at as string })),
    favorite: Boolean(fav.data),
    want: Boolean(want.data),
  };
}

/** 自分のお気に入り・作りたいのレシピ（一覧の絞り込み用） */
export const myRecipeMarks = cache(async (): Promise<{ favorites: string[]; wants: string[] }> => {
  const supabase = await createClient();
  const [fav, want] = await Promise.all([
    supabase.from("recipe_favorites").select("recipe_id"),
    supabase.from("recipe_wants").select("recipe_id"),
  ]);
  return {
    favorites: (fav.data ?? []).map((r) => r.recipe_id as string),
    wants: (want.data ?? []).map((r) => r.recipe_id as string),
  };
});

export type RankingRow = { id: string; n: number };
export type CookRanking = { recipe: RankingRow[]; cook: RankingRow[]; post: RankingRow[] };

/** 月ごとのランキング（グループ公開のレシピだけ。D21・D22）。month は "YYYY-MM-01" */
export async function getCookRanking(month: string): Promise<CookRanking> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cook_monthly_ranking", { p_month: month });
  if (error) throw error;
  const out: CookRanking = { recipe: [], cook: [], post: [] };
  for (const r of (data ?? []) as { board: keyof CookRanking; id: string; n: number }[]) out[r.board]?.push({ id: r.id, n: r.n });
  for (const k of Object.keys(out) as (keyof CookRanking)[]) out[k].sort((a, b) => b.n - a.n);
  return out;
}

// ---- 買い物リスト・食材リスト（自分の家族の分。RLS で絞られる） ----

export async function listShoppingItems(): Promise<ShoppingItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("shopping_items")
    .select("id, ingredient_id, name, category, amount, recipe_title, bought_at")
    .order("created_at");
  if (error) throw error;
  return data.map((s) => ({
    id: s.id as string,
    ingredientId: (s.ingredient_id as string | null) ?? null,
    name: s.name as string,
    category: s.category as string,
    amount: s.amount as string,
    recipeTitle: (s.recipe_title as string | null) ?? null,
    bought: Boolean(s.bought_at),
  }));
}

/** レシピから買い物リストに入れるときに、最初からチェックを外しておく食材（家にある・いつもある・もうリストにある） */
export async function shoppingHints(): Promise<{ inPantry: string[]; staples: string[]; inList: string[] }> {
  const supabase = await createClient();
  const [pantry, staples, list] = await Promise.all([
    supabase.from("pantry_items").select("ingredient_id").not("ingredient_id", "is", null),
    supabase.rpc("my_staple_ids"),
    supabase.from("shopping_items").select("ingredient_id").is("bought_at", null).not("ingredient_id", "is", null),
  ]);
  const ids = (rows: { ingredient_id?: unknown; id?: unknown }[] | null, col: "ingredient_id" | "id") =>
    [...new Set((rows ?? []).map((r) => r[col] as string))];
  return {
    inPantry: ids(pantry.data, "ingredient_id"),
    staples: uuidList(staples.data),
    inList: ids(list.data, "ingredient_id"),
  };
}

export type PantryItem = {
  id: string;
  ingredientId: string | null;
  name: string;
  category: string;
  boughtOn: string;
  expiresOn: string | null;
  storage: "fridge" | "freezer";
};

/** 家にある食材（自分の家族の分） */
export async function listPantry(): Promise<PantryItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pantry_items")
    .select("id, ingredient_id, name, category, bought_on, expires_on, storage")
    .order("expires_on", { nullsFirst: false })
    .order("name");
  if (error) throw error;
  return data.map((p) => ({
    id: p.id as string,
    ingredientId: (p.ingredient_id as string | null) ?? null,
    name: p.name as string,
    category: p.category as string,
    boughtOn: p.bought_on as string,
    expiresOn: (p.expires_on as string | null) ?? null,
    storage: p.storage === "freezer" ? "freezer" : "fridge",
  }));
}

/** 自分の家族の「いつもある」食材（食材マスタの初期値＋家族ごとの差分） */
export const myStapleIds = cache(async (): Promise<string[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_staple_ids");
  if (error) throw error;
  return uuidList(data);
});

export type Purchase = { id: string; ingredientId: string | null; name: string; times: number; lastBoughtOn: string };

/** 過去に買った物（よく買う順） */
export async function listPurchases(limit = 40): Promise<Purchase[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("household_purchases")
    .select("id, ingredient_id, name, times, last_bought_on")
    .order("times", { ascending: false })
    .order("last_bought_on", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data.map((p) => ({
    id: p.id as string,
    ingredientId: (p.ingredient_id as string | null) ?? null,
    name: p.name as string,
    times: p.times as number,
    lastBoughtOn: p.last_bought_on as string,
  }));
}

/** 最近（1週間以内）家族が作ったレシピ（提案で下げる。D17） */
export async function recentHouseholdCookIds(): Promise<string[]> {
  const supabase = await createClient();
  const members = await myHouseholdMemberIds();
  if (members.length === 0) return [];
  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  const { data } = await supabase.from("recipe_cooks").select("recipe_id").in("user_id", members).gte("cooked_at", since);
  return [...new Set((data ?? []).map((c) => c.recipe_id as string))];
}

export type AdminHousehold = { id: string; name: string; memberIds: string[] };

/** 家族とメンバー（管理者用。家族に入っていないメンバーは noHousehold） */
export async function listHouseholdsForAdmin(): Promise<{ households: AdminHousehold[]; noHousehold: string[] }> {
  const supabase = await createClient();
  const [h, hm, gm] = await Promise.all([
    supabase.from("households").select("id, name").order("created_at"),
    supabase.from("household_members").select("user_id, household_id"),
    supabase.from("group_members").select("user_id").is("removed_at", null),
  ]);
  if (h.error || hm.error || gm.error) throw h.error ?? hm.error ?? gm.error;
  const active = new Set(gm.data.map((m) => m.user_id as string));
  const households = h.data.map((x) => ({
    id: x.id as string,
    name: x.name as string,
    memberIds: hm.data.filter((m) => m.household_id === x.id && active.has(m.user_id as string)).map((m) => m.user_id as string),
  }));
  const inHousehold = new Set(hm.data.map((m) => m.user_id as string));
  return { households, noHousehold: [...active].filter((id) => !inHousehold.has(id)) };
}
