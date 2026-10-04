import { requireMember } from "@/lib/auth/session";
import { defaultPerformedAt, getCatalog, getMyExerciseHistory } from "@/lib/records/queries";
import { PageHeader } from "@/components/page";
import { getMyMenu } from "@/lib/menus/queries";
import { SessionEditor } from "../session-editor";

export default async function NewRecordPage({ searchParams }: PageProps<"/records/new">) {
  const member = await requireMember();
  const { menu: menuId } = await searchParams;
  const [catalog, history, performedAt, menu] = await Promise.all([
    getCatalog(),
    getMyExerciseHistory(member.id),
    defaultPerformedAt(member.id),
    typeof menuId === "string" && /^[0-9a-f-]{36}$/i.test(menuId) ? getMyMenu(member.id, menuId) : Promise.resolve(null),
  ]);
  return (
    <>
      <PageHeader title={menu ? "メニューで記録" : "記録する"} back="/records/start" />
      <SessionEditor
        sessionId={null}
        initialPerformedAt={performedAt}
        initialExercises={[]}
        catalog={catalog}
        recentExerciseIds={history.recent}
        lastEntries={history.lastEntries}
        menu={menu}
      />
    </>
  );
}
