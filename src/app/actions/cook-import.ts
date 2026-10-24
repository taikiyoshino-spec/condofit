"use server";

import { after } from "next/server";
import { requireCookUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { aiAvailable, type AiImage } from "@/lib/ai/gemini";
import { aiExtractRecipe, aiExtractRecipeFromImages, aiMatchIngredients } from "@/lib/cook/ai";
import { detectImageType } from "@/lib/avatar";
import { fetchRecipePage } from "@/lib/cook/fetch-page";
import { extractRecipeFromHtml, extractRecipeFromText, pageText, pageTitle, siteName, type ImportedRecipe } from "@/lib/cook/import";
import { INGREDIENT_CATEGORIES, cleanReading, matchIngredient, type IngredientCategory } from "@/lib/cook/ingredients";
import { listIngredients, type IngredientOption } from "@/lib/cook/queries";

// レシピサイトのURL、または写真・スクリーンショットから下書きを作る（RECIPE_SPEC.md D12・D13）。
// サイトの写真は取り込まない。本人が登録画面で直してから登録する

export type ImportDraft = Omit<ImportedRecipe, "ingredients"> & {
  sourceUrl: string;
  ingredients: (ImportedRecipe["ingredients"][number] & { ingredientId: string | null })[];
};
export type ImportResult = { ok: true; draft: ImportDraft; usedAi: boolean } | { ok: false; error: string };

/** URLから読み取る（受付のあと、サーバーで続けて行う） */
async function runUrlImport(url: string): Promise<ImportResult> {
  const page = await fetchRecipePage(String(url ?? ""));
  if (!page.ok) return { ok: false, error: page.error };

  let usedAi = false;
  let aiMessage: string | null = null;
  let recipe = extractRecipeFromHtml(page.html);
  if (!recipe && aiAvailable()) {
    const r = await aiExtractRecipe(pageText(page.html), siteName(page.html));
    if (r.ok) {
      recipe = r.recipe;
      usedAi = true;
    } else aiMessage = r.message;
  }
  // AIが使えない・読み取れなかったときは、「【材料】」「【作り方】」の見出しで書かれたブログ形式として読む
  if (!recipe) {
    const fromText = extractRecipeFromText(pageText(page.html, 100000), pageTitle(page.html));
    if (fromText) recipe = { ...fromText, sourceName: siteName(page.html) };
  }
  if (!recipe) {
    return {
      ok: false,
      error: aiMessage ?? "このサイトからは自動で読み取れませんでした。手入力してください",
    };
  }

  const matched = await matchToMaster(recipe);
  return { ok: true, draft: { ...recipe, sourceUrl: page.finalUrl, ingredients: matched.ingredients }, usedAi: usedAi || matched.usedAi };
}

/** 材料名を食材マスタに当てはめる（名前・別名で当たらないものだけAIに聞く） */
async function matchToMaster(recipe: ImportedRecipe): Promise<{ ingredients: ImportDraft["ingredients"]; usedAi: boolean }> {
  let usedAi = false;
  const master = await listIngredients();
  const ingredients = recipe.ingredients.map((i) => ({ ...i, ingredientId: matchIngredient(i.name, master)?.id ?? null }));
  const unmatched = [...new Set(ingredients.filter((i) => !i.ingredientId).map((i) => i.name))];
  if (unmatched.length > 0 && aiAvailable()) {
    const byName = new Map(master.map((m) => [m.name, m.id]));
    const matched = await aiMatchIngredients(unmatched, master.map((m) => m.name));
    if (matched.size > 0) usedAi = true;
    for (const i of ingredients) if (!i.ingredientId && matched.has(i.name)) i.ingredientId = byName.get(matched.get(i.name)!) ?? null;
  }
  return { ingredients, usedAi };
}

const MAX_IMAGES = 3;
const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024;

/** 写真から読み取る（受付のあと、サーバーで続けて行う） */
async function runImageImport(images: AiImage[]): Promise<ImportResult> {
  const r = await aiExtractRecipeFromImages(images);
  if (!r.ok) return { ok: false, error: r.message };
  const matched = await matchToMaster(r.recipe);
  return { ok: true, draft: { ...r.recipe, sourceUrl: "", ingredients: matched.ingredients }, usedAi: true };
}


/** 食材マスタにない食材を追加する（名前・読み・分類だけ。日数などは管理者が整える。D7） */
// ---- 受付（AIでの読み取りに時間がかかるため、受け付けたらすぐ返事をしてサーバーで続ける） ----
// スマホで別のアプリを開くと画面が止まり、結果を受け取れないことがあるため。画面は戻ってきたときに結果を見に来る

export type StartResult = { ok: true; jobId: string } | { ok: false; error: string };
export type JobStatus = { status: "pending" } | ({ status: "done" } & Extract<ImportResult, { ok: true }>) | { status: "failed"; error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function startJob(userId: string, run: () => Promise<ImportResult>): Promise<StartResult> {
  const admin = createAdminClient();
  // 古い受付（1日より前）は片付ける
  await admin.from("recipe_import_jobs").delete().eq("user_id", userId).lt("created_at", new Date(Date.now() - 86400000).toISOString());
  const { data, error } = await admin.from("recipe_import_jobs").insert({ user_id: userId }).select("id").single();
  if (error) return { ok: false, error: "受け付けられませんでした。もう一度試してください" };
  const jobId = data.id as string;
  after(async () => {
    let result: ImportResult;
    try {
      result = await run();
    } catch {
      result = { ok: false, error: "読み取りの途中で失敗しました。もう一度試してください" };
    }
    await admin
      .from("recipe_import_jobs")
      .update(
        result.ok
          ? { status: "done", result: { draft: result.draft, usedAi: result.usedAi } }
          : { status: "failed", error: result.error.slice(0, 300) },
      )
      .eq("id", jobId);
  });
  return { ok: true, jobId };
}

/** URLからの取り込みを受け付ける */
export async function startUrlImportAction(url: string): Promise<StartResult> {
  const member = await requireCookUser();
  const u = String(url ?? "").trim();
  if (!u) return { ok: false, error: "URLを入力してください" };
  return startJob(member.id, () => runUrlImport(u));
}

/** 写真・スクリーンショットからの取り込みを受け付ける（AIが使えるときだけ。画像は端末で縮小してから送る） */
export async function startImageImportAction(formData: FormData): Promise<StartResult> {
  const member = await requireCookUser();
  if (!aiAvailable()) return { ok: false, error: "写真からの取り込みは今は使えません。手入力してください" };
  const files = formData.getAll("image").filter((v): v is File => v instanceof File && v.size > 0);
  if (files.length === 0) return { ok: false, error: "写真を選んでください" };
  if (files.length > MAX_IMAGES) return { ok: false, error: `写真は${MAX_IMAGES}枚までです` };
  const images: AiImage[] = [];
  for (const file of files) {
    if (file.size > MAX_IMAGE_BYTES) return { ok: false, error: "写真が大きすぎます" };
    const bytes = new Uint8Array(await file.arrayBuffer());
    const type = detectImageType(bytes);
    if (!type) return { ok: false, error: "画像を読み込めませんでした" };
    images.push({ mimeType: type, base64: Buffer.from(bytes).toString("base64") });
  }
  return startJob(member.id, () => runImageImport(images));
}

/** 受け付けた取り込みの今の状態（本人の分だけ。RLS で強制） */
export async function getImportJobAction(jobId: string): Promise<JobStatus> {
  await requireCookUser();
  if (!UUID_RE.test(String(jobId))) return { status: "failed", error: "取り込みが見つかりません" };
  const supabase = await createClient();
  const { data } = await supabase.from("recipe_import_jobs").select("status, result, error").eq("id", jobId).maybeSingle();
  if (!data) return { status: "failed", error: "取り込みが見つかりません" };
  if (data.status === "done") {
    const r = data.result as { draft: ImportDraft; usedAi: boolean };
    return { status: "done", ok: true, draft: r.draft, usedAi: r.usedAi };
  }
  if (data.status === "failed") return { status: "failed", error: (data.error as string) ?? "読み取れませんでした" };
  return { status: "pending" };
}

export async function addIngredientAction(
  rawName: string,
  rawReading: string,
  category: IngredientCategory,
): Promise<{ ok: true; ingredient: IngredientOption } | { ok: false; error: string }> {
  const member = await requireCookUser();
  const name = String(rawName ?? "").normalize("NFC").trim();
  if (!name || [...name].length > 30) return { ok: false, error: "食材名を30文字以内で入力してください" };
  if (!INGREDIENT_CATEGORIES.includes(category)) return { ok: false, error: "分類を選んでください" };
  // 読みはひらがなにそろえる（カタカナ入力も可）
  const reading = cleanReading(String(rawReading ?? ""));

  const existing = matchIngredient(name, await listIngredients());
  if (existing) return { ok: true, ingredient: existing };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ingredients")
    .insert({ name, reading, category, created_by: member.id })
    .select("id, name, reading, aliases")
    .single();
  if (error) return { ok: false, error: error.code === "23505" ? "同じ名前の食材があります" : "追加できませんでした" };
  return { ok: true, ingredient: { id: data.id as string, name: data.name as string, reading: data.reading as string, aliases: (data.aliases as string[]) ?? [] } };
}
