import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMember } from "@/lib/auth/session";
import { getExercise, getMyExerciseHistory } from "@/lib/exercises/queries";
import { formatEntry } from "@/lib/records/format";
import { formatDate } from "@/lib/date";
import { PageHeader, Section } from "@/components/page";
import { ExerciseHistory } from "@/components/exercise-history";

const UUID_RE = /^[0-9a-f-]{36}$/i;

export default async function ActivityExercisePage({ params }: PageProps<"/mypage/activity/[exerciseId]">) {
  const member = await requireMember();
  const { exerciseId } = await params;
  if (!UUID_RE.test(exerciseId)) notFound();
  const exercise = await getExercise(exerciseId);
  if (!exercise) notFound();
  const history = await getMyExerciseHistory(member.id, exercise);
  const latest = history.find((h) => h.value);

  return (
    <>
      <PageHeader title={exercise.name} back="/mypage/activity" />
      <Section title="概要">
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <dt className="text-muted">実施回数</dt>
          <dd className="text-right font-semibold">{history.length}回</dd>
          {latest?.value && (
            <>
              <dt className="text-muted">前回（{formatDate(latest.date, { withWeekday: false })}）</dt>
              <dd className="text-right font-semibold">{formatEntry(exercise.type, latest.value)}</dd>
            </>
          )}
        </dl>
        <Link href={`/exercises/${exercise.id}`} className="mt-3 block text-sm text-accent">
          今月のみんなの記録を見る ›
        </Link>
      </Section>
      <Section title="過去推移">
        <ExerciseHistory type={exercise.type} points={history} />
      </Section>
    </>
  );
}
