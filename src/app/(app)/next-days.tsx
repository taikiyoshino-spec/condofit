import Link from "next/link";
import { addDays, formatDate, weekday, weekdayLabel } from "@/lib/date";
import type { Schedule } from "@/lib/schedule/queries";
import { TimeSlotIcon } from "@/components/time-slot-icon";

const MAX_ICONS = 2;

/** 今後5日（今日を含む）。時間帯は文字を使わずアイコンで表す */
export function NextDays({ today, schedules, myId }: { today: string; schedules: Schedule[]; myId: string }) {
  const days = Array.from({ length: 5 }, (_, i) => addDays(today, i));
  return (
    <section className="mx-4 mb-4 rounded-xl border border-border bg-surface p-3" aria-label="今後5日の予定">
      <div className="mb-2 flex items-center justify-between px-1">
        <h2 className="font-semibold">今後5日</h2>
        <Link href="/schedule" className="text-sm text-muted">カレンダー ›</Link>
      </div>
      <ol className="grid grid-cols-5 gap-1.5">
        {days.map((date) => {
          const list = schedules.filter((s) => s.date === date);
          const mine = list.some((s) => s.participants.some((p) => p.userId === myId));
          const wd = weekday(date);
          const label = `${formatDate(date)} ${list.length ? `予定${list.length}件` : "予定なし"}`;
          return (
            <li key={date}>
              <Link
                href={`/schedule/${date}`}
                aria-label={label}
                className={`flex h-24 flex-col items-center rounded-lg border px-1 pt-1.5 ${
                  mine ? "border-accent" : "border-border"
                } ${date === today ? "bg-bg" : ""}`}
              >
                <span className={`text-[11px] ${wd === 0 ? "text-danger" : wd === 6 ? "text-[#2563eb]" : "text-muted"}`}>
                  {date === today ? "今日" : weekdayLabel(date)}
                </span>
                <span className="text-sm font-semibold">{formatDate(date, { withWeekday: false })}</span>
                <span className="mt-1 flex flex-col items-center gap-0.5" aria-hidden>
                  {list.slice(0, MAX_ICONS).map((s) => (
                    <TimeSlotIcon key={s.id} slot={s.timeSlot} label={false} className="h-4 w-4" />
                  ))}
                  {list.length > MAX_ICONS && (
                    <span className="text-[10px] leading-none text-muted">+{list.length - MAX_ICONS}</span>
                  )}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
