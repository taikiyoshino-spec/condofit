import { requireMember } from "@/lib/auth/session";
import { listBodyParts, listExercises } from "@/lib/exercises/queries";
import { MenuList, PageHeader } from "@/components/page";

export default async function ExercisesPage() {
  await requireMember();
  const [parts, exercises] = await Promise.all([listBodyParts(), listExercises()]);
  const counts = new Map<string, number>();
  for (const e of exercises) counts.set(e.bodyPartId, (counts.get(e.bodyPartId) ?? 0) + 1);

  return (
    <>
      <PageHeader title="種目" />
      <p className="px-4 pb-3 text-sm text-muted">種目ごとに、今月みんながどのくらいやっているかを見られます。</p>
      <MenuList
        items={parts.map((p) => ({ href: `/exercises/p/${p.id}`, label: `${p.name}（${counts.get(p.id) ?? 0}）` }))}
      />
    </>
  );
}
