"use server";

import { revalidatePath } from "next/cache";
import { requireCookUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

// 家族の買い物リスト（D19）。自分の家族の分だけ扱えることは DB 側（RPC・RLS）で強制している

export type ShoppingResult = { ok: true; count?: number } | { ok: false; error: string };
export type ShoppingInput = { ingredientId: string | null; name: string; amount: string; recipeId: string | null };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuidOrNull = (v: unknown) => (typeof v === "string" && UUID_RE.test(v) ? v : null);
const validIds = (ids: string[]) => Array.isArray(ids) && ids.length > 0 && ids.length <= 200 && ids.every((id) => UUID_RE.test(id));

function refresh() {
  revalidatePath("/cook/shopping");
}

export async function addShoppingItemsAction(items: ShoppingInput[]): Promise<ShoppingResult> {
  await requireCookUser();
  if (!Array.isArray(items) || items.length === 0) return { ok: false, error: "追加するものを選んでください" };
  if (items.length > 100) return { ok: false, error: "一度に追加できるのは100品までです" };
  const payload = items.map((i) => ({
    ingredient_id: uuidOrNull(i.ingredientId),
    name: String(i.name ?? "").normalize("NFC").trim().slice(0, 30),
    amount: String(i.amount ?? "").trim().slice(0, 30),
    recipe_id: uuidOrNull(i.recipeId),
  }));
  if (payload.every((p) => !p.name && !p.ingredient_id)) return { ok: false, error: "名前を入力してください" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("add_shopping_items", { p_items: payload });
  if (error) return { ok: false, error: "追加できませんでした" };
  refresh();
  return { ok: true, count: data as number };
}

export async function setShoppingBoughtAction(ids: string[], bought: boolean): Promise<ShoppingResult> {
  await requireCookUser();
  if (!validIds(ids)) return { ok: false, error: "不正な項目です" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_shopping_bought", { p_ids: ids, p_bought: Boolean(bought) });
  if (error) return { ok: false, error: "保存できませんでした" };
  refresh();
  return { ok: true };
}

export async function deleteShoppingItemsAction(ids: string[]): Promise<ShoppingResult> {
  await requireCookUser();
  if (!validIds(ids)) return { ok: false, error: "不正な項目です" };
  const supabase = await createClient();
  const { error } = await supabase.from("shopping_items").delete().in("id", ids);
  if (error) return { ok: false, error: "削除できませんでした" };
  refresh();
  return { ok: true };
}

/** 買ったものを食材リストに入れ、買い物リストから消す */
export async function moveBoughtToPantryAction(): Promise<ShoppingResult> {
  await requireCookUser();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("move_bought_to_pantry");
  if (error) return { ok: false, error: "食材リストに入れられませんでした" };
  refresh();
  return { ok: true, count: data as number };
}
