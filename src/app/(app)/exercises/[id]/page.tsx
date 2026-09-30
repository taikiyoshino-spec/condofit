import { notFound } from "next/navigation";
import { requireMember } from "@/lib/auth/session";
import { getExercise, getMonthRepresentatives, getMyExerciseHistory } from "@/lib/exercises/queries";
import { formatEntry } from "@/lib/records/format";
import { PageHeader, Section } from "@/components/page";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { ExerciseHistory } from "@/components/exercise-history";
import { MemberName } from "@/components/avatar";

const UUID_RE = /^[0-9a-f-]{36}$/i;

export default async function ExerciseDetailPage({ params }: PageProps<"/exercises/[id]">) {
  const member = await requireMember();
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const exercise = await getExercise(id);
  if (!exercise) notFound();
  const [members, history] = await Promise.all([getMonthRepresentatives(id), getMyExerciseHistory(member.id, exercise)]);

  return (
    <>
      <RealtimeRefresh tables={["training_sessions"]} />
      <PageHeader title={exercise.name} back={`/exercises/p/${exercise.bodyPartId}`} />
      <p className="px-4 pb-3 text-xs text-muted">
        {exercise.bodyPartName}・{exercise.type === "weight" ? "重量系" : "有酸素"}
        {!exercise.active && "（現在は非表示の種目です）"}
      </p>

      <Section title="今月">
        {members.length === 0 ? (
          <p className="text-sm text-muted">今月はまだ誰も記録していません</p>
        ) : (
          <ul className="divide-y divide-border">
            {members.map((m) => (
              <li key={m.userId} className="flex items-baseline justify-between py-2.5 text-sm">
                <MemberName userId={m.userId} name={m.displayName} size={26} className={m.userId === member.id ? "font-medium" : ""} />
                <span>{formatEntry(exercise.type, m.value) ?? "やった"}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-muted">
          {exercise.type === "weight" ? "その月の最大重量と、その重量での回数です。" : "その月で一番長く・遠くやった回の合計時間と距離です。"}
        </p>
      </Section>

      <Section title="自分の推移">
        <ExerciseHistory type={exercise.type} points={history} />
      </Section>
    </>
  );
}
