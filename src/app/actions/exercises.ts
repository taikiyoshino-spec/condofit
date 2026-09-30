"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

// 種目マスタ管理（管理者のみ）。権限はDBのRLSでも強制している。物理削除はせず active で非表示にする。

export type MasterResult = { ok: true } | { ok: false; error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_NAME = 40;

function cleanName(raw: string): string | null {
  const name = raw.normalize("NFC").trim();
  return name && [...name].length <= MAX_NAME ? name : null;
}

function fail(error: { code?: string; message: string }): MasterResult {
  return { ok: false, error: error.code === "23505" ? "同じ名前がすでにあります" : "保存できませんでした" };
}

function revalidate() {
  revalidatePath("/admin/exercises");
  revalidatePath("/exercises", "layout");
  revalidatePath("/records", "layout");
}

type Table = "body_parts" | "exercises";

/** 隣と表示順を入れ替える（同じ順番が並んでいる場合は10刻みで振り直す） */
async function move(table: Table, id: string, direction: -1 | 1, scope?: { column: string; value: string }): Promise<MasterResult> {
  const supabase = await createClient();
  let query = supabase.from(table).select("id, display_order").order("display_order").order("name");
  if (scope) query = query.eq(scope.column, scope.value);
  const { data, error } = await query;
  if (error) return fail(error);

  const ids = data.map((r) => r.id as string);
  const index = ids.indexOf(id);
  const to = index + direction;
  if (index < 0 || to < 0 || to >= ids.length) return { ok: true };
  [ids[index], ids[to]] = [ids[to], ids[index]];

  for (const [i, rowId] of ids.entries()) {
    const order = (i + 1) * 10;
    if (data.find((r) => r.id === rowId)?.display_order === order) continue;
    const { error: e } = await supabase.from(table).update({ display_order: order }).eq("id", rowId);
    if (e) return fail(e);
  }
  revalidate();
  return { ok: true };
}

// ---- 部位 ----

export async function addBodyPartAction(rawName: string): Promise<MasterResult> {
  await requireAdmin();
  const name = cleanName(rawName);
  if (!name) return { ok: false, error: `名前を${MAX_NAME}文字以内で入力してください` };
  const supabase = await createClient();
  const { data: last } = await supabase.from("body_parts").select("display_order").order("display_order", { ascending: false }).limit(1);
  const { error } = await supabase.from("body_parts").insert({ name, display_order: ((last?.[0]?.display_order as number) ?? 0) + 10 });
  if (error) return fail(error);
  revalidate();
  return { ok: true };
}

export async function updateBodyPartAction(id: string, patch: { name?: string; active?: boolean }): Promise<MasterResult> {
  await requireAdmin();
  if (!UUID_RE.test(id)) return { ok: false, error: "不正な部位です" };
  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    const name = cleanName(patch.name);
    if (!name) return { ok: false, error: `名前を${MAX_NAME}文字以内で入力してください` };
    update.name = name;
  }
  if (patch.active !== undefined) update.active = Boolean(patch.active);
  const supabase = await createClient();
  const { error } = await supabase.from("body_parts").update(update).eq("id", id);
  if (error) return fail(error);
  revalidate();
  return { ok: true };
}

export async function moveBodyPartAction(id: string, direction: -1 | 1): Promise<MasterResult> {
  await requireAdmin();
  if (!UUID_RE.test(id)) return { ok: false, error: "不正な部位です" };
  return move("body_parts", id, direction === -1 ? -1 : 1);
}

// ---- 種目 ----

type ExerciseInput = { name: string; bodyPartId: string; type: string };

function validateExercise(input: ExerciseInput) {
  const name = cleanName(input.name);
  if (!name) return { error: `種目名を${MAX_NAME}文字以内で入力してください` };
  if (!UUID_RE.test(input.bodyPartId)) return { error: "部位を選んでください" };
  // MVPの種目タイプは重量系・有酸素の2種類のみ
  if (input.type !== "weight" && input.type !== "cardio") return { error: "種目タイプを選んでください" };
  return { value: { name, body_part_id: input.bodyPartId, type: input.type } };
}

export async function addExerciseAction(input: ExerciseInput): Promise<MasterResult> {
  await requireAdmin();
  const v = validateExercise(input);
  if (!v.value) return { ok: false, error: v.error };
  const supabase = await createClient();
  const { data: last } = await supabase
    .from("exercises")
    .select("display_order")
    .eq("body_part_id", v.value.body_part_id)
    .order("display_order", { ascending: false })
    .limit(1);
  const { error } = await supabase
    .from("exercises")
    .insert({ ...v.value, display_order: ((last?.[0]?.display_order as number) ?? 0) + 10 });
  if (error) return fail(error);
  revalidate();
  return { ok: true };
}

export async function updateExerciseAction(id: string, input: ExerciseInput): Promise<MasterResult> {
  await requireAdmin();
  if (!UUID_RE.test(id)) return { ok: false, error: "不正な種目です" };
  const v = validateExercise(input);
  if (!v.value) return { ok: false, error: v.error };
  const supabase = await createClient();
  const { error } = await supabase.from("exercises").update(v.value).eq("id", id);
  if (error) return fail(error);
  revalidate();
  return { ok: true };
}

export async function setExerciseActiveAction(id: string, active: boolean): Promise<MasterResult> {
  await requireAdmin();
  if (!UUID_RE.test(id)) return { ok: false, error: "不正な種目です" };
  const supabase = await createClient();
  const { error } = await supabase.from("exercises").update({ active: Boolean(active) }).eq("id", id);
  if (error) return fail(error);
  revalidate();
  return { ok: true };
}

export async function moveExerciseAction(id: string, bodyPartId: string, direction: -1 | 1): Promise<MasterResult> {
  await requireAdmin();
  if (!UUID_RE.test(id) || !UUID_RE.test(bodyPartId)) return { ok: false, error: "不正な種目です" };
  return move("exercises", id, direction === -1 ? -1 : 1, { column: "body_part_id", value: bodyPartId });
}
