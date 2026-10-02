import { ParticipantList } from "@/components/participants";
import { TimeSlotIcon } from "@/components/time-slot-icon";
import { TIME_SLOT_LABEL, TIME_SLOTS } from "@/lib/schedule/time-slots";
import type { DayVisits } from "@/lib/schedule/visits";

/** その日にFitに行った人（時間帯と名前だけ。種目・重量などは出さない） */
export function DayVisitsSection({ visits, isToday }: { visits: DayVisits | undefined; isToday: boolean }) {
  const slots = TIME_SLOTS.filter((s) => (visits?.[s].length ?? 0) > 0);
  return (
    <section className="mx-4 mb-4 rounded-xl border border-border bg-surface p-4">
      <h2 className="mb-3 font-semibold">{isToday ? "今日Fitに行った人" : "Fitに行った人"}</h2>
      {slots.length === 0 ? (
        <p className="text-sm text-muted">{isToday ? "まだ記録はありません" : "この日の記録はありません"}</p>
      ) : (
        <ul className="space-y-3">
          {slots.map((slot) => (
            <li key={slot} className="flex gap-3 text-sm">
              <span className="flex w-10 shrink-0 items-center gap-1 font-medium">
                <TimeSlotIcon slot={slot} label={false} className="h-4 w-4" />
                {TIME_SLOT_LABEL[slot]}
              </span>
              <ParticipantList people={visits![slot].map((p) => ({ ...p, intention: "going" as const }))} size={24} />
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-muted">トレーニング記録の時刻から、朝（4〜11時）・昼（11〜15時）・夕（15〜18時）・夜（18〜翌4時）に分けています。</p>
    </section>
  );
}
