import "server-only";

// Google Gemini API（無料枠）の呼び出し。キーがなければ何もしない（AIなしで全機能が動く前提。RECIPE_SPEC.md D13）。
// 無料枠では送った内容が提供元の改善に使われることがあるため、送るのはレシピ・食材名など公開情報だけにする

// 「その時点で最新の Flash」を指す名前。版を決め打ちすると、提供が終わったときに動かなくなるため
const DEFAULT_MODEL = "gemini-flash-latest";
const TIMEOUT_MS = 45000;

export function aiAvailable(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

export type AiImage = { mimeType: string; base64: string };

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

async function call(model: string, key: string, body: string): Promise<Response> {
  return fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

/** JSONで答えてもらう（responseSchema で形を指定）。画像も一緒に渡せる。失敗したときは理由を返す */
export async function geminiJsonResult<T>(prompt: string, schema: object, images: AiImage[] = []): Promise<AiResult<T>> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { ok: false, reason: "no_key" };
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const body = JSON.stringify({
    contents: [
      {
        role: "user",
        parts: [...images.map((i) => ({ inline_data: { mime_type: i.mimeType, data: i.base64 } })), { text: prompt }],
      },
    ],
    generationConfig: { responseMimeType: "application/json", responseSchema: schema, temperature: 0.1 },
  });
  try {
    let res = await call(model, key, body);
    // 設定したモデルの提供が終わっていたら、最新の Flash で試し直す
    if (res.status === 404 && model !== DEFAULT_MODEL) {
      console.error("gemini model not found, retry with", DEFAULT_MODEL);
      res = await call(DEFAULT_MODEL, key, body);
    }
    if (!res.ok) {
      // 原因を Vercel のログで追えるように、エラーの先頭だけ残す（キーや本文は出さない）
      console.error("gemini failed", res.status, (await res.text().catch(() => "")).slice(0, 300));
      const reason: AiFailure = res.status === 404 ? "model" : res.status === 429 ? "quota" : "rejected";
      return { ok: false, reason, status: res.status };
    }
    const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] };
    const text =
      data.candidates?.[0]?.content?.parts
        ?.filter((p) => !p.thought)
        .map((p) => p.text ?? "")
        .join("") ?? "";
    if (!text) return { ok: false, reason: "empty" };
    return { ok: true, data: JSON.parse(text) as T };
  } catch (e) {
    const name = (e as Error).name;
    console.error("gemini error", name);
    return { ok: false, reason: name === "TimeoutError" || name === "AbortError" ? "timeout" : name === "SyntaxError" ? "empty" : "network" };
  }
}

/** JSONで答えてもらう。失敗・上限到達・キー未設定は null（理由が要らないとき） */
export async function geminiJson<T>(prompt: string, schema: object, images: AiImage[] = []): Promise<T | null> {
  const r = await geminiJsonResult<T>(prompt, schema, images);
  return r.ok ? r.data : null;
}
