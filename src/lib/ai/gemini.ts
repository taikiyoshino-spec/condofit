import "server-only";

// Google Gemini API（無料枠）の呼び出し。キーがなければ何もしない（AIなしで全機能が動く前提。RECIPE_SPEC.md D13）。
// 無料枠では送った内容が提供元の改善に使われることがあるため、送るのはレシピ・食材名など公開情報だけにする

const DEFAULT_MODEL = "gemini-2.5-flash";
const TIMEOUT_MS = 20000;

export function aiAvailable(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

/** JSONで答えてもらう（responseSchema で形を指定）。失敗・上限到達・キー未設定は null */
export async function geminiJson<T>(prompt: string, schema: object): Promise<T | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", responseSchema: schema, temperature: 0.1 },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error("gemini failed", res.status);
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
