// アプリの中でAIにメニューを作ってもらうときの依頼文（純粋関数）。
// 出力の形は「AIに相談して作る（貼り付け）」と同じなので、読み取り・確認・登録はそちらの仕組みを使う
import type { Entry, ExerciseType } from "../records/format.ts";
import { menuToJson } from "./text.ts";

export const MENU_GOALS = ["筋力アップ", "引き締め・ダイエット", "体力づくり", "健康維持"] as const;
export const MENU_MINUTES = [15, 30, 45, 60, 90] as const;
export const MENU_NOTE_MAX = 200;

export type MenuRequest = { goal: string; minutes: number; parts: string[]; note: string };
export type GenerateExercise = { name: string; type: ExerciseType; part: string | null; excludesBar: boolean };

/** 画面から来た依頼を確かめる（部位は種目マスタの部位名だけ） */
export function cleanMenuRequest(raw: unknown, partNames: string[]): MenuRequest | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const goal = String(r.goal ?? "");
  const minutes = Number(r.minutes);
  if (!(MENU_GOALS as readonly string[]).includes(goal) || !(MENU_MINUTES as readonly number[]).includes(minutes)) return null;
  const parts = Array.isArray(r.parts) ? [...new Set(r.parts.map(String))].filter((p) => partNames.includes(p)) : [];
  const note = [...String(r.note ?? "").trim()].slice(0, MENU_NOTE_MAX).join("");
  return { goal, minutes, parts, note };
}

function setText(s: Partial<Entry>): string {
  const parts: string[] = [];
  if (s.weight_kg != null) parts.push(`${s.weight_kg}kg`);
  if (s.reps != null) parts.push(`${s.reps}回`);
  if (s.duration_min != null) parts.push(`${s.duration_min}分`);
  if (s.distance_km != null) parts.push(`${s.distance_km}km`);
  return parts.join("×") || "—";
}

/** 1種目にかける時間（分）。有酸素は10〜30分、筋トレは1種目5〜10分（セット間の休憩を含む） */
export const CARDIO_MINUTES = { min: 10, max: 30 } as const;
export const STRENGTH_MINUTES = { min: 5, max: 10 } as const;
/** 合計がこれだけ超えるまでは許す（分） */
const OVER_MINUTES = 5;

/** 時間の配分の決まり（AIへの依頼文に入れる） */
function timeRules(minutes: number): string[] {
  return [
    `- 時間の配分: 有酸素は1種目${CARDIO_MINUTES.min}〜${CARDIO_MINUTES.max}分、筋トレは1種目${STRENGTH_MINUTES.min}〜${STRENGTH_MINUTES.max}分（セット間の休憩を含む）で数え、合計が${minutes}分に収まるように種目の数を決める（超えない・大きく余らせない）`,
    "- 各種目の minutes に、その種目にかける目安の時間（分）を入れる。有酸素の duration_min は minutes と同じにする",
  ];
}

/**
 * AIの案を時間に合わせる。1種目の時間を決まりの範囲に収め、合計が選んだ時間を超えたら後ろの種目から外す（1つは残す）。
 * 有酸素の時間は記録の値（duration_min）を正にする
 */
export function fitToTime<T extends { type: ExerciseType; minutes: number | null; sets: Partial<Entry>[] }>(
  items: T[],
  minutes: number,
): (T & { minutes: number })[] {
  const clamp = (n: number, r: { min: number; max: number }) => Math.min(r.max, Math.max(r.min, Math.round(n)));
  const fitted = items.map((it) => {
    if (it.type === "cardio") {
      const total = it.sets.reduce((sum, x) => sum + (x.duration_min ?? 0), 0);
      const m = clamp(total || it.minutes || 15, CARDIO_MINUTES);
      // 1セットの有酸素は時間を決まりの範囲に合わせる（複数セットはそのまま）
      const sets = it.sets.length <= 1 ? [{ ...(it.sets[0] ?? {}), duration_min: m }] : it.sets;
      return { ...it, sets, minutes: m };
    }
    return { ...it, minutes: clamp(it.minutes ?? it.sets.length * 2, STRENGTH_MINUTES) };
  });
  while (fitted.length > 1 && fitted.reduce((sum, it) => sum + it.minutes, 0) > minutes + OVER_MINUTES) fitted.pop();
  return fitted;
}

/** 重量系で回数を決めていないときの回数 */
export const DEFAULT_REPS = 10;

