import { notFound } from "next/navigation";
import { requireMember } from "@/lib/auth/session";
import { getCatalog, getMyExerciseHistory, getSession } from "@/lib/records/queries";
import { jstDateOf } from "@/lib/records/format";
import { PageHeader } from "@/components/page";
import { SessionEditor } from "../../../session-editor";

const UUID_RE = /^[0-9a-f-]{36}$/i;

export default async function EditRecordPage({ params }: PageProps<"/records/s/[id]/edit">) {
  const member = await requireMember();
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const session = await getSession(id);
  // 他人の記録は編集させない（DB側でも更新は拒否される）
  if (!session || session.userId !== member.id) notFound();

  const [catalog, history] = await Promise.all([getCatalog(), getMyExerciseHistory(member.id, id)]);
  return (
    <>
      <PageHeader title="記録を編集" back={`/records/${jstDateOf(session.performedAt)}`} />
      <SessionEditor
        sessionId={session.id}
        initialPerformedAt={session.performedAt}
        initialExercises={session.exercises}
        catalog={catalog}
        recentExerciseIds={history.recent}
        lastEntries={history.lastEntries}
      />
    </>
  );
}
