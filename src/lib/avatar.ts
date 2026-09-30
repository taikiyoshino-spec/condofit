// プロフィール画像まわりの純粋関数（サーバー・クライアント共通）

export const AVATAR_MAX_BYTES = 512 * 1024;
export const AVATAR_SIZE = 256;

// 白文字が読める濃さの色（未登録時の頭文字アイコン用）
const COLORS = ["#1f8a4c", "#2563eb", "#9333ea", "#c2410c", "#0f766e", "#be185d", "#4d7c0f", "#b45309"];

/** 表示名の最初の1文字（絵文字や結合文字も1文字として扱う） */
export function initialOf(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const seg = new Intl.Segmenter("ja", { granularity: "grapheme" }).segment(trimmed)[Symbol.iterator]().next();
  return (seg.value?.segment ?? trimmed[0]).toUpperCase();
}

/** ユーザーごとに固定の色（名前を変えても色は変わらないよう userId から決める） */
export function colorFor(userId: string): string {
  let h = 0;
  for (const c of userId) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
}

export type ImageType = "image/jpeg" | "image/png" | "image/webp";

/** ファイル先頭のバイトで画像形式を判定する（拡張子や Content-Type は信用しない） */
export function detectImageType(bytes: Uint8Array): ImageType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)) return "image/png";
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

/** 画像の配信URL。保存先が変わるとURLも変わるので、ブラウザのキャッシュを長く効かせられる */
export function avatarUrl(userId: string, avatarPath: string | null): string | null {
  if (!avatarPath) return null;
  const version = avatarPath.split("/").pop()?.split(".")[0] ?? "";
  return `/api/avatar/${userId}?v=${encodeURIComponent(version)}`;
}
