import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { ActivityRow } from "@/lib/home/activity";

export type MonthStats = { visits: number; trainingDays: number; exerciseKinds: number };

/** 今月の自分（Fit訪問 = トレーニングセッション数。チェックインは数えない） */
export async function getMyMonthStats(): Promise<MonthStats> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_month_stats").maybeSingle();
  const row = data as { visits: number; training_days: number; exercise_kinds: number } | null;
  return { visits: row?.visits ?? 0, trainingDays: row?.training_days ?? 0, exerciseKinds: row?.exercise_kinds ?? 0 };
}

export async function getRecentActivity(): Promise<ActivityRow[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("recent_activity");
  return ((data ?? []) as { kind: string; display_name: string; occurred_at: string; detail: Record<string, unknown> }[]).map(
    (r) => ({ kind: r.kind, displayName: r.display_name, occurredAt: r.occurred_at, detail: r.detail ?? {} }),
  );
}
