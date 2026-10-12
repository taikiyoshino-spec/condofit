import "server-only";
import { createClient } from "@/lib/supabase/server";
import { addDays, monthRange, todayJst } from "@/lib/date";
import { listBodyParts, listExercises } from "@/lib/exercises/queries";
import type { BodyPartRef, PartSession } from "./parts";

export type PartInfo = BodyPartRef & { cardio: boolean; freeWeight: boolean };

/** 表示する部位（マスタの順）。種目がすべて有酸素の部位は「有酸素」として別扱い */
export async function listPartInfo(): Promise<PartInfo[]> {
  const [parts, exercises] = await Promise.all([listBodyParts(), listExercises()]);
  return parts.map((p) => {
    const mine = exercises.filter((e) => e.bodyPartId === p.id);
    return {
      id: p.id,
      name: p.name,
      cardio: mine.length > 0 && mine.every((e) => e.type === "cardio"),
      // フリーウェイトは筋肉の部位ではないので「少ない部位」の候補にしない
      freeWeight: p.name === "フリーウェイト",
    };
  });
}

/** 期間内のセッションを部位の集計用に取得（userId を省略すると全員分。from/to は JST の日付、to は含まない） */
export async function getPartSessions({ userId, from, to }: { userId?: string; from: string; to: string }): Promise<PartSession[]> {
  const supabase = await createClient();
  let query = supabase
    .from("training_sessions")
    .select(
      "user_id, performed_at, session_exercises(exercise_id, exercises(name, type, body_part_id, owner_user_id), exercise_entries(duration_min, distance_km))",
    )
    .gte("performed_at", new Date(`${from}T00:00:00+09:00`).toISOString())
    .lt("performed_at", new Date(`${to}T00:00:00+09:00`).toISOString())
    .limit(5000);
  if (userId) query = query.eq("user_id", userId);
  const { data, error } = await query;
  if (error) throw error;

  type Row = {
    user_id: string;
    performed_at: string;
    session_exercises: {
      exercise_id: string;
      // 他の人の自分専用の種目は見えないので null になる
      exercises: { name: string; type: "weight" | "cardio"; body_part_id: string | null; owner_user_id: string | null } | null;
      exercise_entries: { duration_min: number | null; distance_km: number | null }[];
    }[];
  };
  const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return (data as unknown as Row[]).map((s) => ({
    userId: s.user_id,
    performedAt: s.performed_at,
    exercises: s.session_exercises.map((se) => ({
      exerciseId: se.exercise_id,
      exerciseName: se.exercises?.name ?? "",
      type: se.exercises?.type ?? "weight",
      bodyPartId: se.exercises?.body_part_id ?? null,
      custom: !se.exercises || se.exercises.owner_user_id !== null,
      entries: se.exercise_entries.map((e) => ({ duration_min: n(e.duration_min), distance_km: n(e.distance_km) })),
    })),
  }));
}

/** 直近4週間（今日を含む28日間） */
export function recentFourWeeks(today = todayJst()) {
  return { from: addDays(today, -27), to: addDays(today, 1) };
}

/** 月（"YYYY-MM"）の範囲を from/to に */
export function monthBounds(month: string) {
  const { start, end } = monthRange(month);
  return { from: start, to: addDays(end, 1) };
}
