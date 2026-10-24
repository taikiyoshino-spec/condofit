import "server-only";
import { createClient } from "@/lib/supabase/server";
import { addMonths, monthOf, todayJst } from "@/lib/date";
import type { Entry, ExerciseType } from "./format";
import { monthBounds } from "./parts-queries";
import type { MonthReviewFacts, ReviewSession } from "./review";

export type MonthReview = { month: string; facts: MonthReviewFacts; comment: string | null; tip: string | null };

/** ふりかえりを出す月（先月） */
export function reviewMonth(today = todayJst()): string {
  return addMonths(monthOf(today), -1);
}

/** 保存済みのふりかえり（本人の分だけ読める） */
export async function getMonthReview(userId: string, month: string): Promise<MonthReview | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("monthly_reviews").select("month, facts, comment, tip").eq("user_id", userId).eq("month", month).maybeSingle();
  return data ? { month: data.month as string, facts: data.facts as MonthReviewFacts, comment: data.comment as string | null, tip: data.tip as string | null } : null;
}

/** その月に記録があるか */
export async function hasSessionsIn(userId: string, month: string): Promise<boolean> {
  const supabase = await createClient();
  const { from, to } = monthBounds(month);
  const { count } = await supabase
    .from("training_sessions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("performed_at", new Date(`${from}T00:00:00+09:00`).toISOString())
    .lt("performed_at", new Date(`${to}T00:00:00+09:00`).toISOString());
  return (count ?? 0) > 0;
}

/** その月の終わりまでの自分の記録（自己ベスト・初めての種目の判定に前の記録も使う） */
export async function getReviewSessions(userId: string, month: string): Promise<ReviewSession[]> {
  const supabase = await createClient();
  const { to } = monthBounds(month);
  const { data, error } = await supabase
    .from("training_sessions")
    .select(
      "performed_at, session_exercises(exercise_id, exercises(name, type, body_part_id, owner_user_id), exercise_entries(weight_kg, reps, duration_min, distance_km))",
    )
    .eq("user_id", userId)
    .lt("performed_at", new Date(`${to}T00:00:00+09:00`).toISOString())
    .order("performed_at", { ascending: false })
    .limit(1500);
  if (error) throw error;
  type Row = {
    performed_at: string;
    session_exercises: {
      exercise_id: string;
      exercises: { name: string; type: ExerciseType; body_part_id: string | null; owner_user_id: string | null } | null;
      exercise_entries: Entry[];
    }[];
  };
  const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return (data as unknown as Row[]).map((s) => ({
    userId,
    performedAt: s.performed_at,
    exercises: s.session_exercises.map((se) => ({
      exerciseId: se.exercise_id,
      exerciseName: se.exercises?.name ?? "",
      type: se.exercises?.type ?? "weight",
      bodyPartId: se.exercises?.body_part_id ?? null,
      custom: !se.exercises || se.exercises.owner_user_id !== null,
      entries: se.exercise_entries.map((e) => ({ weight_kg: n(e.weight_kg), reps: n(e.reps), duration_min: n(e.duration_min), distance_km: n(e.distance_km) })),
    })),
  }));
}
