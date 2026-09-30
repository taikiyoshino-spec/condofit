import { requireAdmin } from "@/lib/auth/session";
import { listBodyParts, listExercises } from "@/lib/exercises/queries";
import { PageHeader } from "@/components/page";
import { MasterEditor } from "./master-editor";

export default async function AdminExercisesPage() {
  await requireAdmin();
  const [parts, exercises] = await Promise.all([
    listBodyParts({ includeHidden: true }),
    listExercises({ includeHidden: true }),
  ]);
  return (
    <>
      <PageHeader title="種目マスタ" back="/admin" />
      <p className="px-4 pb-3 text-xs text-muted">
        記録のある種目は削除せず「非表示」にします。非表示にしても過去の記録はそのまま残ります。
      </p>
      <MasterEditor parts={parts} exercises={exercises} />
    </>
  );
}
