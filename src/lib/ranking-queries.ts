import "server-only";
import { createClient } from "@/lib/supabase/server";
import { assignRanks, byDesc, type Ranked } from "@/lib/ranking";
import { partScore } from "@/lib/records/parts";
import { getPartSessions, monthBounds, type PartInfo } from "@/lib/records/parts-queries";

export type RankingMetric = "visits" | "parts";
export type RankingRow = { userId: string; displayName: string; visits: number; exerciseKinds: number };

export const METRIC_LABEL: Record<RankingMetric, { label: string; unit: string }> = {
  visits: { label: "Fit訪問回数", unit: "回" },
  parts: { label: "部位別", unit: "セット" },
};

/** 月間の総合ランキング（month は "YYYY-MM"） */
export async function getMonthlyRanking(month: string): Promise<Ranked<RankingRow>[]> {
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
    byDesc((r: RankingRow) => r.visits),
  );
  return ranked;
}

export type PartRankingRow = {
  userId: string;
  displayName: string;
  value: number;
  breakdown: { exerciseId: string; name: string; value: number }[];
};

/** 月間の部位別ランキング。筋トレの部位はセット数、有酸素の部位は合計時間（分）。自分専用の種目は数えない */
export async function getMonthlyPartRanking(month: string, part: PartInfo): Promise<Ranked<PartRankingRow>[]> {
  const [members, sessions] = await Promise.all([getMonthlyRanking(month), getPartSessions(monthBounds(month))]);
  const byUser = Map.groupBy(sessions, (s) => s.userId);
  const rows = members
    .map((m) => ({ userId: m.userId, displayName: m.displayName, ...partScore(byUser.get(m.userId) ?? [], part.id, part.cardio) }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, "ja"));
  return assignRanks(rows, byDesc((r: PartRankingRow) => r.value));
}
