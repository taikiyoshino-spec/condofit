import { requireMember } from "@/lib/auth/session";
import { defaultPerformedAt, getCatalog, getMyExerciseHistory } from "@/lib/records/queries";
import { PageHeader } from "@/components/page";
import { SessionEditor } from "../session-editor";

export default async function NewRecordPage() {
  const member = await requireMember();
  const [catalog, history, performedAt] = await Promise.all([
    getCatalog(),
    getMyExerciseHistory(member.id),
    defaultPerformedAt(member.id),
  ]);
  return (
    <>
      <PageHeader title="記録する" back="/records" />
      <SessionEditor
        sessionId={null}
        initialPerformedAt={performedAt}
        initialExercises={[]}
        catalog={catalog}
        recentExerciseIds={history.recent}
        lastEntries={history.lastEntries}
      />
    </>
  );
}
