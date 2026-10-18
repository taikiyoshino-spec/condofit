// メニューをテキスト（JSON）でAIとやりとりするための純粋関数。
// 相談文（プロンプト）を作ってコピーし、AIの答えを貼り付けて読み込む。
import type { Entry, ExerciseType } from "../records/format.ts";

export type TextMenu = { name: string; items: { exercise: string; sets: Partial<Entry>[] }[] };
export type PromptExercise = { name: string; type: ExerciseType; excludesBar?: boolean };

const MAX_NAME = 40;
const MAX_ITEMS = 30;
const MAX_SETS = 30;

const fmt = (n: number | null | undefined) => (n === null || n === undefined ? null : n);

/** メニュー → AIに渡すJSON（種目は名前で表す） */
export function menuToJson(menu: { name: string; items: { name: string; sets: Partial<Entry>[] }[] }): string {
  const items = menu.items.map((it) => ({
    exercise: it.name,
    sets: it.sets.map((s) =>
      Object.fromEntries(
        (["weight_kg", "reps", "duration_min", "distance_km"] as const)
          .map((k) => [k, fmt(s[k])] as const)
          .filter(([, v]) => v !== null),
      ),
    ),
  }));
  return JSON.stringify({ name: menu.name, items }, null, 2);
}

function setText(s: Partial<Entry>): string {
  const parts: string[] = [];
  if (s.weight_kg != null) parts.push(`${s.weight_kg}kg`);
  if (s.reps != null) parts.push(`${s.reps}回`);
  if (s.duration_min != null) parts.push(`${s.duration_min}分`);
  if (s.distance_km != null) parts.push(`${s.distance_km}km`);
  return parts.join("×") || "—";
}

/**
 * AIへの依頼文。ふだん使っているAIでメニューを相談したあとに貼る前提で、
 * 相談した内容を、使える種目の名前とJSONの形で出力してもらう
 */
export function buildMenuPrompt({
  exercises,
  current,
  recent,
}: {
  exercises: PromptExercise[];
  current?: { name: string; items: { name: string; sets: Partial<Entry>[] }[] } | null;
  recent?: { name: string; sets: Partial<Entry>[] }[];
}): string {
  const lines: string[] = [];
  lines.push(
    current
      ? "これまでの相談内容をふまえて、下の「今のメニュー」を見直したメニューを、最後の【出力形式】で出力してください。"
      : "これまでの相談内容をもとに、トレーニングメニューを1つ、最後の【出力形式】で出力してください。",
    "（記録アプリに取り込むための出力です）",
  );
  if (current) {
    lines.push("", "【今のメニュー】", "```json", menuToJson(current), "```");
  }
  if (recent && recent.length > 0) {
    lines.push("", "【最近の記録（各種目の前回）】");
    for (const r of recent) lines.push(`- ${r.name}: ${r.sets.map(setText).join("、")}`);
  }
  lines.push("", "【使える種目】（ジムにある種目です。種目名はこの名前をそのまま使ってください）");
  for (const e of exercises) {
    const note = e.type === "cardio" ? "有酸素" : e.excludesBar ? "重量系・重さはバーを除いた値" : "重量系";
    lines.push(`- ${e.name}（${note}）`);
  }
  lines.push(
    "一覧にない種目を入れる場合は、一般的な名前で書いてください。",
    "",
    "【出力形式】",
    "説明は短くてかまいません。最後に必ず、次の形のJSONを ```json と ``` で囲んで出力してください。",
    "```json",
    JSON.stringify(
      {
        name: "メニュー名（40文字以内）",
        items: [
          { exercise: "チェストプレス", sets: [{ weight_kg: 40, reps: 10 }, { weight_kg: 40, reps: 10 }] },
          { exercise: "ランニングマシン", sets: [{ duration_min: 20, distance_km: 3 }] },
        ],
      },
      null,
      2,
    ),
    "```",
    "- 重量系は weight_kg（kg）と reps（回）、有酸素は duration_min（分）と distance_km（km）",
    `- 種目は${MAX_ITEMS}まで、1種目のセットは${MAX_SETS}まで`,
  );
  return lines.join("\n");
}

function num(v: unknown, { integer = false, max = 9999 } = {}): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).trim().replace(/[０-９．]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)));
  if (!Number.isFinite(n) || n < 0 || n > max) return null;
  return integer ? Math.round(n) : Math.round(n * 100) / 100;
}

/** AIの答え（前後に説明文や ``` があってもよい）から、メニューのJSONを読み取る */
export function parseMenuText(text: string): { ok: true; menu: TextMenu } | { ok: false; error: string } {
  const fenced = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map((m) => m[1]);
  const candidates = [...fenced.reverse(), text];
  let data: unknown = undefined;
  for (const c of candidates) {
    const start = c.indexOf("{");
    const end = c.lastIndexOf("}");
    if (start < 0 || end <= start) continue;
    try {
      data = JSON.parse(c.slice(start, end + 1));
      break;
    } catch {
      // 次の候補へ
    }
  }
  if (!data || typeof data !== "object") return { ok: false, error: "メニューのJSONが見つかりませんでした。AIの答えをそのまま全部貼り付けてください" };

  const obj = data as { name?: unknown; items?: unknown };
  const name = String(obj.name ?? "").trim();
  if (!name) return { ok: false, error: "メニュー名（name）がありません" };
  if (!Array.isArray(obj.items) || obj.items.length === 0) return { ok: false, error: "種目（items）がありません" };
  if (obj.items.length > MAX_ITEMS) return { ok: false, error: `種目は${MAX_ITEMS}までです` };

  const items: TextMenu["items"] = [];
  for (const [i, raw] of obj.items.entries()) {
    const it = (raw ?? {}) as { exercise?: unknown; sets?: unknown };
    const exercise = String(it.exercise ?? "").trim();
    if (!exercise) return { ok: false, error: `${i + 1}番目の種目名（exercise）がありません` };
    const rawSets = Array.isArray(it.sets) ? it.sets : [];
    if (rawSets.length > MAX_SETS) return { ok: false, error: `${exercise}のセットは${MAX_SETS}までです` };
    const sets = rawSets.map((s) => {
      const v = (s ?? {}) as Record<string, unknown>;
      return {
        weight_kg: num(v.weight_kg, { max: 999 }),
        reps: num(v.reps, { integer: true }),
        duration_min: num(v.duration_min),
        distance_km: num(v.distance_km, { max: 999 }),
      };
    });
    items.push({ exercise, sets });
  }
  return { ok: true, menu: { name: [...name].slice(0, MAX_NAME).join(""), items } };
}

/** 種目名の比較用（全角半角・大文字小文字・空白・中黒の違いを無視） */
export function normalizeExerciseName(name: string): string {
  return name.normalize("NFKC").toLowerCase().replace(/[\s・･\-ー＿_]/g, "");
}

/** 名前が一致する種目（自分の種目より種目マスタを優先） */
export function matchExercise<T extends { name: string; custom: boolean }>(name: string, exercises: T[]): T | null {
  const key = normalizeExerciseName(name);
  const hits = exercises.filter((e) => normalizeExerciseName(e.name) === key);
  return hits.find((e) => !e.custom) ?? hits[0] ?? null;
}

/** 読み取ったセットから、新しく作る種目のタイプを推測（時間・距離だけなら有酸素） */
export function guessType(sets: Partial<Entry>[]): ExerciseType {
  const cardio = sets.some((s) => s.duration_min != null || s.distance_km != null);
  const weight = sets.some((s) => s.weight_kg != null || s.reps != null);
  return cardio && !weight ? "cardio" : "weight";
}
