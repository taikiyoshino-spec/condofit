import "server-only";

// Google Gemini API（無料枠）の呼び出し。キーがなければ何もしない（AIなしで全機能が動く前提。RECIPE_SPEC.md D13）。
// 無料枠では送った内容が提供元の改善に使われることがあるため、送るのはレシピ・食材名など公開情報だけにする

const DEFAULT_MODEL = "gemini-2.5-flash";
const TIMEOUT_MS = 40000;

export function aiAvailable(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

export type AiImage = { mimeType: string; base64: string };

/** JSONで答えてもらう（responseSchema で形を指定）。画像も一緒に渡せる。失敗・上限到達・キー未設定は null */
export async function geminiJson<T>(prompt: string, schema: object, images: AiImage[] = []): Promise<T | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [...images.map((i) => ({ inline_data: { mime_type: i.mimeType, data: i.base64 } })), { text: prompt }],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: schema,
          temperature: 0.1,
          // 読み取り・当てはめには「考える」時間は要らない（速く答えてもらい、時間切れを防ぐ）
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      // 原因を Vercel のログで追えるように、エラーの先頭だけ残す（キーや本文は出さない）
      console.error("gemini failed", res.status, (await res.text().catch(() => "")).slice(0, 300));
      return null;
    }
    const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    return text ? (JSON.parse(text) as T) : null;
  } catch (e) {
    console.error("gemini error", (e as Error).name);
    return null;
  }
}
