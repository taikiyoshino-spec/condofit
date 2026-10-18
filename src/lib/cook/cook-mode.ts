// 作るモード（RECIPE_SPEC.md D24）の純粋関数: 手順の文からタイマーを見つける・音声のことばを操作にする・手順で使う材料
import { cleanIngredientName, normalizeFood } from "./ingredients.ts";

export type StepTimer = { label: string; seconds: number };

const KANJI_NUM: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };

/**
 * 手順の文から時間を見つける（「5分煮る」「30秒」「2〜3分」「1時間半」「1時間30分」「十分」は除く）。
 * 範囲は長い方。同じ長さは1つにまとめる
 */
export function findTimers(text: string): StepTimer[] {
  const s = text.normalize("NFKC").replace(/[一二三四五六七八九]/g, (c) => String(KANJI_NUM[c]));
  const found: StepTimer[] = [];
  const re = /(\d+(?:\.\d+)?)(?:\s*[〜~～\-]\s*(\d+(?:\.\d+)?))?\s*(時間半|時間|分|秒)(?:\s*(\d+)\s*(分|秒))?/g;
  for (const m of s.matchAll(re)) {
    // 「1/2分」のような分数や「5分の1」は時間ではない
    const before = s[m.index! - 1];
    const after = s.slice(m.index! + m[0].length, m.index! + m[0].length + 1);
    if (before === "/" || after === "の") continue;
    const n = Number(m[2] ?? m[1]);
    const unit = m[3];
    let seconds = unit === "秒" ? n : unit === "分" ? n * 60 : unit === "時間半" ? (n + 0.5) * 3600 : n * 3600;
    if (m[4]) seconds += Number(m[4]) * (m[5] === "分" ? 60 : 1);
    seconds = Math.round(seconds);
    if (seconds < 5 || seconds > 24 * 3600) continue;
    if (!found.some((t) => t.seconds === seconds)) found.push({ label: m[0].replace(/\s+/g, ""), seconds });
  }
  return found;
}

export type VoiceCommand = "next" | "prev" | "repeat";

/** 音声認識の結果 → 操作（「次」「戻る」「もう一回」）。どれでもなければ null */
export function voiceCommand(transcript: string): VoiceCommand | null {
  const t = normalizeFood(transcript);
  if (/もどる|戻る|まえ|前|ばっく|back/.test(t)) return "prev";
  if (/もういっかい|もう1回|もう一回|もう一度|もういちど|くりかえ|繰り返/.test(t)) return "repeat";
  if (/つぎ|次|ねくすと|next|すすむ|進む|おけ|おっけ|ok/.test(t)) return "next";
  return null;
}

/** 秒 → 「4:05」「1:02:03」 */
export function formatSeconds(total: number): string {
  const t = Math.max(0, Math.ceil(total));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = String(t % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

/** 手順の文に出てくる材料（材料名・飾りを外した名前のどちらかが文に含まれるもの） */
export function ingredientsInStep<T extends { name: string }>(step: string, ingredients: T[]): T[] {
  const text = normalizeFood(step);
  return ingredients.filter((i) => {
    const names = [i.name, cleanIngredientName(i.name)].map(normalizeFood).filter((n) => n.length >= 1);
    return names.some((n) => text.includes(n));
  });
}
