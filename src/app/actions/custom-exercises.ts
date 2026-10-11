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
export async function createCustomExerciseAction(rawName: string, type: ExerciseType): Promise<CustomExerciseResult> {
  const member = await requireMember();
  const name = String(rawName ?? "").normalize("NFC").trim();
  if (!name || [...name].length > MAX_NAME) return { ok: false, error: `種目名を${MAX_NAME}文字以内で入力してください` };
  if (type !== "weight" && type !== "cardio") return { ok: false, error: "種目のタイプを選んでください" };

  const supabase = await createClient();
  // RLS でマスタと自分の種目だけが見える
  const { data: existing } = await supabase
    .from("exercises")
    .select("id, name, type, body_part_id, owner_user_id")
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
      },
    };
  }

  const { data, error } = await supabase
    .from("exercises")
    .insert({ name, type, owner_user_id: member.id })
    .select("id, name, type")
    .single();
  if (error) return { ok: false, error: error.code === "23505" ? "同じ名前の種目があります" : "種目を作れませんでした" };
  return { ok: true, exercise: { id: data.id as string, name: data.name as string, type: data.type as ExerciseType, bodyPartId: null, custom: true } };
}
