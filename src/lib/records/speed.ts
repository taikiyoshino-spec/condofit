// 有酸素の「時速から距離を計算」の補助（純粋関数）。途中で速度を変えなかった前提の目安
import { parseNumber } from "./format.ts";

export const SPEED_PRESETS = [3, 6, 9, 12] as const;
export const SPEED_STEP = 0.1;
const MAX_SPEED = 30;

const round = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;

/** 時間（分）と時速（km/h）→ 距離（km、小数2桁）。どちらかがなければ null */
export function distanceFrom(durationMin: string, speedKmh: string): string | null {
  const d = parseNumber(durationMin);
  const s = parseNumber(speedKmh, { max: MAX_SPEED });
  if (d === null || s === null || d === 0 || s === 0) return null;
  return String(round((d * s) / 60, 2));
}

/** 時間と距離 → 時速（小数1桁）。前回の記録から時速を出すため */
export function speedFrom(durationMin: string, distanceKm: string): string {
  const d = parseNumber(durationMin);
  const k = parseNumber(distanceKm);
  if (d === null || k === null || d === 0 || k === 0) return "";
  const s = round((k / d) * 60, 1);
  return s > 0 && s <= MAX_SPEED ? String(s) : "";
}

/** 時速を ±step（0〜30、小数1桁） */
export function stepSpeed(speedKmh: string, delta: number): string {
  const s = parseNumber(speedKmh, { max: MAX_SPEED }) ?? 0;
  return String(Math.min(MAX_SPEED, Math.max(0, round(s + delta, 1))));
}
