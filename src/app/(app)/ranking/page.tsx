import Link from "next/link";
import { requireMember } from "@/lib/auth/session";
import { getMonthlyRanking, METRIC_LABEL, metricValue, type RankingMetric } from "@/lib/ranking-queries";
import { addMonths, formatMonth, isValidMonthString, monthOf, todayJst } from "@/lib/date";
import { PageHeader, Section } from "@/components/page";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { MemberName } from "@/components/avatar";
import { RankBadge } from "@/components/rank-badge";

const METRICS: RankingMetric[] = ["visits", "kinds"];

export default async function RankingPage({ searchParams }: PageProps<"/ranking">) {
  const member = await requireMember();
  const { m, by } = await searchParams;
  const thisMonth = monthOf(todayJst());
  // 未来の月は表示しない
  const month = typeof m === "string" && isValidMonthString(m) && m <= thisMonth ? m : thisMonth;
  const metric: RankingMetric = by === "kinds" ? "kinds" : "visits";
  const rows = await getMonthlyRanking(month, metric);
  const { unit } = METRIC_LABEL[metric];
  const href = (mm: string, b: RankingMetric) => `/ranking?m=${mm}&by=${b}`;

  return (
    <>
      <RealtimeRefresh tables={["training_sessions"]} />
      <PageHeader title="ランキング" back="/" />

      <div className="mx-4 mb-3 grid grid-cols-2 gap-1 rounded-lg bg-border/60 p-1" role="tablist">
        {METRICS.map((b) => (
          <Link
            key={b}
            href={href(month, b)}
            role="tab"
            aria-selected={b === metric}
            className={`rounded-md py-2 text-center text-sm ${b === metric ? "bg-surface font-semibold shadow-sm" : "text-muted"}`}
          >
            {METRIC_LABEL[b].label}
          </Link>
        ))}
      </div>

      <div className="mx-4 mb-3 flex items-center justify-between">
        <Link href={href(addMonths(month, -1), metric)} className="rounded px-3 py-1 text-muted" aria-label="前の月">
          ‹
        </Link>
        <h2 className="font-semibold">{formatMonth(month)}</h2>
        {month < thisMonth ? (
          <Link href={href(addMonths(month, 1), metric)} className="rounded px-3 py-1 text-muted" aria-label="次の月">
            ›
          </Link>
        ) : (
          <span className="px-3 py-1 text-transparent" aria-hidden>
            ›
          </span>
        )}
      </div>

      <Section>
        {rows.length === 0 ? (
          <p className="text-sm text-muted">メンバーがいません</p>
        ) : (
          <ol className="divide-y divide-border">
            {rows.map((r) => (
              <li
                key={r.userId}
                className={`flex items-center gap-3 py-2.5 ${r.userId === member.id ? "font-semibold" : ""}`}
              >
                <RankBadge rank={r.rank} />
                <MemberName userId={r.userId} name={r.displayName} size={32} className="flex-1" />
                <span className="shrink-0 text-sm">
                  {metricValue(metric, r)}
                  {unit}
                </span>
              </li>
            ))}
          </ol>
        )}
        <p className="mt-3 text-xs text-muted">
          {metric === "visits" ? "Fit訪問回数はトレーニング記録の数です（チェックインは数えません）。" : "その月にやった種目の種類の数です。"}
          同じ値の人は同じ順位です。
        </p>
      </Section>
    </>
  );
}
