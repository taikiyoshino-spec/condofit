import { requireAdmin } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { aiAvailable } from "@/lib/ai/gemini";
import { quotaDayEnd, summarizeUsage, type UsageRow } from "@/lib/ai/usage";
import { PageHeader, Section } from "@/components/page";

const fmt = (n: number) => n.toLocaleString("ja-JP");
const jstTime = (d: Date) =>
  new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" }).format(d);

/** 管理者: AIの利用状況（アプリから呼んだ回数・トークン数。Gemini に残りを問い合わせる仕組みはないので、アプリで数えたもの） */
export default async function AdminAiPage() {
  await requireAdmin();
  const now = new Date();
  const { data } = await createAdminClient()
    .from("ai_usage_logs")
    .select("created_at, feature, ok, reason, total_tokens")
    .gte("created_at", new Date(now.getTime() - 8 * 86400e3).toISOString())
    .order("created_at", { ascending: false })
    .limit(5000);
  const rows: UsageRow[] = (data ?? []).map((r) => ({
    createdAt: r.created_at as string,
    feature: r.feature as string,
    ok: r.ok as boolean,
    reason: r.reason as string | null,
    totalTokens: r.total_tokens as number | null,
  }));
  const s = summarizeUsage(rows, now);
  const limit = Number(process.env.GEMINI_DAILY_LIMIT) || null;
  const left = limit === null ? null : Math.max(0, limit - s.today.requests);

  return (
    <>
      <PageHeader title="AIの利用状況" back="/admin" />
      {!aiAvailable() && (
        <Section>
          <p className="text-sm text-warn">AIのキー（GEMINI_API_KEY）が設定されていません。AIを使う機能は、AIなしで動いています。</p>
        </Section>
      )}
      <Section title="今日">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-bg p-3">
            <p className="text-xs text-muted">{limit === null ? "使った回数" : "残りの回数"}</p>
            <p className="mt-1 text-2xl font-semibold">
              {limit === null ? fmt(s.today.requests) : fmt(left!)}
              {limit !== null && <span className="text-sm font-normal text-muted"> / {fmt(limit)}</span>}
            </p>
            {limit !== null && <p className="text-xs text-muted">使った {fmt(s.today.requests)}回</p>}
          </div>
          <div className="rounded-lg bg-bg p-3">
            <p className="text-xs text-muted">使ったトークン</p>
            <p className="mt-1 text-2xl font-semibold">{fmt(s.today.tokens)}</p>
            {s.today.failed > 0 && (
              <p className="text-xs text-warn">
                失敗 {s.today.failed}回{s.today.quotaErrors > 0 ? `（うち上限 ${s.today.quotaErrors}回）` : ""}
              </p>
            )}
          </div>
        </div>
        <p className="mt-2 text-xs text-muted">
          無料枠の1日の回数は {jstTime(quotaDayEnd(now))} に戻ります（米国の太平洋時間の0時）。
          {limit === null && "上限の回数を環境変数 GEMINI_DAILY_LIMIT に入れると、残りの回数を出せます。"}
        </p>
        {s.byFeature.length > 0 && (
          <ul className="mt-3 divide-y divide-border text-sm">
            {s.byFeature.map((f) => (
              <li key={f.feature} className="flex justify-between py-2">
                <span>{f.label}</span>
                <span className="text-muted">
                  {fmt(f.requests)}回・{fmt(f.tokens)}トークン
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section title="日ごと（日本時間・直近7日）">
        {s.byDay.length === 0 ? (
          <p className="text-sm text-muted">まだ記録がありません。</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted">
                <th className="pb-1 text-left font-normal">日付</th>
                <th className="pb-1 text-right font-normal">回数</th>
                <th className="pb-1 text-right font-normal">トークン</th>
                <th className="pb-1 text-right font-normal">失敗</th>
              </tr>
            </thead>
            <tbody>
              {s.byDay.slice(0, 7).map((d) => (
                <tr key={d.date} className="border-t border-border">
                  <td className="py-1.5">{Number(d.date.slice(5, 7))}/{Number(d.date.slice(8, 10))}</td>
                  <td className="py-1.5 text-right">{fmt(d.requests)}</td>
                  <td className="py-1.5 text-right">{fmt(d.tokens)}</td>
                  <td className={`py-1.5 text-right ${d.failed ? "text-warn" : "text-muted"}`}>{d.failed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
      <p className="px-4 pb-6 text-xs text-muted">
        アプリから呼んだ分だけを数えています。正確な上限と使用量は{" "}
        <a href="https://aistudio.google.com/usage" target="_blank" rel="noreferrer" className="text-accent underline">
          Google AI Studio
        </a>{" "}
        で確認できます。
      </p>
    </>
  );
}
