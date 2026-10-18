// ログイン後に戻る先（?next=）の検証。自サイト内のパスだけを許可する（外部サイトへの転送を防ぐ）

export function safeNextPath(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 512) return null;
  // "/" で始まり、"//"（別ホスト）や "/\"（ブラウザによっては別ホスト扱い）で始まらないもの
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return null;
  if (/[\u0000-\u001f]/.test(raw)) return null;
  if (raw === "/login" || raw.startsWith("/login?") || raw.startsWith("/login/")) return null;
  return raw;
}

/** CondoCook（/cook 配下）のパスか */
export function isCookPath(path: string): boolean {
  return path === "/cook" || path.startsWith("/cook/") || path.startsWith("/cook?");
}
