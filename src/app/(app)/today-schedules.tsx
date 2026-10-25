import Link from "next/link";
import { formatTimeJst } from "@/lib/date";
import type { Schedule } from "@/lib/schedule/queries";
import { TIME_SLOT_LABEL } from "@/lib/schedule/time-slots";
import { ParticipantList } from "@/components/participants";
import { TimeSlotIcon } from "@/components/time-slot-icon";
import { DepartButton } from "./schedule/depart-button";

/** ホーム: 今日の自分の予定と「出発します」（チェックイン中は出さない） */
export function TodaySchedules({ schedules, myId }: { schedules: Schedule[]; myId: string }) {
  if (schedules.length === 0) return null;
  return (
    <>
      {schedules.map((s) => {
        const me = s.participants.find((p) => p.userId === myId);
        const others = s.participants.filter((p) => p.userId !== myId);
        return (
          <section key={s.id} className="mx-4 mb-4 rounded-xl border border-accent bg-surface p-4" aria-label="今日の予定">
            <Link href={`/schedule/s/${s.id}`} className="flex items-center gap-2 font-semibold">
              <TimeSlotIcon slot={s.timeSlot} label={false} className="h-5 w-5" />
              今日の予定（{TIME_SLOT_LABEL[s.timeSlot]}）
              <span className="ml-auto text-sm font-normal text-muted" aria-hidden>
                ›
              </span>
            </Link>
            {others.length > 0 && (
              <div className="mt-2 text-sm">
                <ParticipantList people={others} size={22} />
              </div>
            )}
            <div className="mt-3">
              <DepartButton
                scheduleId={s.id}
                others={others.map((p) => p.displayName)}
                departedLabel={me?.departedAt ? formatTimeJst(me.departedAt) : null}
              />
            </div>
          </section>
        );
      })}
    </>
  );
}
