import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// Google Gemini API（無料枠）の呼び出し。キーがなければ何もしない（AIなしで全機能が動く前提。RECIPE_SPEC.md D13）。
// 無料枠では送った内容が提供元の改善に使われることがあるため、送るのはレシピ・食材名・名前を外した記録の数字だけにする

// 「その時点で最新の Flash-Lite」を指す名前。
// - 版を決め打ちすると、提供が終わったときに動かなくなるため「latest」にする
// - Flash（考えてから答える）は画像の読み取りで35秒を超えることがあったため、速い Lite にする（読み取り・当てはめには十分）
const DEFAULT_MODEL = "gemini-flash-lite-latest";
const TIMEOUT_MS = 35000;

export function aiAvailable(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

export type AiImage = { mimeType: string; base64: string };

/** どの機能から呼んだか（管理画面の利用状況で分けて数える） */
export type AiFeature = "cook_recipe_text" | "cook_recipe_image" | "cook_match" | "fit_review" | "fit_menu" | "fit_today";

/** 失敗の理由（画面に出す。キーや送った内容は含めない） */
export type AiFailure = "no_key" | "timeout" | "quota" | "model" | "rejected" | "empty" | "network";
export type AiResult<T> = { ok: true; data: T } | { ok: false; reason: AiFailure; status?: number };

export const AI_FAILURE_MESSAGE: Record<AiFailure, string> = {
  no_key: "AIが設定されていません",
  timeout: "AIの返事が時間内に来ませんでした。少し待ってからもう一度試してください",
  quota: "AIの無料枠の上限に達しました。時間をおいて試してください",
  model: "AIのモデルが見つかりませんでした（設定の確認が必要です）",
  rejected: "AIへの送信が受け付けられませんでした",
  empty: "AIから答えが返ってきませんでした",
  network: "AIにつながりませんでした",
};

async function call(model: string, key: string, body: string, timeoutMs: number): Promise<Response> {
  return fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body,
    signal: AbortSignal.timeout(timeoutMs),
  });
}

type Usage = { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };

/** 呼んだ回数・トークン数を記録する（管理画面で残りの目安を出すため）。記録に失敗しても本来の処理は止めない */
async function logUsage(row: {
  feature: AiFeature;
  model: string;
  ok: boolean;
  reason?: AiFailure;
  status?: number;
  usage?: Usage;
  durationMs: number;
}) {
  try {
    await createAdminClient()
      .from("ai_usage_logs")
      .insert({
        feature: row.feature,
        model: row.model,
        ok: row.ok,
        reason: row.reason ?? null,
        status: row.status ?? null,
        prompt_tokens: row.usage?.promptTokenCount ?? null,
        output_tokens: row.usage?.candidatesTokenCount ?? null,
        total_tokens: row.usage?.totalTokenCount ?? null,
        duration_ms: row.durationMs,
      });
  } catch (e) {
    console.error("ai usage log failed", (e as Error).name);
  }
}

/** JSONで答えてもらう（responseSchema で形を指定）。画像も一緒に渡せる。失敗したときは理由を返す */
export async function geminiJsonResult<T>(
  prompt: string,
  schema: object,
  { feature, images = [], timeoutMs = TIMEOUT_MS, temperature = 0.1 }: { feature: AiFeature; images?: AiImage[]; timeoutMs?: number; temperature?: number },
): Promise<AiResult<T>> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { ok: false, reason: "no_key" };
  let model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const body = JSON.stringify({
    contents: [
      {
        role: "user",
        parts: [...images.map((i) => ({ inline_data: { mime_type: i.mimeType, data: i.base64 } })), { text: prompt }],
      },
    ],
    generationConfig: { responseMimeType: "application/json", responseSchema: schema, temperature },
  });
  const started = Date.now();
  const fail = async (reason: AiFailure, status?: number, usage?: Usage): Promise<AiResult<T>> => {
    await logUsage({ feature, model, ok: false, reason, status, usage, durationMs: Date.now() - started });
    return { ok: false, reason, status };
  };
  try {
    let res = await call(model, key, body, timeoutMs);
    // 設定したモデルの提供が終わっていたら、最新の Flash-Lite で試し直す
    if (res.status === 404 && model !== DEFAULT_MODEL) {
      console.error("gemini model not found, retry with", DEFAULT_MODEL);
      model = DEFAULT_MODEL;
      res = await call(model, key, body, timeoutMs);
    }
    if (!res.ok) {
      // 原因を Vercel のログで追えるように、エラーの先頭だけ残す（キーや本文は出さない）
      console.error("gemini failed", res.status, (await res.text().catch(() => "")).slice(0, 300));
      return fail(res.status === 404 ? "model" : res.status === 429 ? "quota" : "rejected", res.status);
    }
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[];
      usageMetadata?: Usage;
    };
    const text =
      data.candidates?.[0]?.content?.parts
        ?.filter((p) => !p.thought)
        .map((p) => p.text ?? "")
        .join("") ?? "";
    // かかった時間をログに残す（遅いときの原因を Vercel のログで追えるように）
    console.log("gemini ok", feature, model, `${Date.now() - started}ms`, images.length ? `images=${images.length}` : "text");
    if (!text) return fail("empty", undefined, data.usageMetadata);
    let parsed: T;
    try {
      parsed = JSON.parse(text) as T;
    } catch {
      return fail("empty", undefined, data.usageMetadata);
    }
    await logUsage({ feature, model, ok: true, usage: data.usageMetadata, durationMs: Date.now() - started });
    return { ok: true, data: parsed };
  } catch (e) {
    const name = (e as Error).name;
    console.error("gemini error", name, model, `${Date.now() - started}ms`);
    return fail(name === "TimeoutError" || name === "AbortError" ? "timeout" : "network");
  }
}

/** JSONで答えてもらう。失敗・上限到達・キー未設定は null（理由が要らないとき） */
export async function geminiJson<T>(
  prompt: string,
  schema: object,
  options: { feature: AiFeature; images?: AiImage[]; timeoutMs?: number },
): Promise<T | null> {
  const r = await geminiJsonResult<T>(prompt, schema, options);
  return r.ok ? r.data : null;
}
