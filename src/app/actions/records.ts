"use server";

import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { fromJstInputValue, type Entry } from "@/lib/records/format";

export type SaveInput = {
  performedAtLocal: string; // JST の "YYYY-MM-DDTHH:mm"
  exercises: { exerciseId: string; entries: Entry[] }[];
};

export type SaveResult = { ok: true; id: string } | { ok: false; error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_EXERCISES = 50;
const MAX_ENTRIES = 50;

function clean(v: unknown, { integer = false, max = 9999 } = {}): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > max) return null;
  return integer ? Math.round(n) : Math.round(n * 100) / 100;
}

function revalidate() {
  revalidatePath("/records", "layout");
  revalidatePath("/");
  revalidatePath("/exercises", "layout");
  revalidatePath("/mypage/activity", "layout");
}

/** 記録の保存（新規は sessionId = null）。本人以外の記録はDB側で更新できない */
export async function saveSessionAction(sessionId: string | null, input: SaveInput): Promise<SaveResult> {
  await requireMember();
  if (sessionId !== null && !UUID_RE.test(sessionId)) return { ok: false, error: "不正な記録です" };

  const performedAt = fromJstInputValue(input.performedAtLocal);
  if (!performedAt) return { ok: false, error: "日時を入力してください" };
  if (!Array.isArray(input.exercises) || input.exercises.length > MAX_EXERCISES) {
    return { ok: false, error: "種目が多すぎます" };
  }

  const payload = [];
  for (const ex of input.exercises) {
    if (!UUID_RE.test(ex.exerciseId)) return { ok: false, error: "不正な種目です" };
    const entries = (ex.entries ?? []).slice(0, MAX_ENTRIES).map((e) => ({
      weight_kg: clean(e.weight_kg, { max: 999 }),
      reps: clean(e.reps, { integer: true, max: 9999 }),
      duration_min: clean(e.duration_min, { max: 9999 }),
      distance_km: clean(e.distance_km, { max: 999 }),
    }));
    // 数値なしでも「やった」を残すため、行が0件なら空の1行を入れる
    payload.push({ exercise_id: ex.exerciseId, entries: entries.length ? entries : [{}] });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_training_session", {
    p_session_id: sessionId,
    p_performed_at: performedAt,
    p_exercises: payload,
  });
  if (error) {
    return { ok: false, error: error.message.includes("forbidden") ? "自分の記録だけ編集できます" : "保存できませんでした" };
  }
  revalidate();
  return { ok: true, id: data as string };
}

export async function deleteSessionAction(sessionId: string): Promise<{ ok: boolean; error?: string }> {
  const member = await requireMember();
  if (!UUID_RE.test(sessionId)) return { ok: false, error: "不正な記録です" };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("training_sessions")
    .delete()
    .eq("id", sessionId)
    .eq("user_id", member.id)
    .select("id");
  if (error || !data.length) return { ok: false, error: "自分の記録だけ削除できます" };
  revalidate();
  return { ok: true };
}
