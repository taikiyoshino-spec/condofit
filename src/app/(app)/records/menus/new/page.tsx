import { requireMember } from "@/lib/auth/session";
import { getCatalog, getMyExerciseHistory } from "@/lib/records/queries";
import { PageHeader } from "@/components/page";
import { MenuEditor } from "../menu-editor";

export default async function NewMenuPage() {
  const member = await requireMember();
  const [catalog, history] = await Promise.all([getCatalog(), getMyExerciseHistory(member.id)]);
  return (
    <>
      <PageHeader title="メニューを作る" back="/records/menus" />
      <MenuEditor menu={null} catalog={catalog} recentExerciseIds={history.recent} lastEntries={history.lastEntries} />
    </>
  );
}
