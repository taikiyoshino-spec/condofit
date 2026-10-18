"use server";

import { revalidatePath } from "next/cache";
import { requireCookUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { parseAmount } from "@/lib/cook/amount";

// CondoCook のレシピの保存・削除。権限（作成者だけ編集、削除は作成者と管理者、公開範囲）はDB側で強制している

export type Visibility = "group" | "household" | "private";
export type RecipeInput = {
  title: string;
  visibility: Visibility;
  servings: number | null;
  cookMinutes: number | null;
  categoryId: string | null;
  tags: string[];
  memo: string;
  sourceUrl: string;
  sourceName: string;
  copiedFrom: string | null;
  ingredients: { ingredientId: string | null; name: string; amount: string; optional: boolean; section: string }[];
  steps: string[];
};
export type RecipeResult = { ok: true; id: string } | { ok: false; error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const len = (s: string) => [...s].length;
const uuidOrNull = (v: unknown) => (typeof v === "string" && UUID_RE.test(v) ? v : null);

function intOrNull(v: unknown, min: number, max: number): number | null {
  const n = Number(v);
  return v === null || v === "" || !Number.isInteger(n) || n < min || n > max ? null : n;
}

/** 入力の検証と、DBに渡す形への変換（分量は数値と単位にも分けて持つ） */
function toPayload(input: RecipeInput): { error: string } | { payload: Record<string, unknown> } {
  const title = String(input.title ?? "").trim();
  if (!title || len(title) > 60) return { error: "料理名を60文字以内で入力してください" };
  if (!["group", "household", "private"].includes(input.visibility)) return { error: "公開範囲を選んでください" };
  const memo = String(input.memo ?? "").trim();
  if (len(memo) > 1000) return { error: "メモは1000文字以内にしてください" };
  const sourceUrl = String(input.sourceUrl ?? "").trim();
  if (sourceUrl && (!/^https?:\/\//i.test(sourceUrl) || sourceUrl.length > 2000)) return { error: "元のレシピのURLが正しくありません" };

  const ingredients = (input.ingredients ?? [])
    .map((i) => ({ ...i, name: String(i.name ?? "").trim(), amount: String(i.amount ?? "").trim() }))
    .filter((i) => i.name);
  if (ingredients.length === 0) return { error: "材料を1つ以上入力してください" };
  if (ingredients.length > 60) return { error: "材料は60個までです" };
  for (const i of ingredients) {
    if (len(i.name) > 60) return { error: `材料名「${i.name.slice(0, 10)}…」が長すぎます` };
    if (len(i.amount) > 30) return { error: `「${i.name}」の分量が長すぎます` };
  }
  const steps = (input.steps ?? []).map((s) => String(s ?? "").trim()).filter(Boolean);
  if (steps.length === 0) return { error: "作り方を1つ以上入力してください" };
  if (steps.length > 40) return { error: "作り方の手順は40までです" };
  if (steps.some((s) => len(s) > 500)) return { error: "作り方は1つの手順を500文字以内にしてください" };

  return {
    payload: {
      title,
      visibility: input.visibility,
      servings: intOrNull(input.servings, 1, 50),
      cook_minutes: intOrNull(input.cookMinutes, 1, 1440),
      category_id: uuidOrNull(input.categoryId),
      tags: (input.tags ?? []).map((t) => String(t).trim()).filter((t) => t && len(t) <= 20).slice(0, 10),
      memo,
      source_url: sourceUrl,
      source_name: String(input.sourceName ?? "").trim().slice(0, 60),
      copied_from: uuidOrNull(input.copiedFrom),
      ingredients: ingredients.map((i) => {
        const parsed = parseAmount(i.amount);
        return {
          ingredient_id: uuidOrNull(i.ingredientId),
          name: i.name,
          amount: i.amount,
          quantity: parsed?.quantity ?? null,
          unit: parsed?.unit || null,
          optional: Boolean(i.optional),
          section: String(i.section ?? "").trim().slice(0, 20),
        };
      }),
      steps: steps.map((body) => ({ body })),
    },
  };
}

/** レシピの保存（新規は recipeId = null） */
export async function saveRecipeAction(recipeId: string | null, input: RecipeInput): Promise<RecipeResult> {
  await requireCookUser();
  if (recipeId !== null && !UUID_RE.test(recipeId)) return { ok: false, error: "不正なレシピです" };
  const v = toPayload(input);
  if ("error" in v) return { ok: false, error: v.error };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_recipe", { p_id: recipeId, p_recipe: v.payload });
  if (error) return { ok: false, error: error.message.includes("forbidden") ? "自分のレシピだけ編集できます" : "保存できませんでした" };
  revalidatePath("/cook", "layout");
  return { ok: true, id: data as string };
}

/** レシピの削除（作成者と管理者） */
export async function deleteRecipeAction(recipeId: string): Promise<{ ok: boolean; error?: string }> {
  await requireCookUser();
  if (!UUID_RE.test(recipeId)) return { ok: false, error: "不正なレシピです" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_recipe", { p_id: recipeId });
  if (error) return { ok: false, error: "削除できませんでした" };
  revalidatePath("/cook", "layout");
  return { ok: true };
}
