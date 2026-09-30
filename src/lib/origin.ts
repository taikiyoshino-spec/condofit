// 招待URLなどに使うアプリのオリジンを決める。
// 環境変数が「空文字」で登録されている場合もあるため、空の値は未設定として扱う。
export function resolveAppOrigin(opts: {
  appOrigin?: string;
  vercelProductionUrl?: string;
  host?: string | null;
  proto?: string | null;
}): string | null {
  const clean = (v?: string | null) => v?.trim().replace(/\/+$/, "") || null;

  const explicit = clean(opts.appOrigin);
  if (explicit) return /^https?:\/\//.test(explicit) ? explicit : `https://${explicit}`;

  // Vercel が自動で渡す本番ドメイン（デプロイごとのURLではなく固定のもの）
  const production = clean(opts.vercelProductionUrl);
  if (production) return `https://${production}`;

  const host = clean(opts.host);
  if (!host) return null;
  const proto = clean(opts.proto) ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

/** 環境変数の状態（値は返さない） */
export function envStatus(value: string | undefined, valid: (v: string) => boolean = () => true) {
  if (value === undefined) return "missing";
  if (value.trim() === "") return "empty";
  return valid(value.trim()) ? "ok" : "invalid";
}
