import Link from "next/link";
import { requireMember } from "@/lib/auth/session";
import { getMonthlyPartRanking, getMonthlyRanking, METRIC_LABEL, type RankingMetric } from "@/lib/ranking-queries";
import { listPartInfo } from "@/lib/records/parts-queries";
import { addMonths, formatMonth, isValidMonthString, monthOf, todayJst } from "@/lib/date";
import { PageHeader, Section } from "@/components/page";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { MemberName } from "@/components/avatar";
import { RankBadge } from "@/components/rank-badge";

const METRICS: RankingMetric[] = ["visits", "parts"];

type Row = { userId: string; displayName: string; rank: number; value: number; breakdown: { exerciseId: string; name: string; value: number }[] };

export default async function RankingPage({ searchParams }: PageProps<"/ranking">) {
  const member = await requireMember();
  const { m, by, part: partParam } = await searchParams;
  const thisMonth = monthOf(todayJst());
  // 未来の月は表示しない
  const month = typeof m === "string" && isValidMonthString(m) && m <= thisMonth ? m : thisMonth;
  const metric: RankingMetric = by === "parts" ? "parts" : "visits";
  const parts = metric === "parts" ? await listPartInfo() : [];
  const part = parts.find((p) => p.id === partParam) ?? parts[0];

  const rows: Row[] =
    metric === "parts" && part
      ? await getMonthlyPartRanking(month, part)
      : (await getMonthlyRanking(month)).map((r) => ({ ...r, value: r.visits, breakdown: [] }));
  // 0の人は順位に出さず、下に名前だけ並べる
  const ranked = rows.filter((r) => r.value > 0);
  const zero = rows.filter((r) => r.value <= 0);
  const unit = metric === "parts" && part?.cardio ? "分" : METRIC_LABEL[metric].unit;
  const href = (mm: string, b: RankingMetric, p = part?.id) => `/ranking?m=${mm}&by=${b}${b === "parts" && p ? `&part=${p}` : ""}`;

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

      {metric === "parts" && (
        <div className="mb-3 flex gap-2 overflow-x-auto px-4 pb-1" aria-label="部位">
          {parts.map((p) => (
            <Link
              key={p.id}
              href={href(month, "parts", p.id)}
              replace
              scroll={false}
              aria-current={p.id === part?.id ? "true" : undefined}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-sm ${
                p.id === part?.id ? "border-accent bg-accent font-semibold text-accent-fg" : "border-border bg-surface"
              }`}
            >
              {p.name}
            </Link>
          ))}
        </div>
      )}

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
        {ranked.length === 0 ? (
          <p className="text-sm text-muted">この月はまだ記録がありません</p>
        ) : (
          <ol className="divide-y divide-border">
            {ranked.map((r) => {
              const row = (
                <>
                  <RankBadge rank={r.rank} />
                  <MemberName userId={r.userId} name={r.displayName} size={32} className="flex-1" />
                  <span className="shrink-0 text-sm">
                    {r.value}
                    {unit}
                  </span>
                </>
              );
              const mine = r.userId === member.id ? "font-semibold" : "";

              // 部位別のときは、タップでその部位でやった種目を開く
              if (metric === "parts" && r.breakdown.length > 0) {
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
                          {r.breakdown.map((e) => (
                            <li key={e.exerciseId}>
                              <Link
                                href={`/exercises/${e.exerciseId}`}
                                className="flex items-center gap-3 px-3 py-2.5 active:bg-bg"
                              >
                                <span className="min-w-0 flex-1 truncate">{e.name}</span>
                                <span className="shrink-0 text-muted">
                                  {e.value}
                                  {unit}
                                </span>
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
                  {metric === "parts" && <span className="w-[0.6rem] shrink-0" aria-hidden />}
                </li>
              );
            })}
          </ol>
        )}
        {zero.length > 0 && (
          <p className="mt-2 border-t border-border pt-2.5 text-xs text-muted">
            まだ0{unit}: {zero.map((r) => r.displayName).join("、")}
          </p>
        )}
        <p className="mt-3 text-xs text-muted">
          {metric === "visits"
            ? "Fit訪問回数はトレーニング記録から数えます。同じ日に3時間以内に付けた記録は1回の来店として数えます（チェックインは数えません）。"
            : part?.cardio
              ? "その月の有酸素の合計時間です。名前をタップすると、種目ごとの時間が見られます。"
              : `その月に${part?.name ?? "その部位"}の種目で記録したセット数です。名前をタップすると、種目ごとのセット数が見られます。自分の種目は数えません。`}
          同じ値の人は同じ順位です。0の人は順位に出しません。
        </p>
      </Section>
    </>
  );
}
