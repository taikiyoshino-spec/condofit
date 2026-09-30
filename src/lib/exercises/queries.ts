import "server-only";
import { createClient } from "@/lib/supabase/server";
import { jstDateOf, sessionRepresentative, type Entry, type ExerciseType } from "@/lib/records/format";
import { monthOf, todayJst } from "@/lib/date";

export type BodyPart = { id: string; name: string; displayOrder: number; active: boolean };
export type Exercise = {
  id: string;
  name: string;
  type: ExerciseType;
  bodyPartId: string;
  bodyPartName: string;
  displayOrder: number;
  active: boolean;
};

type ExerciseRow = {
  id: string;
  name: string;
  type: ExerciseType;
  body_part_id: string;
  display_order: number;
  active: boolean;
  body_parts: { name: string } | null;
};

const toExercise = (r: ExerciseRow): Exercise => ({
  id: r.id,
  name: r.name,
  type: r.type,
  bodyPartId: r.body_part_id,
  bodyPartName: r.body_parts?.name ?? "",
  displayOrder: r.display_order,
  active: r.active,
});

const EXERCISE_SELECT = "id, name, type, body_part_id, display_order, active, body_parts(name)";

/** 部位（管理画面では非表示も含める） */
export async function listBodyParts({ includeHidden = false } = {}): Promise<BodyPart[]> {
  const supabase = await createClient();
  let query = supabase.from("body_parts").select("id, name, display_order, active").order("display_order").order("name");
  if (!includeHidden) query = query.eq("active", true);
  const { data, error } = await query;
  if (error) throw error;
  return data.map((p) => ({
    id: p.id as string,
    name: p.name as string,
    displayOrder: p.display_order as number,
    active: p.active as boolean,
  }));
}

export async function listExercises({ includeHidden = false, bodyPartId }: { includeHidden?: boolean; bodyPartId?: string } = {}) {
  const supabase = await createClient();
  let query = supabase.from("exercises").select(EXERCISE_SELECT).order("display_order").order("name");
  if (!includeHidden) query = query.eq("active", true);
  if (bodyPartId) query = query.eq("body_part_id", bodyPartId);
  const { data, error } = await query;
  if (error) throw error;
  return (data as unknown as ExerciseRow[]).map(toExercise);
}

/** 1種目（履歴から開けるよう非表示の種目も返す） */
export async function getExercise(id: string): Promise<Exercise | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("exercises").select(EXERCISE_SELECT).eq("id", id).maybeSingle();
  return data ? toExercise(data as unknown as ExerciseRow) : null;
}

export type MemberRepresentative = { userId: string; displayName: string; value: Entry };

/** 今月のメンバー代表値（ランキングではないため表示名順） */
export async function getMonthRepresentatives(exerciseId: string): Promise<MemberRepresentative[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("exercise_month_summary", { p_exercise_id: exerciseId });
  if (error) throw error;
  const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return (data as Record<string, unknown>[]).map((r) => ({
    userId: r.user_id as string,
    displayName: r.display_name as string,
    value: { weight_kg: n(r.weight_kg), reps: n(r.reps), duration_min: n(r.duration_min), distance_km: n(r.distance_km) },
  }));
}

export type HistoryPoint = { sessionId: string; date: string; value: Entry | null; entries: Entry[] };

/** 自分のその種目の過去推移（新しい順）。セッション内に同じ種目が複数あればまとめて代表値を出す */
export async function getMyExerciseHistory(userId: string, exercise: Exercise): Promise<HistoryPoint[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("training_sessions")
    .select(
      "id, performed_at, session_exercises!inner(exercise_id, display_order, exercise_entries(display_order, weight_kg, reps, duration_min, distance_km))",
    )
    .eq("user_id", userId)
    .eq("session_exercises.exercise_id", exercise.id)
    .order("performed_at", { ascending: false })
    .limit(200);
  if (error) throw error;

  const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  type Row = {
    id: string;
    performed_at: string;
    session_exercises: { display_order: number; exercise_entries: (Entry & { display_order: number })[] }[];
  };
  return (data as unknown as Row[]).map((s) => {
    const entries = [...s.session_exercises]
      .sort((a, b) => a.display_order - b.display_order)
      .flatMap((se) => [...se.exercise_entries].sort((a, b) => a.display_order - b.display_order))
      .map((e) => ({ weight_kg: n(e.weight_kg), reps: n(e.reps), duration_min: n(e.duration_min), distance_km: n(e.distance_km) }));
    return { sessionId: s.id, date: jstDateOf(s.performed_at), value: sessionRepresentative(exercise.type, entries), entries };
  });
}

export type ActivitySummary = {
  month: { visits: number; trainingDays: number; exerciseKinds: number };
  total: { visits: number; trainingDays: number; exerciseKinds: number };
  byExercise: { exerciseId: string; name: string; type: ExerciseType; count: number; lastDate: string }[];
};

/** 個人活動のサマリー（Fit訪問 = セッション数。チェックインは数えない） */
export async function getMyActivitySummary(userId: string): Promise<ActivitySummary> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("training_sessions")
    .select("id, performed_at, session_exercises(exercise_id, exercises(name, type))")
    .eq("user_id", userId)
    .order("performed_at", { ascending: false })
    .limit(5000);
  if (error) throw error;

  type Row = {
    performed_at: string;
    session_exercises: { exercise_id: string; exercises: { name: string; type: ExerciseType } | null }[];
  };
  const thisMonth = monthOf(todayJst());
  const stats = () => ({ visits: 0, days: new Set<string>(), kinds: new Set<string>() });
  const month = stats();
  const total = stats();
  const byExercise = new Map<string, ActivitySummary["byExercise"][number]>();

  for (const s of data as unknown as Row[]) {
    const date = jstDateOf(s.performed_at);
    const targets = monthOf(date) === thisMonth ? [total, month] : [total];
    const ids = new Set(s.session_exercises.map((se) => se.exercise_id));
    for (const t of targets) {
      t.visits++;
      t.days.add(date);
      ids.forEach((id) => t.kinds.add(id));
    }
    // 実施回数は「その種目を行ったセッション数」（同一セッション内の重複は1回）。新しい順に見るので最初が最終実施日
    for (const id of ids) {
      const se = s.session_exercises.find((x) => x.exercise_id === id);
      const cur = byExercise.get(id);
      if (cur) cur.count++;
      else {
        byExercise.set(id, {
          exerciseId: id,
          name: se?.exercises?.name ?? "",
          type: se?.exercises?.type ?? "weight",
          count: 1,
          lastDate: date,
        });
      }
    }
  }

  const fin = (t: ReturnType<typeof stats>) => ({ visits: t.visits, trainingDays: t.days.size, exerciseKinds: t.kinds.size });
  return {
    month: fin(month),
    total: fin(total),
    byExercise: [...byExercise.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ja")),
  };
}
