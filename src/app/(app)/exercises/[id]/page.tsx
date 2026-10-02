import { notFound } from "next/navigation";
import { requireMember } from "@/lib/auth/session";
import { getExercise, getMonthRepresentatives, getMyExerciseHistory } from "@/lib/exercises/queries";
import { formatEntry } from "@/lib/records/format";
import { PageHeader, Section } from "@/components/page";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { ExerciseHistory } from "@/components/exercise-history";
import { ProgressChart } from "@/components/progress-chart";
import { MemberName } from "@/components/avatar";
import { RankBadge } from "@/components/rank-badge";

const UUID_RE = /^[0-9a-f-]{36}$/i;

export default async function ExerciseDetailPage({ params }: PageProps<"/exercises/[id]">) {
  const member = await requireMember();
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const exercise = await getExercise(id);
  if (!exercise) notFound();
  const [members, history] = await Promise.all([getMonthRepresentatives(exercise), getMyExerciseHistory(member.id, exercise)]);

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
              <li key={m.userId} className="flex items-center gap-3 py-2.5 text-sm">
                <RankBadge rank={m.rank} />
                <MemberName userId={m.userId} name={m.displayName} size={26} className={`flex-1 ${m.userId === member.id ? "font-medium" : ""}`} />
                <span>{formatEntry(exercise.type, m.value) ?? "やった"}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-muted">
          {exercise.type === "weight" ? "今月の最大重量と、その重量での回数です。重い順（同じ重さなら回数の多い順）に並べています。" : "今月いちばん長くやった回の合計時間と距離です。時間の長い順（同じなら距離の長い順）に並べています。"}
        </p>
      </Section>

      <Section title="自分の推移">
        <ProgressChart type={exercise.type} sessions={history.map((h) => ({ date: h.date, entries: h.entries }))} />
        <h3 className="mb-1 mt-5 text-sm font-medium text-muted">記録の一覧</h3>
        <ExerciseHistory type={exercise.type} points={history} />
      </Section>
    </>
  );
}
