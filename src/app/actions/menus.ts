"use server";

import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { Entry } from "@/lib/records/format";

export type MenuInput = { name: string; items: { exerciseId: string; sets: Partial<Entry>[] }[] };
export type MenuResult = { ok: true; id: string } | { ok: false; error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_ITEMS = 30;
const MAX_SETS = 30;

function clean(v: unknown, { integer = false, max = 9999 } = {}): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > max) return null;
  return integer ? Math.round(n) : Math.round(n * 100) / 100;
}

/** 自分のメニューの保存（新規は menuId = null）。他人のメニューはDB側で更新できない */
export async function saveMenuAction(menuId: string | null, input: MenuInput): Promise<MenuResult> {
  await requireMember();
  if (menuId !== null && !UUID_RE.test(menuId)) return { ok: false, error: "不正なメニューです" };
  const name = String(input.name ?? "").trim();
  if (!name || [...name].length > 40) return { ok: false, error: "メニュー名を40文字以内で入力してください" };
  if (!Array.isArray(input.items) || input.items.length === 0) return { ok: false, error: "種目を1つ以上追加してください" };
  if (input.items.length > MAX_ITEMS) return { ok: false, error: "種目が多すぎます" };

  const items = [];
  for (const it of input.items) {
    if (!UUID_RE.test(it.exerciseId)) return { ok: false, error: "不正な種目です" };
    const sets = (it.sets ?? []).slice(0, MAX_SETS).map((s) => ({
      weight_kg: clean(s.weight_kg, { max: 999 }),
      reps: clean(s.reps, { integer: true }),
      duration_min: clean(s.duration_min),
      distance_km: clean(s.distance_km, { max: 999 }),
    }));
    items.push({ exercise_id: it.exerciseId, sets });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_workout_menu", { p_menu_id: menuId, p_name: name, p_items: items });
  if (error) return { ok: false, error: error.message.includes("forbidden") ? "自分のメニューだけ編集できます" : "保存できませんでした" };
  revalidatePath("/records", "layout");
  return { ok: true, id: data as string };
}

export async function deleteMenuAction(menuId: string): Promise<{ ok: boolean; error?: string }> {
  const member = await requireMember();
  if (!UUID_RE.test(menuId)) return { ok: false, error: "不正なメニューです" };
  const supabase = await createClient();
  const { data, error } = await supabase.from("workout_menus").delete().eq("id", menuId).eq("user_id", member.id).select("id");
  if (error || !data.length) return { ok: false, error: "削除できませんでした" };
  revalidatePath("/records", "layout");
  return { ok: true };
}
