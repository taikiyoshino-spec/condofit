"use server";

import { revalidatePath } from "next/cache";
import { requireCookAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { INGREDIENT_CATEGORIES, cleanReading, mergeAliases, parseAliases, type IngredientCategory } from "@/lib/cook/ingredients";

// CondoCook の管理（管理者のみ）。権限は DB の RLS（is_admin()）でも強制している。物理削除はせず active で非表示にする

export type AdminResult = { ok: true } | { ok: false; error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cleanName(raw: string, max: number): string | null {
  const name = String(raw ?? "").normalize("NFC").trim();
  return name && [...name].length <= max ? name : null;
}

function fail(error: { code?: string }): AdminResult {
  return { ok: false, error: error.code === "23505" ? "同じ名前がすでにあります" : "保存できませんでした" };
}

function revalidate() {
  revalidatePath("/cook", "layout");
}

// ---- 食材 ----

export type IngredientPatch = { name: string; reading: string; aliases: string; category: IngredientCategory; active: boolean };

export async function updateIngredientAction(id: string, patch: IngredientPatch): Promise<AdminResult> {
  await requireCookAdmin();
  if (!UUID_RE.test(id)) return { ok: false, error: "不正な食材です" };
  const name = cleanName(patch.name, 30);
  if (!name) return { ok: false, error: "食材名を30文字以内で入力してください" };
  if (!INGREDIENT_CATEGORIES.includes(patch.category)) return { ok: false, error: "分類を選んでください" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("ingredients")
    .update({
      name,
      reading: cleanReading(patch.reading),
      aliases: parseAliases(patch.aliases, name),
      category: patch.category,
      active: Boolean(patch.active),
    })
    .eq("id", id)
    .is("merged_into", null);
  if (error) return fail(error);
  revalidate();
  return { ok: true };
}

/**
 * 同じ食材の重複をまとめる。統合元は非表示になり、名前と別名は統合先の別名に入る。
 * 登録済みのレシピの材料は名前で表示しているので、そのままで困らない
 */
export async function mergeIngredientAction(fromId: string, intoId: string): Promise<AdminResult> {
  await requireCookAdmin();
  if (!UUID_RE.test(fromId) || !UUID_RE.test(intoId) || fromId === intoId) return { ok: false, error: "統合先を選んでください" };
  const supabase = await createClient();
  const { data, error } = await supabase.from("ingredients").select("id, name, aliases").in("id", [fromId, intoId]).is("merged_into", null);
  if (error) return fail(error);
  const from = data.find((i) => i.id === fromId);
  const into = data.find((i) => i.id === intoId);
  if (!from || !into) return { ok: false, error: "食材が見つかりません" };

  // 先に統合元を外す（名前の重複チェックは統合済みを除くため、統合先の別名に入れても衝突しない）
  const { error: e1 } = await supabase.from("ingredients").update({ merged_into: intoId, active: false }).eq("id", fromId);
  if (e1) return fail(e1);
  const aliases = mergeAliases(
    { name: into.name as string, aliases: (into.aliases as string[]) ?? [] },
    { name: from.name as string, aliases: (from.aliases as string[]) ?? [] },
  );
  const { error: e2 } = await supabase.from("ingredients").update({ aliases }).eq("id", intoId);
  if (e2) return fail(e2);
  revalidate();
  return { ok: true };
}

// ---- カテゴリ ----

export async function addCategoryAction(rawName: string): Promise<AdminResult> {
  await requireCookAdmin();
  const name = cleanName(rawName, 20);
  if (!name) return { ok: false, error: "名前を20文字以内で入力してください" };
  const supabase = await createClient();
  const { data: last } = await supabase.from("recipe_categories").select("display_order").order("display_order", { ascending: false }).limit(1);
  const { error } = await supabase.from("recipe_categories").insert({ name, display_order: ((last?.[0]?.display_order as number) ?? 0) + 10 });
  if (error) return fail(error);
  revalidate();
  return { ok: true };
}

export async function updateCategoryAction(id: string, patch: { name?: string; active?: boolean }): Promise<AdminResult> {
  await requireCookAdmin();
  if (!UUID_RE.test(id)) return { ok: false, error: "不正なカテゴリです" };
  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    const name = cleanName(patch.name, 20);
    if (!name) return { ok: false, error: "名前を20文字以内で入力してください" };
    update.name = name;
  }
  if (patch.active !== undefined) update.active = Boolean(patch.active);
  const supabase = await createClient();
  const { error } = await supabase.from("recipe_categories").update(update).eq("id", id);
  if (error) return fail(error);
  revalidate();
  return { ok: true };
}

/** 隣と表示順を入れ替える（10刻みで振り直す） */
export async function moveCategoryAction(id: string, direction: -1 | 1): Promise<AdminResult> {
  await requireCookAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.from("recipe_categories").select("id, display_order").order("display_order").order("name");
  if (error) return fail(error);
  const ids = data.map((r) => r.id as string);
  const index = ids.indexOf(id);
  const to = index + (direction === -1 ? -1 : 1);
  if (index < 0 || to < 0 || to >= ids.length) return { ok: true };
  [ids[index], ids[to]] = [ids[to], ids[index]];
  for (const [i, rowId] of ids.entries()) {
    const order = (i + 1) * 10;
    if (data.find((r) => r.id === rowId)?.display_order === order) continue;
    const { error: e } = await supabase.from("recipe_categories").update({ display_order: order }).eq("id", rowId);
    if (e) return fail(e);
  }
  revalidate();
  return { ok: true };
}
