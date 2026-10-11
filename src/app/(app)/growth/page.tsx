import Link from "next/link";
import { requireMember } from "@/lib/auth/session";
import { getMyRecentProgress } from "@/lib/records/queries";
import { getMyActivitySummary } from "@/lib/exercises/queries";
import { PageHeader, Section } from "@/components/page";
import { RecentProgressList } from "../records/recent-progress";

/** 成長タブ: 自分の活動サマリーと全種目の成長一覧。種目をタップすると成長グラフと過去の記録へ */
export default async function GrowthPage() {
  const member = await requireMember();
  const [summary, items] = await Promise.all([
    getMyActivitySummary(member.id),
    getMyRecentProgress(member.id, Number.POSITIVE_INFINITY),
  ]);
  const rows = [
    { label: "Fit訪問", unit: "回", month: summary.month.visits, total: summary.total.visits },
    { label: "トレーニング日数", unit: "日", month: summary.month.trainingDays, total: summary.total.trainingDays },
    { label: "種目数", unit: "種", month: summary.month.exerciseKinds, total: summary.total.exerciseKinds },
  ];

  return (
    <>
      <PageHeader title="成長" />
      <Section>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-muted">
              <th className="pb-2 text-left font-normal" />
              <th className="pb-2 text-right font-normal">今月</th>
              <th className="pb-2 text-right font-normal">これまで</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-t border-border">
                <th className="py-2 text-left font-normal">{r.label}</th>
                <td className="py-2 text-right font-semibold">
                  {r.month}
                  {r.unit}
                </td>
                <td className="py-2 text-right font-semibold">
                  {r.total}
                  {r.unit}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {items.length === 0 ? (
        <Section>
          <p className="text-sm text-muted">記録すると、ここに種目ごとの成長が並びます。</p>
        </Section>
      ) : (
        <RecentProgressList items={items} title={`種目ごとの成長（${items.length}）`} />
      )}
      <p className="px-4 text-xs text-muted">種目をタップすると、成長グラフと過去の記録が見られます。</p>

      <div className="mx-4 mt-4">
        <Link href="/exercises" className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3.5">
          <span>みんなの種目別の記録</span>
          <span className="text-muted" aria-hidden>
            ›
          </span>
        </Link>
      </div>
    </>
  );
}
