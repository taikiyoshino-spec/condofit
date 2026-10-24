import "server-only";
import { AI_FAILURE_MESSAGE, geminiJson, geminiJsonResult, type AiImage } from "@/lib/ai/gemini";
import { parseYield, type ImportedRecipe } from "./import";

// CondoCook でのAIの使いどころ（レシピ登録のときだけ。D13）
// 1. 構造化データのないページ、または写真・スクリーンショットからレシピを読み取る
// 2. 食材マスタの別名で当たらなかった材料名を、食材マスタの名前に当てはめる

const RECIPE_SCHEMA = {
  type: "OBJECT",
  properties: {
    found: { type: "BOOLEAN" },
    title: { type: "STRING" },
    servings: { type: "INTEGER" },
    cookMinutes: { type: "INTEGER" },
    ingredients: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { name: { type: "STRING" }, amount: { type: "STRING" }, section: { type: "STRING" } },
        required: ["name", "amount"],
      },
    },
    steps: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["found"],
};

type AiRecipe = {
  found: boolean;
  title?: string;
  servings?: number;
  cookMinutes?: number;
  ingredients?: { name: string; amount: string; section?: string }[];
  steps?: string[];
};

/** AIでの読み取りの結果。失敗したときは画面に出す理由 */
export type AiRecipeResult = { ok: true; recipe: ImportedRecipe } | { ok: false; message: string };

async function extract(prompt: string, images: AiImage[], siteName: string | null, notFound: string): Promise<AiRecipeResult> {
  const r = await geminiJsonResult<AiRecipe>(prompt, RECIPE_SCHEMA, images);
  if (!r.ok) return { ok: false, message: AI_FAILURE_MESSAGE[r.reason] + (r.status ? `（エラー ${r.status}）` : "") };
  const recipe = toImported(r.data, siteName);
  return recipe ? { ok: true, recipe } : { ok: false, message: notFound };
}

/** ページ本文からレシピを読み取る */
export async function aiExtractRecipe(text: string, siteName: string | null): Promise<AiRecipeResult> {
  const prompt = [
    "次のウェブページの本文から、料理のレシピを1つ読み取ってください。",
    "- レシピが載っていなければ found を false に",
    "- 材料は name（材料名）と amount（分量。「200g」「大さじ2」「少々」など）に分け、「タレ」「A」などのまとまりがあれば section に",
    "- steps は作り方の手順。原文の内容のまま、1手順1要素で",
    "- 本文にない情報は作らない",
    "",
    "--- 本文 ---",
    text,
  ].join("\n");
  return extract(prompt, [], siteName, "このページからレシピを読み取れませんでした。手入力してください");
}

/** 写真・スクリーンショット（料理本・メモ・表計算・アプリの画面など）からレシピを読み取る */
export async function aiExtractRecipeFromImages(images: AiImage[]): Promise<AiRecipeResult> {
  const prompt = [
    "画像（料理本・手書きのメモ・表計算ソフトの表・レシピサイトやアプリのスクリーンショットなど）から、料理のレシピを1つ読み取ってください。",
    "画像が複数あるときは、続きのページとして1つのレシピにまとめてください。",
    "- 表の形のときは、材料名・分量・備考などの列を読み、備考の補足（「100g」など）は分量に添える（例「半分（100g）」）。空の行は無視する",
    "- 材料の横に「A」「B」などの印があれば、同じ印の材料をまとめて section にその印を入れる",
    "- 「何人分」「人数」が「2~3」のように幅があれば小さい方の数を servings に",
    "- レシピが写っていなければ found を false に",
    "- 料理名が読み取れなければ、材料と作り方から短い料理名を付ける",
    "- 材料は name（材料名）と amount（分量。「200g」「大さじ2」「少々」など）に分け、「タレ」「A」などのまとまりがあれば section に",
    "- steps は作り方の手順。写っている内容のまま、1手順1要素で",
    "- 写っていない情報は作らない",
  ].join("\n");
  return extract(prompt, images, null, "写真からレシピを読み取れませんでした。文字がはっきり写った写真で試すか、手入力してください");
}

function toImported(r: AiRecipe | null, siteName: string | null): ImportedRecipe | null {
  if (!r?.found || !r.title || !r.ingredients?.length) return null;
  return {
    title: r.title.trim().slice(0, 60),
    servings: parseYield(r.servings),
    cookMinutes: r.cookMinutes && r.cookMinutes > 0 && r.cookMinutes <= 1440 ? Math.round(r.cookMinutes) : null,
    sourceName: siteName,
    ingredients: r.ingredients
      .filter((i) => i.name?.trim())
      .slice(0, 60)
      .map((i) => ({ name: i.name.trim().slice(0, 60), amount: (i.amount ?? "").trim().slice(0, 30), section: i.section?.trim().slice(0, 20) || null })),
    steps: (r.steps ?? []).map((s) => s.trim().slice(0, 500)).filter(Boolean).slice(0, 40),
  };
}

// 当てはめは補助なので短めに待つ（取り込み全体を時間内に終えるため）
const MATCH_TIMEOUT_MS = 12000;

const MATCH_SCHEMA = {
  type: "ARRAY",
  items: { type: "OBJECT", properties: { input: { type: "STRING" }, match: { type: "STRING" } }, required: ["input", "match"] },
};

/**
 * 材料名 → 食材マスタの名前。当てはまるものがなければ含めない。
 * AIの答えは食材マスタに実在する名前のときだけ採用する
 */
export async function aiMatchIngredients(names: string[], masterNames: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (names.length === 0) return result;
  const master = new Set(masterNames);
  const prompt = [
    "レシピの材料名を、食材の一覧の名前に当てはめてください。",
    "- match には一覧の名前をそのまま書く。同じ食材と言えるものがなければ空文字",
    "- 「鶏肉（もも）」→「鶏もも肉」のような言い換えは当てはめる。種類が違うもの（鶏むね肉と鶏もも肉など）は当てはめない",
    "",
    `材料名: ${JSON.stringify(names.slice(0, 40))}`,
    "",
    `食材の一覧: ${masterNames.join("、")}`,
  ].join("\n");
  const r = await geminiJson<{ input: string; match: string }[]>(prompt, MATCH_SCHEMA, [], MATCH_TIMEOUT_MS);
  for (const m of r ?? []) {
    if (names.includes(m.input) && master.has(m.match)) result.set(m.input, m.match);
  }
  return result;
}
