// 外部ページ取得のための安全確認（純粋関数）。社内・ローカルのアドレスへは接続しない（SSRF 対策）
import { isIP } from "node:net";

/** 接続してはいけないアドレス（ループバック・プライベート・リンクローカル・CGNAT・マルチキャスト・未指定など） */
export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (v === 6) {
    const s = ip.toLowerCase();
    // IPv4 射影アドレス（::ffff:10.0.0.1）は IPv4 として判定
    const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    return (
      s === "::" ||
      s === "::1" ||
      s.startsWith("fc") ||
      s.startsWith("fd") ||
      /^fe[89ab]/.test(s) ||
      s.startsWith("ff") ||
      s.startsWith("64:ff9b:") ||
      s.startsWith("2001:db8")
    );
  }
  return true; // IP として読めないものは拒否
}

/** 取り込みに使ってよいURLか（http/https・標準ポート・ユーザー情報なし・IP直書きのプライベートアドレスなし） */
export function checkImportUrl(raw: string): { ok: true; url: URL } | { ok: false; error: string } {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, error: "URLが正しくありません" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { ok: false, error: "http(s) のURLを入れてください" };
  if (url.username || url.password) return { ok: false, error: "このURLは使えません" };
  if (url.port && url.port !== "80" && url.port !== "443") return { ok: false, error: "このURLは使えません" };
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    return { ok: false, error: "このURLは使えません" };
  }
  if (isIP(host) && isPrivateAddress(host)) return { ok: false, error: "このURLは使えません" };
  return { ok: true, url };
}
