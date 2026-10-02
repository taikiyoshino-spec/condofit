import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMember } from "@/lib/auth/session";
import { listSchedules, listVisits } from "@/lib/schedule/queries";
import { INTENTION_LABEL, TIME_SLOT_LABEL } from "@/lib/schedule/time-slots";
import { formatDate, isValidDateString, monthOf, todayJst } from "@/lib/date";
import { PageHeader, Section } from "@/components/page";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { TimeSlotIcon } from "@/components/time-slot-icon";
import { CreateSchedule } from "./create-schedule";
import { ParticipantList } from "@/components/participants";
import { DayVisitsSection } from "./day-visits";

export default async function DaySchedulePage({ params }: PageProps<"/schedule/[date]">) {
  const member = await requireMember();
  const { date } = await params;
  if (!isValidDateString(date)) notFound();
  const today = todayJst();
  const isPast = date < today;
  // 今日と過去の日は「行った人」も出す（未来はまだ記録がない）
  const [schedules, visits] = await Promise.all([
    listSchedules(date, date),
    date <= today ? listVisits(date, date) : Promise.resolve(null),
  ]);

  return (
    <>
      <RealtimeRefresh tables={["schedules", "schedule_participants", "training_sessions"]} />
      <PageHeader title={formatDate(date)} back={`/schedule?m=${monthOf(date)}`} />

      {visits && <DayVisitsSection visits={visits.get(date)} isToday={date === today} />}
      {visits && <h2 className="mx-4 mb-2 text-sm font-medium text-muted">予定</h2>}

      {schedules.length === 0 ? (
        <Section>
          <p className="text-sm text-muted">この日の予定はありません</p>
        </Section>
      ) : (
        <ul className="mx-4 mb-4 space-y-2">
          {schedules.map((s) => {
            const mine = s.participants.find((p) => p.userId === member.id);
            const going = s.participants.filter((p) => p.intention === "going");
            const maybe = s.participants.filter((p) => p.intention === "maybe");
            return (
              <li key={s.id}>
                <Link href={`/schedule/s/${s.id}`} className="block rounded-xl border border-border bg-surface p-4">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 font-semibold">
                      <TimeSlotIcon slot={s.timeSlot} label={false} />
                      {TIME_SLOT_LABEL[s.timeSlot]}
                    </span>
                    {mine && (
                      <span className="rounded-full bg-accent px-2 py-0.5 text-xs text-accent-fg">
                        {INTENTION_LABEL[mine.intention]}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted">作成: {s.creatorName}さん</p>
                  <div className="mt-2 space-y-1.5 text-sm">
                    <div className="flex gap-2">
                      <span className="shrink-0 font-medium">行く！</span>
                      <ParticipantList people={going} />
                    </div>
                    {maybe.length > 0 && (
                      <div className="flex gap-2">
                        <span className="shrink-0 font-medium">行けたら行く</span>
                        <ParticipantList people={maybe} />
                      </div>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {isPast ? (
        <p className="px-4 text-xs text-muted">過去の予定は閲覧のみです。</p>
      ) : (
        <Section title="予定を作る">
          <CreateSchedule date={date} />
        </Section>
      )}
    </>
  );
}
