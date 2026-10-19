import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

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
};

export type RecipeIngredient = {
  ingredientId: string | null;
  name: string;
  amount: string;
  optional: boolean;
  section: string | null;
};

export type RecipeDetail = Omit<RecipeSummary, "ingredientNames"> & {
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
};

const SUMMARY = "id, title, owner_user_id, visibility, servings, cook_minutes, category_id, tags, thumb_path, created_at";

const toSummary = (r: SummaryRow, ingredientNames: string[] = []): RecipeSummary => ({
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
  ingredientNames,
});

/** 自分に見えるレシピ（新しい順。少人数の仲間内なので絞り込みは画面側で行う） */
export async function listRecipes(): Promise<RecipeSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("recipes")
    .select(`${SUMMARY}, recipe_ingredients(name)`)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data as unknown as (SummaryRow & { recipe_ingredients: { name: string }[] })[]).map((r) =>
    toSummary(r, r.recipe_ingredients.map((i) => i.name)),
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
