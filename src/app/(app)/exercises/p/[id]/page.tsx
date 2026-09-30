import { notFound } from "next/navigation";
import { requireMember } from "@/lib/auth/session";
import { listBodyParts, listExercises } from "@/lib/exercises/queries";
import { MenuList, PageHeader, Section } from "@/components/page";

export default async function BodyPartPage({ params }: PageProps<"/exercises/p/[id]">) {
  await requireMember();
  const { id } = await params;
  const parts = await listBodyParts();
  const part = parts.find((p) => p.id === id);
  if (!part) notFound();
  const exercises = await listExercises({ bodyPartId: id });

  return (
    <>
      <PageHeader title={part.name} back="/exercises" />
      {exercises.length === 0 ? (
        <Section>
          <p className="text-sm text-muted">この部位の種目はありません</p>
        </Section>
      ) : (
        <MenuList items={exercises.map((e) => ({ href: `/exercises/${e.id}`, label: e.name }))} />
      )}
    </>
  );
}
