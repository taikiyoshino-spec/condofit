// 月のふりかえり（純粋関数）。数字はすべてここで数え、AIには数えた結果からひと言を書いてもらうだけにする
// （AIに数えさせると数字を間違えることがあるため）
import { addMonths, formatMonth, monthOf, monthRange } from "../date.ts";
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
  // ここから下は 2026-10-26 に追加。それより前に保存したふりかえりにはない
  /** 前の月の筋トレの部位ごとのセット数（記録を始めた月なら null） */
  prevParts?: { name: string; sets: number }[] | null;
  /** 前の月の有酸素（記録を始めた月なら null） */
  prevCardio?: { days: number; minutes: number } | null;
  /** 重さの流れ: 種目ごとに、前回（その月より前の最後。なければその月の最初）からその月の最後までの最大重量の変化 */
  weightChanges?: { exercise: string; from: string; to: string; up: boolean }[];
  /** 通うペース: 週あたりの回数と、来た日どうしのいちばん長い間（2日以上来た月だけ） */
  pace?: { perWeek: number; longestGap: { days: number; from: string; to: string } | null };
};

const MAX_BESTS = 5;
const MAX_WEIGHT_CHANGES = 5;

/** 月のふりかえりの数字。その月の記録がなければ null。sessions はその月の終わりまでの全記録 */
export function monthReviewFacts(unsorted: ReviewSession[], month: string, parts: ReviewPart[]): MonthReviewFacts | null {
  // 古い順に（重さの流れで「最初」「最後」を見るため）
  const sessions = [...unsorted].sort((a, b) => Date.parse(a.performedAt) - Date.parse(b.performedAt));
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

  // 重さの流れ（重量系だけ。最大重量と、その重さの回数で比べる）
  const maxWeightOf = (entries: Entry[]) => {
    const m = sessionMetrics(entries);
    return m.maxWeight === null ? null : { value: m.maxWeight, repsAtMax: m.repsAtMax };
  };
  const weightChanges: NonNullable<MonthReviewFacts["weightChanges"]> = [];
  for (const [id, cur] of monthEx) {
    if (cur.type !== "weight") continue;
    const points = cur.sessions.map(maxWeightOf).filter((p) => p !== null);
    const pastLast = (beforeEx.get(id)?.sessions.map(maxWeightOf).filter((p) => p !== null) ?? []).at(-1);
    const from = pastLast ?? (points.length >= 2 ? points[0] : null);
    const to = points.at(-1);
    if (!from || !to || (from.value === to.value && from.repsAtMax === to.repsAtMax)) continue;
    weightChanges.push({
      exercise: cur.name,
      from: formatMetric("maxWeight", from.value, from.repsAtMax),
      to: formatMetric("maxWeight", to.value, to.repsAtMax),
      up: beats("maxWeight", to, from),
    });
  }

  // 通うペース
  const visitDates = [...new Set(inMonth.map((s) => jstDateOf(s.performedAt)))].sort();
  let longestGap: NonNullable<MonthReviewFacts["pace"]>["longestGap"] = null;
  for (let i = 1; i < visitDates.length; i++) {
    const days = Math.round((Date.parse(visitDates[i]) - Date.parse(visitDates[i - 1])) / 86400e3);
    if (!longestGap || days > longestGap.days) longestGap = { days, from: visitDates[i - 1], to: visitDates[i] };
  }
  const visits = countVisits(inMonth.map((s) => s.performedAt));
  const daysInMonth = Number(monthRange(month).end.slice(8));
  const prevBalance = partBalance(prev, parts, new Set(parts.filter((p) => p.cardio).map((p) => p.id)));

  return {
    month,
    visits,
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
    prevParts:
      before.length === 0
        ? null
        : prevBalance.strength
            .filter((p) => p.sets > 0)
            .sort((a, b) => b.sets - a.sets)
            .map((p) => ({ name: p.name, sets: p.sets })),
    prevCardio: before.length === 0 ? null : { days: prevBalance.cardio.days, minutes: prevBalance.cardio.minutes },
    // 上がった種目を先に
    weightChanges: weightChanges.sort((a, b) => Number(b.up) - Number(a.up)).slice(0, MAX_WEIGHT_CHANGES),
    pace: { perWeek: Math.round((visits / daysInMonth) * 7 * 10) / 10, longestGap },
  };
}

/** ふりかえりの数字を、画面とAIに渡す短い文の行にする */
export function factLines(f: MonthReviewFacts): string[] {
  const lines: string[] = [];
  lines.push(`Fit ${f.visits}回` + (f.prevVisits === null ? "（記録を始めた月）" : `（前の月 ${f.prevVisits}回）`));
  if (f.bests.length) lines.push(`自己ベスト: ${f.bests.map((b) => `${b.exercise} ${b.value}（前は${b.previous}）`).join("、")}`);
  if (f.pace) {
    const gap = f.pace.longestGap;
    const gapText = gap ? `・いちばん空いたのは${gap.days}日（${shortDate(gap.from)}〜${shortDate(gap.to)}）` : "";
    lines.push(`通うペース: 週${f.pace.perWeek}回${gapText}`);
  }
  // 前の月と比べられるときは、前の月のセット数を添える
  const prevSets = f.prevParts ? new Map(f.prevParts.map((p) => [p.name, p.sets])) : null;
  if (f.parts.length) {
    const text = (p: { name: string; sets: number }) => `${p.name}${p.sets}セット` + (prevSets ? `（前の月${prevSets.get(p.name) ?? 0}）` : "");
    lines.push(`筋トレ: ${f.parts.map(text).join("・")}`);
  }
  if (f.skippedParts.length && f.parts.length) {
    lines.push(`しなかった部位: ${f.skippedParts.map((n) => n + (prevSets?.get(n) ? `（前の月${prevSets.get(n)}セット）` : "")).join("・")}`);
  }
  const prevCardio = f.prevCardio?.days ? `（前の月 ${f.prevCardio.days}日・${f.prevCardio.minutes}分）` : f.prevCardio ? "（前の月 なし）" : "";
  if (f.cardio.days) {
    const dist = f.cardio.distanceKm ? `・${f.cardio.distanceKm}km` : "";
    lines.push(`有酸素: ${f.cardio.days}日・${f.cardio.minutes}分${dist}${prevCardio}`);
  } else if (f.prevCardio?.days) lines.push(`有酸素: なし${prevCardio}`);
  if (f.weightChanges?.length) lines.push(`重さの流れ: ${f.weightChanges.map((c) => `${c.exercise} ${c.from}→${c.to}`).join("、")}`);
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
    `- comment: がんばったことを、数字を1つ以上入れて具体的にほめる（2文・${REVIEW_COMMENT_MAX}文字以内）。前の月より増えたもの・重さが上がった種目・続けて通えたことがあれば、それを優先する`,
    `- tip: 来月のおすすめを1つ（${REVIEW_TIP_MAX}文字以内）。しなかった部位・少ない部位・前の月より減ったもの・重さが下がった種目・間が空いた時期があれば、そのうち1つに触れる（責めずに、次にどうするかを書く）`,
    "- 数字は下のまとめにあるものだけを使い、作らない",
    "- 名前で呼びかけない。けが・病気・食事の助言はしない",
    "",
    "--- まとめ ---",
    ...factLines(f),
  ].join("\n");
}

/** 「2026-09-05」を「9/5」に */
function shortDate(s: string): string {
  return `${Number(s.slice(5, 7))}/${Number(s.slice(8, 10))}`;
}
