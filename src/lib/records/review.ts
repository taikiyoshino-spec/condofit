// 月のふりかえり（純粋関数）。数字はすべてここで数え、AIには数えた結果からひと言を書いてもらうだけにする
// （AIに数えさせると数字を間違えることがあるため）
import { addMonths, formatMonth, monthOf } from "../date.ts";
import { jstDateOf, type Entry, type ExerciseType } from "./format.ts";
import { partBalance } from "./parts.ts";
import { beats, formatMetric, sessionMetrics, type ProgressMetric } from "./progress.ts";
import { countVisits } from "./visits.ts";

export type ReviewSession = {
  userId: string;
  performedAt: string;
  exercises: { exerciseId: string; exerciseName: string; type: ExerciseType; bodyPartId: string | null; custom: boolean; entries: Entry[] }[];
};
export type ReviewPart = { id: string; name: string; cardio: boolean; freeWeight: boolean };

export type MonthReviewFacts = {
  month: string;
  visits: number;
  /** 前の月の Fit 訪問（記録を始めた月なら null） */
  prevVisits: number | null;
  /** 筋トレの部位ごとのセット数（多い順、0は除く） */
  parts: { name: string; sets: number }[];
  /** 筋トレの部位のうち、1セットもしなかった部位 */
  skippedParts: string[];
  cardio: { days: number; minutes: number; distanceKm: number };
  /** その月に更新した自己ベスト（前の月までの最高と比べる） */
  bests: { exercise: string; value: string; previous: string }[];
  /** その月に初めてやった種目（記録を始めた月は空） */
  newExercises: string[];
  /** よくやった種目（回数の多い順、3つまで） */
  topExercises: { name: string; count: number }[];
};

const MAX_BESTS = 5;

