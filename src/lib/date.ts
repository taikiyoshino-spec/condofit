// 日付はすべて JST の "YYYY-MM-DD" 文字列で扱う（タイムゾーンのずれを避けるため Date は UTC 正午基準で計算）

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"] as const;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function todayJst(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(now);
}

export function isValidDateString(s: string): boolean {
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

function toUtcNoon(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

function fromUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(s: string, days: number): string {
  const d = toUtcNoon(s);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUtc(d);
}

export function weekday(s: string): number {
  return toUtcNoon(s).getUTCDay();
}

/** "9/28（日）" */
export function formatDate(s: string, { withWeekday = true } = {}): string {
  const [, m, d] = s.split("-").map(Number);
  return withWeekday ? `${m}/${d}（${WEEKDAYS[weekday(s)]}）` : `${m}/${d}`;
}

export function weekdayLabel(s: string): string {
  return WEEKDAYS[weekday(s)];
}

/** "2026-09" 形式の月 */
export function monthOf(s: string): string {
  return s.slice(0, 7);
}

export function isValidMonthString(s: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1, 12));
  return fromUtc(d).slice(0, 7);
}

/** 月間カレンダーのマス（日曜始まり、前後月の日は null） */
export function monthGrid(month: string): (string | null)[][] {
  const first = `${month}-01`;
  const lastDay = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 0, 12)).getUTCDate();
  const cells: (string | null)[] = Array(weekday(first)).fill(null);
  for (let d = 1; d <= lastDay; d++) cells.push(`${month}-${String(d).padStart(2, "0")}`);
  while (cells.length % 7) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export function monthRange(month: string): { start: string; end: string } {
  const next = addMonths(month, 1);
  return { start: `${month}-01`, end: addDays(`${next}-01`, -1) };
}

export function formatMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${y}年${m}月`;
}
