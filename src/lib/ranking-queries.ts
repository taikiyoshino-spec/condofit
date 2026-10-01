import "server-only";
import { createClient } from "@/lib/supabase/server";
import { assignRanks, byDesc, type Ranked } from "@/lib/ranking";

export type RankingMetric = "visits" | "kinds";
export type RankingRow = { userId: string; displayName: string; visits: number; exerciseKinds: number };

export const METRIC_LABEL: Record<RankingMetric, { label: string; unit: string }> = {
  visits: { label: "Fit訪問回数", unit: "回" },
  kinds: { label: "種目の数", unit: "種" },
};

export const metricValue = (metric: RankingMetric, r: RankingRow) => (metric === "visits" ? r.visits : r.exerciseKinds);

/** 月間の総合ランキング（month は "YYYY-MM"） */
export async function getMonthlyRanking(month: string, metric: RankingMetric): Promise<Ranked<RankingRow>[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("monthly_ranking", { p_month: `${month}-01` });
  if (error) throw error;
  const rows = (data as { user_id: string; display_name: string; visits: number; exercise_kinds: number }[]).map((r) => ({
    userId: r.user_id,
    displayName: r.display_name,
    visits: r.visits,
    exerciseKinds: r.exercise_kinds,
  }));
  // 同じ値は同順位。並びは表示名順で安定させる
  const ranked = assignRanks(
    rows.sort((a, b) => a.displayName.localeCompare(b.displayName, "ja")),
    byDesc((r: RankingRow) => metricValue(metric, r)),
  );
  return ranked;
}

export type MemberExercise = { exerciseId: string; name: string; count: number };

/**
 * その月に各メンバーがやった種目（種目名とセッション数のみ。重量・回数は含めない）。
 * 戻り値は userId → 種目一覧（回数の多い順）
 */
export async function getMonthlyExercisesByUser(month: string): Promise<Record<string, MemberExercise[]>> {
  const supabase = await createClient();
  const start = new Date(`${month}-01T00:00:00+09:00`);
  const [y, m] = month.split("-").map(Number);
  const end = new Date(`${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01T00:00:00+09:00`);
  const { data, error } = await supabase
    .from("training_sessions")
    .select("user_id, session_exercises(exercise_id, exercises(name))")
    .gte("performed_at", start.toISOString())
    .lt("performed_at", end.toISOString());
  if (error) throw error;

  type Row = { user_id: string; session_exercises: { exercise_id: string; exercises: { name: string } | null }[] };
  const byUser = new Map<string, Map<string, MemberExercise>>();
  for (const s of data as unknown as Row[]) {
    const mine = byUser.get(s.user_id) ?? new Map<string, MemberExercise>();
    // 同じセッション内で同じ種目を複数回登録していても1回と数える
    const seen = new Set<string>();
    for (const se of s.session_exercises) {
      if (seen.has(se.exercise_id)) continue;
      seen.add(se.exercise_id);
      const cur = mine.get(se.exercise_id) ?? { exerciseId: se.exercise_id, name: se.exercises?.name ?? "", count: 0 };
      cur.count++;
      mine.set(se.exercise_id, cur);
    }
    byUser.set(s.user_id, mine);
  }
  return Object.fromEntries(
    [...byUser].map(([userId, list]) => [
      userId,
      [...list.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ja")),
    ]),
  );
}
