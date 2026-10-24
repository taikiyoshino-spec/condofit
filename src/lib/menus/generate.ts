// アプリの中でAIにメニューを作ってもらうときの依頼文（純粋関数）。
// 出力の形は「AIに相談して作る（貼り付け）」と同じなので、読み取り・確認・登録はそちらの仕組みを使う
import type { Entry, ExerciseType } from "../records/format.ts";
import { menuToJson } from "./text.ts";

export const MENU_GOALS = ["筋力アップ", "引き締め・ダイエット", "体力づくり", "健康維持"] as const;
export const MENU_MINUTES = [30, 45, 60, 90] as const;
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
  for (const e of exercises) {
    const kind = e.type === "cardio" ? "有酸素" : e.excludesBar ? "重量系・重さはバーを除いた値" : "重量系";
    lines.push(`- ${e.name}（${[...new Set([e.part, kind].filter(Boolean))].join("・")}）`);
  }
  lines.push(
    "",
    "【作り方】",
    "- 使える種目の中から選ぶ。一覧にない種目は入れない",
    "- 重量系は weight_kg（kg）と reps（回）、有酸素は duration_min（分）と distance_km（km、なければ省く）。セットの数だけ sets に並べる",
    "- 最近の記録がある種目は、その重さ・回数を目安にする（同じか少し上）",
    "- 最近の記録がない重量系の種目は weight_kg を入れず、reps だけにする（重さは本人がその場で決める）",
    "- name はメニューの短い名前（20文字くらいまで）",
    "- comment は、このメニューのねらいとコツを2文で（120文字以内）。けが・病気の助言はしない",
  );
  return lines.join("\n");
}

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
          sets: {
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
          },
        },
        required: ["exercise", "sets"],
      },
    },
  },
  required: ["name", "items"],
};
