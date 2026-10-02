// 成長グラフと自己ベスト判定のための集計（純粋関数）
import type { Entry, ExerciseType } from "./format.ts";

export type ProgressMetric = "maxWeight" | "volume" | "e1rm" | "duration" | "distance";

export const METRICS_BY_TYPE: Record<ExerciseType, ProgressMetric[]> = {
  weight: ["maxWeight", "volume", "e1rm"],
  cardio: ["duration", "distance"],
};

export const METRIC_INFO: Record<ProgressMetric, { label: string; unit: string; note: string }> = {
  maxWeight: { label: "最大重量", unit: "kg", note: "その日いちばん重いセット（回数はそのセットの回数）" },
  volume: { label: "総挙上量", unit: "kg", note: "その日の 重さ×回数 の合計" },
  e1rm: { label: "推定MAX", unit: "kg", note: "重さと回数から計算した、1回だけなら上がる重さの目安" },
  duration: { label: "時間", unit: "分", note: "その日の合計時間" },
  distance: { label: "距離", unit: "km", note: "その日の合計距離" },
};

const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

/** 推定MAX（Epley式）。回数が多すぎると誤差が大きいので 15回以下のみ */
export function estimate1rm(weight: number, reps: number): number | null {
  if (weight <= 0 || reps < 1 || reps > 15) return null;
  return reps === 1 ? weight : round(weight * (1 + reps / 30));
}

export type SessionMetrics = {
  maxWeight: number | null;
  repsAtMax: number | null;
  volume: number | null;
  e1rm: number | null;
  duration: number | null;
  distance: number | null;
};

/** 1セッション内のその種目の全行から指標を出す */
export function sessionMetrics(entries: Entry[]): SessionMetrics {
  let maxWeight: number | null = null;
  let repsAtMax: number | null = null;
  let volume = 0;
  let hasVolume = false;
  let e1rm: number | null = null;
  let duration: number | null = null;
  let distance: number | null = null;

  for (const e of entries) {
    if (e.weight_kg !== null) {
      if (maxWeight === null || e.weight_kg > maxWeight || (e.weight_kg === maxWeight && (e.reps ?? -1) > (repsAtMax ?? -1))) {
        maxWeight = e.weight_kg;
        repsAtMax = e.reps;
      }
      if (e.reps !== null) {
        volume += e.weight_kg * e.reps;
        hasVolume = true;
        const est = estimate1rm(e.weight_kg, e.reps);
        if (est !== null && (e1rm === null || est > e1rm)) e1rm = est;
      }
    }
    if (e.duration_min !== null) duration = round((duration ?? 0) + e.duration_min);
    if (e.distance_km !== null) distance = round((distance ?? 0) + e.distance_km, 2);
  }
  return { maxWeight, repsAtMax, volume: hasVolume ? round(volume) : null, e1rm, duration, distance };
}

export function metricValue(m: SessionMetrics, metric: ProgressMetric): number | null {
  return m[metric];
}

export type ProgressPoint = { date: string; value: number; repsAtMax: number | null; isBest: boolean };

/** グラフ用の点（古い順）。値のない日は除く。最大値（同値なら最初に到達した日）に isBest */
export function progressSeries(sessions: { date: string; entries: Entry[] }[], metric: ProgressMetric): ProgressPoint[] {
  const points = [...sessions]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((s) => {
      const m = sessionMetrics(s.entries);
      return { date: s.date, value: metricValue(m, metric), repsAtMax: metric === "maxWeight" ? m.repsAtMax : null };
    })
    .filter((p): p is { date: string; value: number; repsAtMax: number | null } => p.value !== null);
  let bestIndex = -1;
  points.forEach((p, i) => {
    if (bestIndex < 0 || p.value > points[bestIndex].value) bestIndex = i;
  });
  return points.map((p, i) => ({ ...p, isBest: i === bestIndex }));
}

export type PersonalBest = { metric: ProgressMetric; value: number; previous: number; repsAtMax: number | null };

/**
 * 自己ベスト更新の判定。今回の記録が、それ以前（他のすべてのセッション）の最高を上回った指標を返す。
 * 初めての記録は比較対象がないので更新扱いにしない。推定MAXは最大重量と重複しやすいので対象外。
 */
export function detectPersonalBests(type: ExerciseType, current: Entry[], others: Entry[][]): PersonalBest[] {
  const targets: ProgressMetric[] = type === "weight" ? ["maxWeight", "volume"] : ["duration", "distance"];
  const now = sessionMetrics(current);
  const past = others.map(sessionMetrics);
  const result: PersonalBest[] = [];
  for (const metric of targets) {
    const value = metricValue(now, metric);
    const previous = past.map((m) => metricValue(m, metric)).filter((v): v is number => v !== null);
    if (value === null || previous.length === 0) continue;
    const best = Math.max(...previous);
    if (value > best) result.push({ metric, value, previous: best, repsAtMax: metric === "maxWeight" ? now.repsAtMax : null });
  }
  return result;
}

const fmt = (n: number) => (Number.isInteger(n) ? n.toLocaleString("ja-JP") : n.toLocaleString("ja-JP", { maximumFractionDigits: 2 }));

/** 「60kg×5回」「1,100kg」「30分」のような表示 */
export function formatMetric(metric: ProgressMetric, value: number, repsAtMax: number | null = null): string {
  const { unit } = METRIC_INFO[metric];
  if (metric === "maxWeight" && repsAtMax !== null) return `${fmt(value)}${unit}×${repsAtMax}回`;
  return `${fmt(value)}${unit}`;
}

export type ExerciseProgressSummary = {
  metric: ProgressMetric;
  series: number[]; // 古い順（スパークライン用、最大12点）
  latest: number;
  latestReps: number | null;
  delta: number | null; // 前回との差（前回がなければ null）
  isBest: boolean; // 最新が自己ベスト更新（2回目以降のみ）
};

/** 記録タブの「最近の成長」用の要約。重量系は最大重量、有酸素は時間（なければ距離） */
export function summarizeProgress(type: ExerciseType, sessions: { date: string; entries: Entry[] }[]): ExerciseProgressSummary | null {
  const candidates: ProgressMetric[] = type === "weight" ? ["maxWeight"] : ["duration", "distance"];
  for (const metric of candidates) {
    const points = progressSeries(sessions, metric);
    if (points.length === 0) continue;
    const last = points[points.length - 1];
    const prev = points.length > 1 ? points[points.length - 2] : null;
    const prevBest = points.length > 1 ? Math.max(...points.slice(0, -1).map((p) => p.value)) : null;
    return {
      metric,
      series: points.slice(-12).map((p) => p.value),
      latest: last.value,
      latestReps: last.repsAtMax,
      delta: prev ? round(last.value - prev.value, 2) : null,
      isBest: prevBest !== null && last.value > prevBest,
    };
  }
  return null;
}

/** 「+2.5kg」「-5分」「±0kg」 */
export function formatDelta(metric: ProgressMetric, delta: number): string {
  const { unit } = METRIC_INFO[metric];
  if (delta === 0) return `±0${unit}`;
  return `${delta > 0 ? "+" : "−"}${fmt(Math.abs(delta))}${unit}`;
}
