"use server";

import { requireMember } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { ExerciseType } from "@/lib/records/format";
import type { CatalogExercise } from "@/lib/records/queries";

export type CustomExerciseResult = { ok: true; exercise: CatalogExercise } | { ok: false; error: string };

const MAX_NAME = 40;

/** ilike 用にワイルドカードをエスケープ（大文字小文字を区別しない完全一致） */
const ilikeExact = (v: string) => v.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * 自分専用の種目を作る（自由入力）。本人にしか見えない。
 * マスタに同じ名前があればマスタの種目を、自分の種目に同じ名前があればそれを返す（新しく作らない）。
 */
export async function createCustomExerciseAction(
  rawName: string,
  type: ExerciseType,
  excludesBar = false,
): Promise<CustomExerciseResult> {
  const member = await requireMember();
  const name = String(rawName ?? "").normalize("NFC").trim();
  if (!name || [...name].length > MAX_NAME) return { ok: false, error: `種目名を${MAX_NAME}文字以内で入力してください` };
  if (type !== "weight" && type !== "cardio") return { ok: false, error: "種目のタイプを選んでください" };

  const supabase = await createClient();
  // RLS でマスタと自分の種目だけが見える
  const { data: existing } = await supabase
    .from("exercises")
    .select("id, name, type, body_part_id, owner_user_id, excludes_bar")
    .ilike("name", ilikeExact(name))
    .order("owner_user_id", { ascending: true, nullsFirst: true })
    .limit(1);
  const found = existing?.[0];
  if (found) {
    return {
      ok: true,
      exercise: {
        id: found.id as string,
        name: found.name as string,
        type: found.type as ExerciseType,
        bodyPartId: (found.body_part_id as string | null) ?? null,
        custom: found.owner_user_id !== null,
        excludesBar: Boolean(found.excludes_bar),
      },
    };
  }

  const { data, error } = await supabase
    .from("exercises")
    .insert({ name, type, owner_user_id: member.id, excludes_bar: type === "weight" && Boolean(excludesBar) })
    .select("id, name, type, excludes_bar")
    .single();
  if (error) return { ok: false, error: error.code === "23505" ? "同じ名前の種目があります" : "種目を作れませんでした" };
  return {
    ok: true,
    exercise: {
      id: data.id as string,
      name: data.name as string,
      type: data.type as ExerciseType,
      bodyPartId: null,
      custom: true,
      excludesBar: Boolean(data.excludes_bar),
    },
  };
}

/** 自分専用の種目の「バーの重さを除いて記録する」を切り替える（マスタの種目は管理画面から） */
export async function setCustomExerciseExcludesBarAction(exerciseId: string, value: boolean): Promise<{ ok: boolean }> {
  await requireMember();
  if (!/^[0-9a-f-]{36}$/i.test(exerciseId)) return { ok: false };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_my_exercise_excludes_bar", { p_exercise: exerciseId, p_value: Boolean(value) });
  return { ok: !error && data === true };
}
