import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMember } from "@/lib/auth/session";
import { getMyMenu } from "@/lib/menus/queries";
import { getCatalog, getMyExerciseHistory } from "@/lib/records/queries";
import { PageHeader } from "@/components/page";
import { MenuEditor } from "../menu-editor";

const UUID_RE = /^[0-9a-f-]{36}$/i;

export default async function EditMenuPage({ params }: PageProps<"/records/menus/[id]">) {
  const member = await requireMember();
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const [menu, catalog, history] = await Promise.all([getMyMenu(member.id, id), getCatalog(), getMyExerciseHistory(member.id)]);
  if (!menu) notFound();
  return (
    <>
      <PageHeader title="メニューを編集" back="/records/menus" />
      <div className="mx-4 mb-3">
        <Link href={`/records/menus/import?menu=${menu.id}`} className="text-sm font-medium text-accent">
          AIに相談して直す ›
        </Link>
      </div>
      <MenuEditor menu={menu} catalog={catalog} recentExerciseIds={history.recent} lastEntries={history.lastEntries} />
    </>
  );
}
