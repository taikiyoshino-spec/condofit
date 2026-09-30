// PIN・招待トークンの暗号処理。node:crypto のみに依存（scripts/ からも直接 import する）。
import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export const PIN_PATTERN = /^\d{4}$/;
export const DISPLAY_NAME_MAX = 20;
const AUTH_EMAIL_DOMAIN = "users.condofit.invalid";

export function isValidPin(pin: string): boolean {
  return PIN_PATTERN.test(pin);
}

export function normalizeDisplayName(name: string): string {
  return name.normalize("NFC").trim();
}

export function validateDisplayName(name: string): string | null {
  if (name.length === 0) return "表示名を入力してください";
  if ([...name].length > DISPLAY_NAME_MAX) return `表示名は${DISPLAY_NAME_MAX}文字以内にしてください`;
  return null;
}

/** ログイン試行制限のキー（DBの一意制約 lower(display_name) と揃える） */
export function displayNameKey(name: string): string {
  return normalizeDisplayName(name).toLowerCase();
}

export function hashPin(pin: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(pin, salt, 32);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function verifyPin(pin: string, stored: string): boolean {
  const [scheme, saltB64, hashB64] = stored.split("$");
  if (scheme !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64");
  const actual = scryptSync(pin, Buffer.from(saltB64, "base64"), expected.length);
  return timingSafeEqual(actual, expected);
}

/**
 * Supabase Auth に渡すパスワード。4桁PINは最小長に満たず総当たりにも弱いため、
 * サーバーだけが知るペッパーで派生させる（anonキーから直接ログインを試されても突破できない）。
 */
export function deriveAuthPassword(userId: string, pin: string, pepper: string): string {
  if (!pepper) throw new Error("PIN_PEPPER is not set");
  return createHmac("sha256", pepper).update(`${userId}:${pin}`).digest("base64url");
}

export function authEmail(userId: string): string {
  return `${userId}@${AUTH_EMAIL_DOMAIN}`;
}

export function generateInviteToken(): string {
  return randomBytes(24).toString("base64url");
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
