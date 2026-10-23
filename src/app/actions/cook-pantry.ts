"use server";

import { revalidatePath } from "next/cache";
import { requireCookUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

// 家族の食材リスト・いつもある（D8〜D11）。自分の家族の分だけ扱えることは DB 側（RPC・RLS）で強制している

export type PantryResult = { ok: true; count?: number } | { ok: false; error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const uuidOrNull = (v: unknown) => (typeof v === "string" && UUID_RE.test(v) ? v : null);

function refresh() {
  revalidatePath("/cook", "layout");
}

/** 手で食材リストに入れる */
export async function addPantryItemsAction(items: { ingredientId: string | null; name: string }[]): Promise<PantryResult> {
  await requireCookUser();
  if (!Array.isArray(items) || items.length === 0 || items.length > 100) return { ok: false, error: "追加するものを選んでください" };
  const payload = items.map((i) => ({ ingredient_id: uuidOrNull(i.ingredientId), name: String(i.name ?? "").normalize("NFC").trim().slice(0, 30) }));
  if (payload.every((p) => !p.name && !p.ingredient_id)) return { ok: false, error: "名前を入力してください" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("add_pantry_items", { p_items: payload });
  if (error) return { ok: false, error: "追加できませんでした" };
  refresh();
  return { ok: true, count: data as number };
}

/** 冷蔵／冷凍の切り替え・期限の変更（expires を空にすると、冷蔵／冷凍を変えたときだけ目安を計算し直す） */
export async function updatePantryItemAction(id: string, storage: "fridge" | "freezer", expires: string | null): Promise<PantryResult> {
  await requireCookUser();
  if (!UUID_RE.test(id) || (storage !== "fridge" && storage !== "freezer")) return { ok: false, error: "不正な食材です" };
  if (expires !== null && (!DATE_RE.test(expires) || Number.isNaN(Date.parse(expires)))) return { ok: false, error: "日付を確かめてください" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_pantry_item", { p_id: id, p_storage: storage, p_expires: expires });
  if (error) return { ok: false, error: "保存できませんでした" };
  refresh();
  return { ok: true };
}

/** 「ない」にする（食材リストから消す）。期限切れのまとめて消す・使い切った？でも使う */
export async function removePantryItemsAction(ids: string[]): Promise<PantryResult> {
  await requireCookUser();
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 200 || !ids.every((id) => UUID_RE.test(id))) {
    return { ok: false, error: "消すものを選んでください" };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.from("pantry_items").delete().in("id", ids).select("id");
  if (error) return { ok: false, error: "消せませんでした" };
  refresh();
  return { ok: true, count: data.length };
}

/** いつもあるに入れる・外す */
export async function setStapleAction(ingredientId: string, on: boolean): Promise<PantryResult> {
  await requireCookUser();
  if (!UUID_RE.test(ingredientId)) return { ok: false, error: "不正な食材です" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_staple", { p_ingredient: ingredientId, p_on: Boolean(on) });
  if (error) return { ok: false, error: "保存できませんでした" };
  refresh();
  return { ok: true };
}

/** 家族のいつも作る人数（レシピ画面・作るモード・買い物の分量の最初の人数） */
export async function setHouseholdServingsAction(servings: number): Promise<PantryResult> {
  await requireCookUser();
  if (!Number.isInteger(servings) || servings < 1 || servings > 20) return { ok: false, error: "1〜20人で選んでください" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_household_servings", { p_servings: servings });
  if (error) return { ok: false, error: "保存できませんでした" };
  refresh();
  return { ok: true };
}
