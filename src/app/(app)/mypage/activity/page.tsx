import Link from "next/link";
import { requireMember } from "@/lib/auth/session";
import { getMyActivitySummary } from "@/lib/exercises/queries";
import { formatDate } from "@/lib/date";
import { PageHeader, Section } from "@/components/page";

export default async function ActivityPage() {
  const member = await requireMember();
  const summary = await getMyActivitySummary(member.id);
  const rows = [
    { label: "Fit訪問", unit: "回", month: summary.month.visits, total: summary.total.visits },
    { label: "トレーニング日数", unit: "日", month: summary.month.trainingDays, total: summary.total.trainingDays },
    { label: "種目数", unit: "種", month: summary.month.exerciseKinds, total: summary.total.exerciseKinds },
  ];

  return (
    <>
      <PageHeader title="個人活動" back="/mypage" />
      <Section title="サマリー">
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
                <td className="py-2 text-right font-semibold">{r.month}{r.unit}</td>
                <td className="py-2 text-right font-semibold">{r.total}{r.unit}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-muted">Fit訪問はトレーニング記録の数です（チェックインは数えません）。</p>
      </Section>

      <Section title="種目別">
        {summary.byExercise.length === 0 ? (
          <p className="text-sm text-muted">まだ記録がありません</p>
        ) : (
          <ul className="divide-y divide-border">
            {summary.byExercise.map((e) => (
              <li key={e.exerciseId}>
                <Link href={`/mypage/activity/${e.exerciseId}`} className="flex items-center justify-between py-3">
                  <span>
                    <span className="block">{e.name}</span>
                    <span className="block text-xs text-muted">最終 {formatDate(e.lastDate)}</span>
                  </span>
                  <span className="text-sm">
                    {e.count}回 <span className="text-muted" aria-hidden>›</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
