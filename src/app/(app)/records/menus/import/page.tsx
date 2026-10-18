import { requireMember } from "@/lib/auth/session";
import { getMyMenu } from "@/lib/menus/queries";
import { getCatalog, getMyExerciseHistory } from "@/lib/records/queries";
import { PageHeader } from "@/components/page";
import { MenuImport } from "./menu-import";

const UUID_RE = /^[0-9a-f-]{36}$/i;

/** AIに相談してメニューを作る・直す（相談文をコピー → AIの答えを貼り付け） */
export default async function MenuImportPage({ searchParams }: PageProps<"/records/menus/import">) {
  const member = await requireMember();
  const { menu: menuId } = await searchParams;
  const [catalog, history, menu] = await Promise.all([
    getCatalog(),
    getMyExerciseHistory(member.id),
    typeof menuId === "string" && UUID_RE.test(menuId) ? getMyMenu(member.id, menuId) : Promise.resolve(null),
  ]);
  // 相談するメニューの種目は、前回の記録も一緒に渡す
  const recent = (menu?.items ?? [])
    .filter((it, i, all) => all.findIndex((x) => x.exerciseId === it.exerciseId) === i)
    .flatMap((it) => (history.lastEntries[it.exerciseId] ? [{ name: it.name, sets: history.lastEntries[it.exerciseId] }] : []));
  return (
    <>
      <PageHeader title={menu ? "AIに相談して直す" : "AIに相談して作る"} back={menu ? `/records/menus/${menu.id}` : "/records/menus"} />
      <MenuImport catalog={catalog} menu={menu} recent={recent} />
    </>
  );
}
