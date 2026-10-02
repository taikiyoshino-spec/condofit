// グラフの軸計算（純粋関数）

/** min〜max を含む、きりのいい目盛り（1・2・2.5・5 × 10^n 刻み） */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0];
  if (min === max) {
    const pad = Math.abs(min) * 0.1 || 1;
    min -= pad;
    max += pad;
  }
  const rawStep = (max - min) / Math.max(1, count);
  const mag = 10 ** Math.floor(Math.log10(rawStep));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= rawStep) ?? 10 * mag;
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= end + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return ticks;
}

/** 日付文字列 → 経過日数（UTC正午基準でずれを避ける） */
export function dayNumber(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d, 12) / 86400000);
}

/** 横軸に出す日付ラベル（最大 max 個、両端を含めて等間隔に間引く） */
export function pickDateTicks(dates: string[], max = 4): string[] {
  if (dates.length <= max) return dates;
  const picked = new Set<string>();
  for (let i = 0; i < max; i++) picked.add(dates[Math.round((i * (dates.length - 1)) / (max - 1))]);
  return [...picked];
}
