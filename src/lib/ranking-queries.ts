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
