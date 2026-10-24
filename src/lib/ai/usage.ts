// AIの利用状況の集計（純粋関数。管理画面で使う）
// Gemini の無料枠の「1日の回数」は米国太平洋時間の0時（日本時間の16時か17時）に戻るので、「今日」はその区切りで数える

export const FEATURE_LABEL: Record<string, string> = {
  cook_recipe_text: "レシピの読み取り（URL）",
  cook_recipe_image: "レシピの読み取り（写真）",
  cook_match: "材料の当てはめ",
  fit_review: "月のふりかえり",
  fit_menu: "メニュー作成",
};

export type UsageRow = { createdAt: string; feature: string; ok: boolean; reason: string | null; totalTokens: number | null };

const PT = "America/Los_Angeles";

function ptParts(t: number) {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: PT, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date(t));
  const get = (k: string) => Number(p.find((x) => x.type === k)!.value);
  return { y: get("year"), m: get("month"), d: get("day"), h: get("hour") };
}

/** 無料枠の「今日」が始まった時刻（太平洋時間の0時。夏時間を考える） */
export function quotaDayStart(now: Date): Date {
  const { y, m, d } = ptParts(now.getTime());
  for (const offset of [7, 8]) {
    const t = Date.UTC(y, m - 1, d, offset);
    const p = ptParts(t);
    if (p.d === d && p.h === 0) return new Date(t);
  }
  return new Date(Date.UTC(y, m - 1, d, 8));
}

/** 次に回数が戻る時刻 */
export function quotaDayEnd(now: Date): Date {
  return quotaDayStart(new Date(quotaDayStart(now).getTime() + 30 * 3600e3));
}

export type UsageTotals = { requests: number; failed: number; quotaErrors: number; tokens: number };
const empty = (): UsageTotals => ({ requests: 0, failed: 0, quotaErrors: 0, tokens: 0 });
function add(t: UsageTotals, r: UsageRow) {
  t.requests++;
  if (!r.ok) t.failed++;
  if (r.reason === "quota") t.quotaErrors++;
  t.tokens += r.totalTokens ?? 0;
}

const jstDate = (iso: string) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date(iso));

/** 今日（無料枠の区切り）の合計・機能ごとの内訳と、日本時間の日ごとの合計（新しい順） */
export function summarizeUsage(rows: UsageRow[], now: Date) {
  const start = quotaDayStart(now).getTime();
  const today = empty();
  const byFeature = new Map<string, UsageTotals>();
  const byDay = new Map<string, UsageTotals>();
  for (const r of rows) {
    const t = Date.parse(r.createdAt);
    if (t >= start) {
      add(today, r);
      const f = byFeature.get(r.feature) ?? empty();
      add(f, r);
      byFeature.set(r.feature, f);
    }
    const day = jstDate(r.createdAt);
    const d = byDay.get(day) ?? empty();
    add(d, r);
    byDay.set(day, d);
  }
  return {
    today,
    byFeature: [...byFeature].map(([feature, t]) => ({ feature, label: FEATURE_LABEL[feature] ?? feature, ...t })).sort((a, b) => b.requests - a.requests),
    byDay: [...byDay].map(([date, t]) => ({ date, ...t })).sort((a, b) => b.date.localeCompare(a.date)),
  };
}