/** 重量系のセットを「重さ×回数」にそろえる。AIが片方を省いたときは前回の記録（同じ順のセット、なければ最後のセット）で補う */
export function completeWeightSets(sets: Partial<Entry>[], last: Partial<Entry>[] | undefined): Partial<Entry>[] {
  return sets.map((s, i) => {
    const prev = last?.length ? last[Math.min(i, last.length - 1)] : undefined;
    const weight_kg = s.weight_kg ?? prev?.weight_kg ?? undefined;
    return { ...s, ...(weight_kg != null ? { weight_kg } : {}), reps: s.reps ?? prev?.reps ?? DEFAULT_REPS };
  });
}

/** AIへの依頼文。名前は渡さず、目的と使える種目・最近の記録の数字だけを渡す */
export function buildGeneratePrompt({
  request,
  exercises,
  recent,
  current,
}: {
  request: MenuRequest;
  exercises: GenerateExercise[];
  recent: { name: string; sets: Partial<Entry>[] }[];
  current?: { name: string; items: { name: string; sets: Partial<Entry>[] }[] } | null;
}): string {
  const lines: string[] = [
    current ? "ジムのトレーニングメニューを、下の希望に合わせて見直してください。" : "ジムのトレーニングメニューを1つ作ってください。",
    "",
    "【希望】",
    `- 目的: ${request.goal}`,
    `- 時間: ${request.minutes}分くらい（準備・休憩を含む）`,
  ];
  if (request.parts.length) lines.push(`- 重点的に鍛えたい部位: ${request.parts.join("・")}`);
  if (request.note) lines.push(`- そのほか: ${request.note}`);
  if (current) lines.push("", "【今のメニュー】", menuToJson(current));
  if (recent.length) {
    lines.push("", "【最近の記録（各種目の前回）】");
    for (const r of recent) lines.push(`- ${r.name}: ${r.sets.map(setText).join("、")}`);
  }
  lines.push("", "【使える種目】（このジムにある種目。exercise には必ずこの名前をそのまま書く）");
  for (const e of exercises) lines.push(exerciseLine(e));
  lines.push(
    "",
    "【作り方】",
    "- 使える種目の中から選ぶ。一覧にない種目は入れない",
    "- 重量系は weight_kg（kg）と reps（回）、有酸素は duration_min（分）と distance_km（km、なければ省く）。セットの数だけ sets に並べる",
    ...timeRules(request.minutes),
    "- 最近の記録がある種目は、その重さ・回数を目安にする（同じか少し上）",
    "- 重量系は、どのセットにも weight_kg と reps を両方入れる（「重さ×回数」で示す）。最近の記録がない種目は、無理のない軽めの重さを目安として入れる",
    "- name はメニューの短い名前（20文字くらいまで）",
    "- comment は、このメニューのねらいとコツを2文で（120文字以内）。けが・病気の助言はしない",
  );
  return lines.join("\n");
}

/** 今日のメニューの案の数（1回の問い合わせでまとめて作ってもらう） */
export const TODAY_PROPOSALS = 3;

/** 今日の調子（記録を始めるときにAIと相談する） */
export const CONDITIONS = ["絶好調", "ふつう", "疲れぎみ"] as const;
const CONDITION_RULE: Record<(typeof CONDITIONS)[number], string> = {
  絶好調: "調子がいいので、前回より少し重く、または回数・セットを少し多くしてよい",
  ふつう: "前回と同じくらいの重さ・回数にする",
  疲れぎみ: "疲れぎみなので、前回より軽め・少なめにして、種目も少なくする",
};

export type TodayRequest = { condition: (typeof CONDITIONS)[number]; minutes: number; parts: string[]; note: string };
/** 部位ごとの直近4週間のセット数と、最後にやってから何日か（AIが「最近やっていない部位」を選べるように） */
export type PartRecency = { name: string; sets: number; daysAgo: number | null };

/** 画面から来た今日の相談を確かめる */
export function cleanTodayRequest(raw: unknown, partNames: string[]): TodayRequest | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const condition = String(r.condition ?? "") as TodayRequest["condition"];
  const minutes = Number(r.minutes);
  if (!CONDITIONS.includes(condition) || !(MENU_MINUTES as readonly number[]).includes(minutes)) return null;
  const parts = Array.isArray(r.parts) ? [...new Set(r.parts.map(String))].filter((p) => partNames.includes(p)) : [];
  const note = [...String(r.note ?? "").trim()].slice(0, MENU_NOTE_MAX).join("");
  return { condition, minutes, parts, note };
}

