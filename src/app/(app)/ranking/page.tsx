import Link from "next/link";
import { requireMember } from "@/lib/auth/session";
import {
  getMonthlyExercisesByUser,
  getMonthlyRanking,
  METRIC_LABEL,
  metricValue,
  type RankingMetric,
} from "@/lib/ranking-queries";
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
  const [rows, exercisesByUser] = await Promise.all([
    getMonthlyRanking(month, metric),
    metric === "kinds" ? getMonthlyExercisesByUser(month) : Promise.resolve(null),
  ]);
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
            {rows.map((r) => {
              const row = (
                <>
                  <RankBadge rank={r.rank} />
                  <MemberName userId={r.userId} name={r.displayName} size={32} className="flex-1" />
                  <span className="shrink-0 text-sm">
                    {metricValue(metric, r)}
                    {unit}
                  </span>
                </>
              );
              const mine = r.userId === member.id ? "font-semibold" : "";
              const done = exercisesByUser?.[r.userId] ?? [];

              // 種目の数のときは、タップでその月にやった種目を開く（種目名と回数のみ）
              if (metric === "kinds" && done.length > 0) {
                return (
                  <li key={r.userId}>
                    <details className="group">
                      <summary className={`flex cursor-pointer list-none items-center gap-3 py-2.5 ${mine}`}>
                        {row}
                        <span className="shrink-0 text-muted transition-transform group-open:rotate-90" aria-hidden>
                          ›
                        </span>
                      </summary>
                      <div className="mb-3 ml-9">
                        <p className="mb-1.5 text-xs text-muted">タップすると種目の詳細へ</p>
                        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface text-sm">
                          {done.map((e) => (
                            <li key={e.exerciseId}>
                              <Link
                                href={`/exercises/${e.exerciseId}`}
                                className="flex items-center gap-3 px-3 py-2.5 active:bg-bg"
                              >
                                <span className="min-w-0 flex-1 truncate">{e.name}</span>
                                <span className="shrink-0 text-muted">{e.count}回</span>
                                <span className="shrink-0 text-muted" aria-hidden>
                                  ›
                                </span>
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </details>
                  </li>
                );
              }
              return (
                <li key={r.userId} className={`flex items-center gap-3 py-2.5 ${mine}`}>
                  {row}
                  {metric === "kinds" && <span className="w-[0.6rem] shrink-0" aria-hidden />}
                </li>
              );
            })}
          </ol>
        )}
        <p className="mt-3 text-xs text-muted">
          {metric === "visits"
            ? "Fit訪問回数はトレーニング記録の数です（チェックインは数えません）。"
            : "その月にやった種目の種類の数です。名前をタップすると、やった種目と回数が見られます。"}
          同じ値の人は同じ順位です。
        </p>
      </Section>
    </>
  );
}