/** 月のふりかえりの数字。その月の記録がなければ null。sessions はその月の終わりまでの全記録 */
export function monthReviewFacts(sessions: ReviewSession[], month: string, parts: ReviewPart[]): MonthReviewFacts | null {
  const inMonth = sessions.filter((s) => monthOf(jstDateOf(s.performedAt)) === month);
  if (inMonth.length === 0) return null;
  const before = sessions.filter((s) => jstDateOf(s.performedAt) < `${month}-01`);
  const prevMonth = addMonths(month, -1);
  const prev = before.filter((s) => monthOf(jstDateOf(s.performedAt)) === prevMonth);

  const balance = partBalance(inMonth, parts, new Set(parts.filter((p) => p.cardio).map((p) => p.id)));
  const freeWeight = new Set(parts.filter((p) => p.freeWeight).map((p) => p.id));

  // 種目ごとの、セッション単位の記録（同じセッションの同じ種目はまとめる）
  const byExercise = (list: ReviewSession[]) => {
    const map = new Map<string, { name: string; type: ExerciseType; sessions: Entry[][] }>();
    for (const s of list) {
      const seen = new Map<string, Entry[]>();
      for (const ex of s.exercises) seen.set(ex.exerciseId, [...(seen.get(ex.exerciseId) ?? []), ...ex.entries]);
      for (const [id, entries] of seen) {
        const ex = s.exercises.find((x) => x.exerciseId === id)!;
        const cur = map.get(id) ?? { name: ex.exerciseName, type: ex.type, sessions: [] };
        cur.sessions.push(entries);
        map.set(id, cur);
      }
    }
    return map;
  };
  const monthEx = byExercise(inMonth);
  const beforeEx = byExercise(before);

  const bests: MonthReviewFacts["bests"] = [];
  for (const [id, cur] of monthEx) {
    const past = beforeEx.get(id);
    if (!past) continue;
    const metrics: ProgressMetric[] = cur.type === "weight" ? ["maxWeight"] : ["distance", "duration"];
    for (const metric of metrics) {
      const best = (list: Entry[][]) =>
        list
          .map(sessionMetrics)
          .map((m) => ({ value: m[metric], repsAtMax: metric === "maxWeight" ? m.repsAtMax : null }))
          .filter((v): v is { value: number; repsAtMax: number | null } => v.value !== null)
          .reduce<{ value: number; repsAtMax: number | null } | null>((x, y) => (x === null || beats(metric, y, x) ? y : x), null);
      const now = best(cur.sessions);
      const then = best(past.sessions);
      if (now && then && beats(metric, now, then)) {
        bests.push({ exercise: cur.name, value: formatMetric(metric, now.value, now.repsAtMax), previous: formatMetric(metric, then.value, then.repsAtMax) });
        break;
      }
    }
  }

  return {
    month,
    visits: countVisits(inMonth.map((s) => s.performedAt)),
    prevVisits: before.length === 0 ? null : countVisits(prev.map((s) => s.performedAt)),
    parts: balance.strength
      .filter((p) => p.sets > 0)
      .sort((a, b) => b.sets - a.sets)
      .map((p) => ({ name: p.name, sets: p.sets })),
    skippedParts: balance.strength.filter((p) => p.sets === 0 && !freeWeight.has(p.partId)).map((p) => p.name),
    cardio: { days: balance.cardio.days, minutes: balance.cardio.minutes, distanceKm: balance.cardio.distanceKm },
    bests: bests.slice(0, MAX_BESTS),
    newExercises: before.length === 0 ? [] : [...monthEx].filter(([id]) => !beforeEx.has(id)).map(([, v]) => v.name),
    topExercises: [...monthEx.values()]
      .map((v) => ({ name: v.name, count: v.sessions.length }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ja"))
      .slice(0, 3),
  };
}

/** ふりかえりの数字を、画面とAIに渡す短い文の行にする */
export function factLines(f: MonthReviewFacts): string[] {
  const lines: string[] = [];
  lines.push(`Fit ${f.visits}回` + (f.prevVisits === null ? "（記録を始めた月）" : `（前の月 ${f.prevVisits}回）`));
  if (f.bests.length) lines.push(`自己ベスト: ${f.bests.map((b) => `${b.exercise} ${b.value}（前は${b.previous}）`).join("、")}`);
  if (f.parts.length) lines.push(`筋トレ: ${f.parts.map((p) => `${p.name}${p.sets}セット`).join("・")}`);
  if (f.skippedParts.length && f.parts.length) lines.push(`しなかった部位: ${f.skippedParts.join("・")}`);
  if (f.cardio.days) {
    const dist = f.cardio.distanceKm ? `・${f.cardio.distanceKm}km` : "";
    lines.push(`有酸素: ${f.cardio.days}日・${f.cardio.minutes}分${dist}`);
  }
  if (f.newExercises.length) lines.push(`初めての種目: ${f.newExercises.join("・")}`);
  if (f.topExercises.length) lines.push(`よくやった種目: ${f.topExercises.map((t) => `${t.name}（${t.count}回）`).join("・")}`);
  return lines;
}

export const REVIEW_COMMENT_MAX = 150;
export const REVIEW_TIP_MAX = 80;

/** AIへの依頼文。名前は渡さず、数えた結果だけを渡す */
export function monthReviewPrompt(f: MonthReviewFacts): string {
  return [
    `ジムに通う仲間の、${formatMonth(f.month)}のトレーニングのまとめです。`,
    "気さくなトレーナーとして、次の2つを日本語で書いてください。",
    `- comment: がんばったことを、数字を1つ以上入れて具体的にほめる（2文・${REVIEW_COMMENT_MAX}文字以内）`,
    `- tip: 来月のおすすめを1つ（${REVIEW_TIP_MAX}文字以内）。しなかった部位や、少ない部位があればそれに触れる`,
    "- 数字は下のまとめにあるものだけを使い、作らない",
    "- 名前で呼びかけない。けが・病気・食事の助言はしない",
    "",
    "--- まとめ ---",
    ...factLines(f),
  ].join("\n");
}
