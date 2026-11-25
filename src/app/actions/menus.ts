"use server";

import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { Entry } from "@/lib/records/format";
import { getMyMenu, listMyMenus } from "@/lib/menus/queries";
import { applyValueChanges, SYNC_FIELDS, type AppliedChange, type SyncField, type ValueChange } from "@/lib/menus/sync";

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
      load: clean(s.load, { max: 999 }),
    }));
    items.push({ exercise_id: it.exerciseId, sets });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_workout_menu", { p_menu_id: menuId, p_name: name, p_items: items });
  if (error) return { ok: false, error: error.message.includes("forbidden") ? "自分のメニューだけ編集できます" : "保存できませんでした" };
  revalidatePath("/records", "layout");
  return { ok: true, id: data as string };
}

/**
 * 記録の完了時: メニューの予定より重い重量でできたセットを、メニューに反映する（本人が確認してから呼ぶ）。
 * メニューがその後に編集されていても壊さないよう、同じ位置の種目が一致し、今の重量より重いときだけ上書きする
 */
export async function raiseMenuWeightsAction(
  menuId: string,
  changes: { item: number; set: number; exerciseId: string; weight: number }[],
): Promise<{ ok: boolean; updated: number }> {
  const member = await requireMember();
  if (!UUID_RE.test(menuId) || !Array.isArray(changes)) return { ok: false, updated: 0 };
  const menu = await getMyMenu(member.id, menuId);
  if (!menu) return { ok: false, updated: 0 };

  const items = menu.items.map((it) => ({ exerciseId: it.exerciseId, sets: it.sets.map((s) => ({ ...s })) }));
  let updated = 0;
  for (const c of changes.slice(0, MAX_ITEMS * MAX_SETS)) {
    const weight = clean(c.weight, { max: 999 });
    const set = items[c.item]?.exerciseId === c.exerciseId ? items[c.item].sets[c.set] : undefined;
    if (weight === null || !set || set.weight_kg === null || set.weight_kg === undefined || weight <= set.weight_kg) continue;
    set.weight_kg = weight;
    updated++;
  }
  if (updated === 0) return { ok: true, updated: 0 };
  const result = await saveMenuAction(menuId, { name: menu.name, items });
  return { ok: result.ok, updated: result.ok ? updated : 0 };
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

/** ほかのメニューに合わせる候補（確認画面に出す）。exerciseName は表示用 */
export type MenuSyncCandidate = {
  menuId: string;
  name: string;
  changes: (AppliedChange & { exerciseName: string })[];
};

/** 受け取った変更を検査してそろえる（数値・種目・数の上限） */
function cleanChanges(changes: unknown): ValueChange[] {
  if (!Array.isArray(changes)) return [];
  const out: ValueChange[] = [];
  for (const c of changes.slice(0, MAX_ITEMS * MAX_SETS) as Partial<ValueChange>[]) {
    const from = clean(c?.from, { max: 999 });
    const to = clean(c?.to, { max: 999 });
    if (!UUID_RE.test(String(c?.exerciseId)) || !SYNC_FIELDS.includes(c?.field as SyncField) || from === null || to === null) continue;
    out.push({ exerciseId: String(c!.exerciseId), field: c!.field as SyncField, from, to });
  }
  return out;
}

/**
 * メニューの重さ・負荷を変えたとき: 同じ種目で、変える前と同じ値のセットがあるほかの自分のメニューを探す。
 * 変えるのは本人が確認してから（applyMenuSyncAction）
 */
export async function findMenuSyncAction(menuId: string, changes: ValueChange[]): Promise<MenuSyncCandidate[]> {
  const member = await requireMember();
  const cleaned = cleanChanges(changes);
  if (!UUID_RE.test(menuId) || cleaned.length === 0) return [];
  const menus = await listMyMenus(member.id);
  const candidates: MenuSyncCandidate[] = [];
  for (const m of menus) {
    if (m.id === menuId) continue;
    const { applied } = applyValueChanges(m.items, cleaned);
    if (applied.length === 0) continue;
    const nameOf = (id: string) => m.items.find((it) => it.exerciseId === id)?.name ?? "";
    candidates.push({ menuId: m.id, name: m.name, changes: applied.map((a) => ({ ...a, exerciseName: nameOf(a.exerciseId) })) });
  }
  return candidates;
}

/** 選んだほかのメニューに、同じ変更を当てはめる（今のメニューを読み直してから。違う値のセットには触らない） */
export async function applyMenuSyncAction(menuIds: string[], changes: ValueChange[]): Promise<{ ok: boolean; updated: number }> {
  const member = await requireMember();
  const cleaned = cleanChanges(changes);
  if (!Array.isArray(menuIds) || cleaned.length === 0) return { ok: false, updated: 0 };
  let updated = 0;
  let ok = true;
  for (const id of menuIds.filter((id) => UUID_RE.test(String(id))).slice(0, 50)) {
    const menu = await getMyMenu(member.id, id);
    if (!menu) continue;
    const { items, applied } = applyValueChanges(menu.items, cleaned);
    if (applied.length === 0) continue;
    const result = await saveMenuAction(id, { name: menu.name, items });
    if (result.ok) updated++;
    else ok = false;
  }
  return { ok, updated };
}
