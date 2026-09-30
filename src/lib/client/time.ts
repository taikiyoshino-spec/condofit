export const STALE_MINUTES = 15;

export function minutesSince(iso: string, now: number): number {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
}

export function relativeMinutes(iso: string, now: number): string {
  const m = minutesSince(iso, now);
  if (m < 1) return "たった今";
  if (m < 60) return `${m}分前`;
  if (m >= 24 * 60) return `${Math.floor(m / (24 * 60))}日前`;
  const h = Math.floor(m / 60);
  return `${h}時間${m % 60 ? `${m % 60}分` : ""}前`;
}
