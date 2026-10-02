import { requireMember } from "@/lib/auth/session";
import { getMyRecentProgress } from "@/lib/records/queries";
import { PageHeader, Section } from "@/components/page";
import { RecentProgressList } from "../recent-progress";

// 記録したことのある全種目の成長一覧（最近やった順）。タップで種目詳細（今月のみんなの記録）へ
export default async function ProgressListPage() {
  const member = await requireMember();
  const items = await getMyRecentProgress(member.id, Number.POSITIVE_INFINITY);
  return (
    <>
      <PageHeader title="成長一覧" back="/records" />
      {items.length === 0 ? (
        <Section>
          <p className="text-sm text-muted">まだ記録がありません。</p>
        </Section>
      ) : (
        <>
          <RecentProgressList items={items} title={`記録した種目（${items.length}）`} />
          <p className="px-4 text-xs text-muted">種目をタップすると、今月のみんなの記録と自分の成長グラフが見られます。</p>
        </>
      )}
    </>
  );
}
