import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMember } from "@/lib/auth/session";
import { listSchedules } from "@/lib/schedule/queries";
import { INTENTION_LABEL, TIME_SLOT_LABEL } from "@/lib/schedule/time-slots";
import { formatDate, isValidDateString, monthOf, todayJst } from "@/lib/date";
import { PageHeader, Section } from "@/components/page";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { TimeSlotIcon } from "@/components/time-slot-icon";
import { CreateSchedule } from "./create-schedule";

export default async function DaySchedulePage({ params }: PageProps<"/schedule/[date]">) {
  const member = await requireMember();
  const { date } = await params;
  if (!isValidDateString(date)) notFound();
  const schedules = await listSchedules(date, date);
  const isPast = date < todayJst();

  return (
    <>
      <RealtimeRefresh tables={["schedules", "schedule_participants"]} />
      <PageHeader title={formatDate(date)} back={`/schedule?m=${monthOf(date)}`} />

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
                  <p className="mt-2 text-sm">
                    <span className="font-medium">行く！</span> {going.map((p) => p.displayName).join("、") || "—"}
                  </p>
                  {maybe.length > 0 && (
                    <p className="text-sm">
                      <span className="font-medium">行けたら行く</span> {maybe.map((p) => p.displayName).join("、")}
                    </p>
                  )}
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
