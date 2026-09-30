import { notFound } from "next/navigation";
import { requireMember } from "@/lib/auth/session";
import { getSchedule } from "@/lib/schedule/queries";
import { TIME_SLOT_LABEL } from "@/lib/schedule/time-slots";
import { formatDate, todayJst } from "@/lib/date";
import { PageHeader, Section } from "@/components/page";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { TimeSlotIcon } from "@/components/time-slot-icon";
import { CreatorControls, IntentionControl } from "./controls";

const UUID_RE = /^[0-9a-f-]{36}$/i;

export default async function ScheduleDetailPage({ params }: PageProps<"/schedule/s/[id]">) {
  const member = await requireMember();
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const schedule = await getSchedule(id);
  if (!schedule) notFound();

  const today = todayJst();
  const isPast = schedule.date < today;
  const back = `/schedule/${schedule.date}`;

  if (schedule.deletedAt) {
    return (
      <>
        <PageHeader title="予定" back={back} />
        <Section>
          <p className="text-sm">
            {schedule.creatorName}さんの {formatDate(schedule.date)} {TIME_SLOT_LABEL[schedule.timeSlot]} の予定は削除されました。
          </p>
        </Section>
      </>
    );
  }

  const going = schedule.participants.filter((p) => p.intention === "going");
  const maybe = schedule.participants.filter((p) => p.intention === "maybe");
  const mine = schedule.participants.find((p) => p.userId === member.id)?.intention ?? null;
  const isCreator = schedule.creatorId === member.id;

  return (
    <>
      <RealtimeRefresh tables={["schedules", "schedule_participants"]} />
      <PageHeader title="予定" back={back} />
      <Section>
        <div className="flex items-center gap-2 text-lg font-semibold">
          <TimeSlotIcon slot={schedule.timeSlot} label={false} className="h-6 w-6" />
          {formatDate(schedule.date)} {TIME_SLOT_LABEL[schedule.timeSlot]}
        </div>
        <p className="mt-1 text-sm text-muted">作成: {schedule.creatorName}さん</p>
      </Section>

      <Section title="参加">
        <dl className="space-y-2 text-sm">
          <div>
            <dt className="font-medium">行く！（{going.length}人）</dt>
            <dd className="text-muted">{going.map((p) => p.displayName).join("、") || "—"}</dd>
          </div>
          <div>
            <dt className="font-medium">行けたら行く（{maybe.length}人）</dt>
            <dd className="text-muted">{maybe.map((p) => p.displayName).join("、") || "—"}</dd>
          </div>
        </dl>
      </Section>

      {isPast ? (
        <p className="px-4 text-xs text-muted">過去の予定のため、参加意思の変更・編集はできません。</p>
      ) : (
        <>
          <Section title="自分の参加意思">
            <IntentionControl scheduleId={schedule.id} current={mine} />
          </Section>
          {isCreator && (
            <Section title="予定の編集">
              <CreatorControls
                scheduleId={schedule.id}
                date={schedule.date}
                timeSlot={schedule.timeSlot}
                minDate={today}
                hasOthers={schedule.participants.some((p) => p.userId !== member.id)}
              />
            </Section>
          )}
        </>
      )}
    </>
  );
}
