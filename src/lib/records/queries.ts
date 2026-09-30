import "server-only";
import { createClient } from "@/lib/supabase/server";
import { jstDateOf } from "@/lib/records/format";
import { todayJst } from "@/lib/date";
import type { Entry, ExerciseType } from "@/lib/records/format";

export type SessionExercise = {
  exerciseId: string;
  name: string;
  type: ExerciseType;
  entries: Entry[];
};

export type Session = {
  id: string;
  userId: string;
  performedAt: string;
  exercises: SessionExercise[];
};

type Row = {
  id: string;
  user_id: string;
  performed_at: string;
  session_exercises: {
    exercise_id: string;
    display_order: number;
    exercises: { name: string; type: ExerciseType } | null;
    exercise_entries?: (Entry & { display_order: number })[];
  }[];
};

const toNumber = (v: unknown) => (v === null || v === undefined ? null : Number(v));

function toSession(r: Row): Session {
  return {
    id: r.id,
    userId: r.user_id,
    performedAt: r.performed_at,
    exercises: [...r.session_exercises]
      .sort((a, b) => a.display_order - b.display_order)
      .map((se) => ({
        exerciseId: se.exercise_id,
        name: se.exercises?.name ?? "",
        type: se.exercises?.type ?? "weight",
        entries: [...(se.exercise_entries ?? [])]
          .sort((a, b) => a.display_order - b.display_order)
          .map((e) => ({
            weight_kg: toNumber(e.weight_kg),
            reps: toNumber(e.reps),
            duration_min: toNumber(e.duration_min),
            distance_km: toNumber(e.distance_km),
          })),
      })),
  };
}

const DETAIL = `id, user_id, performed_at,
  session_exercises(exercise_id, display_order, exercises(name, type),
    exercise_entries(display_order, weight_kg, reps, duration_min, distance_km))`;

/** 自分の記録（新しい順）。日付一覧用なのでエントリは含めない */
export async function listMySessions(userId: string, limit = 200): Promise<Session[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("training_sessions")
    .select("id, user_id, performed_at, session_exercises(exercise_id, display_order, exercises(name, type))")
    .eq("user_id", userId)
    .order("performed_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as unknown as Row[]).map(toSession);
}

/** 指定日（JST）の自分の記録（詳細つき、古い順） */
export async function listMySessionsOn(userId: string, date: string): Promise<Session[]> {
  const supabase = await createClient();
  const start = new Date(`${date}T00:00:00+09:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  const { data, error } = await supabase
    .from("training_sessions")
    .select(DETAIL)
    .eq("user_id", userId)
    .gte("performed_at", start.toISOString())
    .lt("performed_at", end.toISOString())
    .order("performed_at");
  if (error) throw error;
  return (data as unknown as Row[]).map(toSession);
}

export async function getSession(id: string): Promise<Session | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("training_sessions").select(DETAIL).eq("id", id).maybeSingle();
  if (error || !data) return null;
  return toSession(data as unknown as Row);
}

export type CatalogExercise = { id: string; name: string; type: ExerciseType; bodyPartId: string };
export type Catalog = {
  bodyParts: { id: string; name: string }[];
  exercises: CatalogExercise[];
};

/** 種目マスタ（表示中のもののみ）。フロントにハードコードせずDBから取得する */
export async function getCatalog(): Promise<Catalog> {
  const supabase = await createClient();
  const [parts, exercises] = await Promise.all([
    supabase.from("body_parts").select("id, name").eq("active", true).order("display_order"),
    supabase
      .from("exercises")
      .select("id, name, type, body_part_id")
      .eq("active", true)
      .order("display_order")
      .order("name"),
  ]);
  if (parts.error) throw parts.error;
  if (exercises.error) throw exercises.error;
  return {
    bodyParts: parts.data.map((p) => ({ id: p.id as string, name: p.name as string })),
    exercises: exercises.data.map((e) => ({
      id: e.id as string,
      name: e.name as string,
      type: e.type as ExerciseType,
      bodyPartId: e.body_part_id as string,
    })),
  };
}

/**
 * 最近使った種目（直近順）と、各種目の前回の記録（初期値用）。
 * 前回の記録 = その種目を含む直近セッションでの、その種目の全行。
 */
export async function getMyExerciseHistory(userId: string, excludeSessionId?: string) {
  const supabase = await createClient();
  let query = supabase
    .from("training_sessions")
    .select(DETAIL)
    .eq("user_id", userId)
    .order("performed_at", { ascending: false })
    .limit(60);
  if (excludeSessionId) query = query.neq("id", excludeSessionId);
  const { data, error } = await query;
  if (error) throw error;

  const recent: string[] = [];
  const lastEntries: Record<string, Entry[]> = {};
  for (const s of (data as unknown as Row[]).map(toSession)) {
    for (const ex of s.exercises) {
      if (!(ex.exerciseId in lastEntries)) {
        recent.push(ex.exerciseId);
        // 同じセッションに同じ種目が複数ある場合は最後のブロックを使う
        const blocks = s.exercises.filter((b) => b.exerciseId === ex.exerciseId);
        lastEntries[ex.exerciseId] = blocks[blocks.length - 1].entries;
      }
    }
  }
  return { recent, lastEntries };
}

/** 記録日時の初期値: 今日(JST)のチェックインがあればその日時、なければ現在日時 */
export async function defaultPerformedAt(userId: string): Promise<string> {
  const supabase = await createClient();
  const today = todayJst();
  const { data } = await supabase
    .from("check_ins")
    .select("checked_in_at")
    .eq("user_id", userId)
    .gte("checked_in_at", new Date(`${today}T00:00:00+09:00`).toISOString())
    .order("checked_in_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const at = data?.checked_in_at as string | undefined;
  return at && jstDateOf(at) === today ? at : new Date().toISOString();
}
