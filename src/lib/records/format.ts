// トレーニング記録の表示・入力変換（純粋関数）

export type ExerciseType = "weight" | "cardio";
export type Entry = {
  weight_kg: number | null;
  reps: number | null;
  duration_min: number | null;
  distance_km: number | null;
};

const num = (n: number) => String(Number(n)); // 60.0 → "60"

/** 1行分の表示。重量系「60kg × 5回」、有酸素「20分 / 1.5km」。数値なしは null */
export function formatEntry(type: ExerciseType, e: Entry): string | null {
  if (type === "weight") {
    const w = e.weight_kg !== null ? `${num(e.weight_kg)}kg` : null;
    const r = e.reps !== null ? `${e.reps}回` : null;
    return w && r ? `${w} × ${r}` : (w ?? r);
  }
  const d = e.duration_min !== null ? `${num(e.duration_min)}分` : null;
  const k = e.distance_km !== null ? `${num(e.distance_km)}km` : null;
  return d && k ? `${d} / ${k}` : (d ?? k);
}

/** 入力欄の文字列 → 数値（空欄・不正は null、負数は不可、上限あり） */
export function parseNumber(input: string, { integer = false, max = 9999 } = {}): number | null {
  const s = input.trim().replace(/[０-９．]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  if (s === "") return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0 || n > max) return null;
  if (integer) return Number.isInteger(n) ? n : null;
  return n;
}

/** ISO日時 → JSTの datetime-local 値 "YYYY-MM-DDTHH:mm" */
export function toJstInputValue(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 16);
}

/** JSTの datetime-local 値 → ISO日時 */
export function fromJstInputValue(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const d = new Date(`${value}:00+09:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** ISO日時 → JSTの日付 "YYYY-MM-DD" */
export function jstDateOf(iso: string): string {
  return toJstInputValue(iso).slice(0, 10);
}

/** ISO日時 → JSTの時刻 "HH:mm" */
export function jstTimeOf(iso: string): string {
  return toJstInputValue(iso).slice(11, 16);
}

/**
 * 1セッション内の代表値（種目タブの月間代表値と同じ規則）
 *  重量系: 最大重量 + その重量での回数（同重量なら多い方）。重量なしなら最大回数
 *  有酸素: 合計時間 + 合計距離（存在する値のみ）
 */
export function sessionRepresentative(type: ExerciseType, entries: Entry[]): Entry | null {
  if (type === "weight") {
    const rows = entries.filter((e) => e.weight_kg !== null || e.reps !== null);
    if (rows.length === 0) return null;
    const best = rows.reduce((a, b) => {
      const aw = a.weight_kg ?? -1;
      const bw = b.weight_kg ?? -1;
      if (bw !== aw) return bw > aw ? b : a;
      return (b.reps ?? -1) > (a.reps ?? -1) ? b : a;
    });
    return { weight_kg: best.weight_kg, reps: best.reps, duration_min: null, distance_km: null };
  }
  const sum = (key: "duration_min" | "distance_km") => {
    const values = entries.map((e) => e[key]).filter((v): v is number => v !== null);
    return values.length ? Math.round(values.reduce((a, b) => a + b, 0) * 100) / 100 : null;
  };
  const duration = sum("duration_min");
  const distance = sum("distance_km");
  if (duration === null && distance === null) return null;
  return { weight_kg: null, reps: null, duration_min: duration, distance_km: distance };
}
