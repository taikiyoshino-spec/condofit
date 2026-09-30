import { Suspense } from "react";
import { requireMember } from "@/lib/auth/session";
import { listActiveCheckIns } from "@/lib/checkin/service";
import { PageHeader, Section } from "@/components/page";
import { FitStatus } from "./fit-status";

export default async function HomePage() {
  const [member, active] = await Promise.all([requireMember(), listActiveCheckIns()]);
  return (
    <>
      <PageHeader title="ホーム" />
      <Suspense>
        <FitStatus initial={active} myId={member.id} />
      </Suspense>
      {/* 今後5日の予定・今月の自分・最近の活動・通知アイコンは次の段階で実装 */}
      <Section>
        <p className="text-sm text-muted">予定・今月の活動・最近の活動は準備中です。</p>
      </Section>
    </>
  );
}