/** 今日のメニューの依頼文。名前は渡さず、調子・希望・最近の記録の数字だけを渡す */
export function buildTodayPrompt({
  request,
  exercises,
  recent,
  parts,
}: {
  request: TodayRequest;
  exercises: GenerateExercise[];
  recent: { name: string; sets: Partial<Entry>[]; daysAgo?: number | null }[];
  parts: PartRecency[];
}): string {
  const lines: string[] = [
    `これからジムでトレーニングをする人の、今日のメニューの案を${TODAY_PROPOSALS}つ作ってください。`,
    "案どうしは、部位の組み合わせ・種目・強さのどれかをはっきり変えて、選びがいのあるものにしてください（どれも下の希望には合わせる）。",
    "",
    "【今日】",
    `- 調子: ${request.condition}（${CONDITION_RULE[request.condition]}）`,
    `- 時間: ${request.minutes}分くらい（準備・休憩を含む）`,
    request.parts.length
      ? `- やりたい部位: ${request.parts.join("・")}`
      : "- やりたい部位: おまかせ（下の「部位ごとの最近」を見て、しばらくやっていない部位を中心に。前回と同じ部位ばかりにならないように）",
  ];
  if (request.note) lines.push(`- そのほか: ${request.note}`);
  if (parts.length) {
    lines.push("", "【部位ごとの最近（直近4週間）】");
    for (const p of parts) lines.push(`- ${p.name}: ${p.sets}セット・${p.daysAgo === null ? "4週間やっていない" : p.daysAgo === 0 ? "最後は今日" : `最後は${p.daysAgo}日前`}`);
  }
  if (recent.length) {
    lines.push("", "【最近の記録（各種目の前回）】");
    for (const r of recent) lines.push(`- ${r.name}: ${r.sets.map(setText).join("、")}${r.daysAgo != null ? `（${r.daysAgo}日前）` : ""}`);
  }
  lines.push("", "【使える種目】（このジムにある種目。exercise には必ずこの名前をそのまま書く）");
  for (const e of exercises) lines.push(exerciseLine(e));
  lines.push(
    "",
    "【作り方】",
    "- 使える種目の中から選ぶ。一覧にない種目は入れない",
    "- 重量系は weight_kg（kg）と reps（回）、有酸素は duration_min（分）と distance_km（km、なければ省く）。セットの数だけ sets に並べる",
    ...timeRules(request.minutes),
    "- 最近の記録がある種目は、その重さ・回数と今日の調子から決める",
    "- 重量系は、どのセットにも weight_kg と reps を両方入れる（「重さ×回数」で示す）。最近の記録がない種目は、無理のない軽めの重さを目安として入れる",
    "- menus に案を並べる。name はその案の短い名前（「背中と脚の日」「軽めの全身」など、20文字くらいまで。案ごとに違う名前）",
    "- reason は、その組み合わせを選んだ理由を端的に1文で（40文字以内。例「脚が10日空いているので脚を中心に」「疲れぎみなので軽めの全身」）",
    "- けが・病気の助言はしない",
  );
  return lines.join("\n");
}

function exerciseLine(e: GenerateExercise): string {
  const kind = e.type === "cardio" ? "有酸素" : e.excludesBar ? "重量系・重さはバーを除いた値" : "重量系";
  return `- ${e.name}（${[...new Set([e.part, kind].filter(Boolean))].join("・")}）`;
}

const SETS_SCHEMA = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      weight_kg: { type: "NUMBER" },
      reps: { type: "INTEGER" },
      duration_min: { type: "NUMBER" },
      distance_km: { type: "NUMBER" },
    },
  },
};

/** Gemini に渡す答えの形 */
export const GENERATE_SCHEMA = {
  type: "OBJECT",
  properties: {
    name: { type: "STRING" },
    comment: { type: "STRING" },
    items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          exercise: { type: "STRING" },
          minutes: { type: "INTEGER" },
          sets: SETS_SCHEMA,
        },
        required: ["exercise", "sets"],
      },
    },
  },
  required: ["name", "items"],
};

/** 今日のメニュー（案をいくつか）の答えの形。案ごとに選んだ理由、種目ごとに目安の時間 */
export const TODAY_SCHEMA = {
  type: "OBJECT",
  properties: {
    menus: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          reason: { type: "STRING" },
          items: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: { exercise: { type: "STRING" }, minutes: { type: "INTEGER" }, sets: SETS_SCHEMA },
              required: ["exercise", "minutes", "sets"],
            },
          },
        },
        required: ["name", "reason", "items"],
      },
    },
  },
  required: ["menus"],
};
