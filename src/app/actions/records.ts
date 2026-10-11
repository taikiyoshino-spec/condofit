"use server";

import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { fromJstInputValue, type Entry, type ExerciseType } from "@/lib/records/format";
import { detectPersonalBests, formatMetric, METRIC_INFO, progressSeries } from "@/lib/records/progress";
import { getExercise, getMyExerciseHistory } from "@/lib/exercises/queries";

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

/**
 * 記録の保存（新規は sessionId = null）。本人以外の記録はDB側で更新できない。
 * 入力中の自動保存では revalidate: false にする（画面が再取得されて入力中の値が消えないように）。完了時に finishSessionAction で反映する
 */
export async function saveSessionAction(
  sessionId: string | null,
  input: SaveInput,
  options: { revalidate?: boolean } = {},
): Promise<SaveResult> {
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
  if (options.revalidate !== false) revalidate();
  const savedId = data as string;
  return { ok: true, id: savedId };
}

export type FinishResult = { personalBests: string[]; checkedIn: boolean };

/**
 * 入力の完了時: 表示を最新にし、最終的な記録で自己ベストを判定する（入力途中では判定しない）。
 * チェックイン中かどうかも返す（完了時にチェックアウトを確認するため）
 */
export async function finishSessionAction(sessionId: string | null): Promise<FinishResult> {
  const member = await requireMember();
  revalidate();
  const supabase = await createClient();

  const { data: active } = await supabase
    .from("check_ins")
    .select("id")
    .eq("user_id", member.id)
    .eq("status", "active")
    .maybeSingle();

  let personalBests: string[] = [];
  if (sessionId && UUID_RE.test(sessionId)) {
    const { data } = await supabase
      .from("training_sessions")
      .select("id, session_exercises(exercise_id, exercise_entries(weight_kg, reps, duration_min, distance_km))")
      .eq("id", sessionId)
      .eq("user_id", member.id)
      .maybeSingle();
    if (data) {
      type SavedRow = { session_exercises: { exercise_id: string; exercise_entries: Partial<Entry>[] }[] };
      const saved = (data as unknown as SavedRow).session_exercises.map((se) => ({ exercise_id: se.exercise_id, entries: se.exercise_entries }));
      // 自己ベストの判定に失敗しても完了自体は成功扱い
      personalBests = await findPersonalBests(member.id, sessionId, saved).catch(() => []);
    }
  }
  return { personalBests, checkedIn: Boolean(active) };
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

type SavedExercise = { exercise_id: string; entries: Partial<Entry>[] };

// DBから読んだ値は文字列のこともあるので数値にそろえる
const toNum = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
const toEntry = (e: Partial<Entry>): Entry => ({
  weight_kg: toNum(e.weight_kg),
  reps: toNum(e.reps),
  duration_min: toNum(e.duration_min),
  distance_km: toNum(e.distance_km),
});

/** 今回保存した記録で更新した自己ベスト（「ラットプル 最大重量 60kg×5回」の形）。過去の自分の記録とだけ比べる */
async function findPersonalBests(userId: string, savedId: string, saved: SavedExercise[]): Promise<string[]> {
  const ids = [...new Set(saved.map((s) => s.exercise_id))];
  if (ids.length === 0) return [];
  const supabase = await createClient();
  const [exercises, past] = await Promise.all([
    supabase.from("exercises").select("id, name, type").in("id", ids),
    supabase
      .from("training_sessions")
      .select("id, session_exercises!inner(exercise_id, exercise_entries(weight_kg, reps, duration_min, distance_km))")
      .eq("user_id", userId)
      .neq("id", savedId)
      .in("session_exercises.exercise_id", ids)
      .limit(1000),
  ]);
  if (exercises.error || past.error) return [];

  type PastRow = { session_exercises: { exercise_id: string; exercise_entries: Entry[] }[] };
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  const messages: string[] = [];
  for (const ex of exercises.data as { id: string; name: string; type: ExerciseType }[]) {
    const current = saved.filter((s) => s.exercise_id === ex.id).flatMap((s) => s.entries.map(toEntry));
    // 過去はセッション単位（同じセッション内の同じ種目はまとめる）
    const others = (past.data as unknown as PastRow[]).map((row) =>
      row.session_exercises
        .filter((se) => se.exercise_id === ex.id)
        .flatMap((se) =>
          se.exercise_entries.map((e) => ({
            weight_kg: num(e.weight_kg),
            reps: num(e.reps),
            duration_min: num(e.duration_min),
            distance_km: num(e.distance_km),
          })),
        ),
    );
    for (const pb of detectPersonalBests(ex.type, current, others)) {
      messages.push(`${ex.name} ${METRIC_INFO[pb.metric].label} ${formatMetric(pb.metric, pb.value, pb.repsAtMax)}`);
    }
  }
  return messages;
}

export type ExerciseHistoryResult = {
  ok: boolean;
  type: ExerciseType;
  sessions: { date: string; entries: Entry[] }[];
  best: string | null;
};

/** 記録の入力中に見る、その種目の最近の記録（入力中の記録は除く、新しい順に最大8回分）と自己ベスト */
export async function exerciseHistoryAction(exerciseId: string, excludeSessionId: string | null): Promise<ExerciseHistoryResult> {
  const member = await requireMember();
  const empty: ExerciseHistoryResult = { ok: false, type: "weight", sessions: [], best: null };
  if (!UUID_RE.test(exerciseId)) return empty;
  const exercise = await getExercise(exerciseId);
  if (!exercise) return empty;
  const history = (await getMyExerciseHistory(member.id, exercise)).filter((h) => h.sessionId !== excludeSessionId);
  const series = progressSeries(
    history.map((h) => ({ date: h.date, entries: h.entries })),
    exercise.type === "weight" ? "maxWeight" : "duration",
  );
  const bestPoint = series.find((p) => p.isBest);
  return {
    ok: true,
    type: exercise.type,
    sessions: history.slice(0, 8).map((h) => ({ date: h.date, entries: h.entries })),
    best: bestPoint ? formatMetric(exercise.type === "weight" ? "maxWeight" : "duration", bestPoint.value, bestPoint.repsAtMax) : null,
  };
}
