import Link from "next/link";
import { requireMember } from "@/lib/auth/session";
import { listSchedules } from "@/lib/schedule/queries";
import { addMonths, formatMonth, isValidMonthString, monthGrid, monthOf, monthRange, todayJst } from "@/lib/date";
import { PageHeader } from "@/components/page";
import { RealtimeRefresh } from "@/components/realtime-refresh";

const WEEK_HEADER = ["日", "月", "火", "水", "木", "金", "土"];

export default async function SchedulePage({ searchParams }: PageProps<"/schedule">) {
  const member = await requireMember();
  const { m } = await searchParams;
  const today = todayJst();
  const month = typeof m === "string" && isValidMonthString(m) ? m : monthOf(today);
  const { start, end } = monthRange(month);
  const schedules = await listSchedules(start, end);

  const byDate = new Map<string, { count: number; mine: boolean }>();
  for (const s of schedules) {
    const cur = byDate.get(s.date) ?? { count: 0, mine: false };
    cur.count++;
    cur.mine ||= s.participants.some((p) => p.userId === member.id);
    byDate.set(s.date, cur);
  }

  return (
    <>
      <RealtimeRefresh tables={["schedules", "schedule_participants"]} />
      <PageHeader title="予定" />
      <div className="mx-4 rounded-xl border border-border bg-surface p-3">
        <div className="mb-2 flex items-center justify-between">
          <Link href={`/schedule?m=${addMonths(month, -1)}`} className="rounded px-3 py-1 text-muted" aria-label="前の月">‹</Link>
          <h2 className="font-semibold">{formatMonth(month)}</h2>
          <Link href={`/schedule?m=${addMonths(month, 1)}`} className="rounded px-3 py-1 text-muted" aria-label="次の月">›</Link>
        </div>
        <table className="w-full table-fixed text-center">
          <thead>
            <tr>
              {WEEK_HEADER.map((w, i) => (
                <th key={w} className={`pb-1 text-xs font-normal ${i === 0 ? "text-danger" : i === 6 ? "text-[#2563eb]" : "text-muted"}`}>{w}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {monthGrid(month).map((week, wi) => (
              <tr key={wi}>
                {week.map((date, di) => {
                  if (!date) return <td key={di} />;
                  const info = byDate.get(date);
                  const isToday = date === today;
                  const isPast = date < today;
                  return (
                    <td key={date} className="p-0.5">
                      <Link
                        href={`/schedule/${date}`}
                        aria-label={`${date}${info ? ` 予定${info.count}件` : ""}`}
                        aria-current={isToday ? "date" : undefined}
                        className={`flex h-12 flex-col items-center justify-start rounded-lg pt-1 text-sm ${
                          isToday ? "bg-accent font-bold text-accent-fg" : isPast ? "text-muted" : ""
                        }`}
                      >
                        {Number(date.slice(8))}
                        {info && (
                          <span
                            aria-hidden
                            className={`mt-1 h-1.5 w-1.5 rounded-full ${isToday ? "bg-accent-fg" : info.mine ? "bg-accent" : "bg-muted"}`}
                          />
                        )}
                      </Link>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {month !== monthOf(today) && (
          <div className="mt-2 text-center">
            <Link href="/schedule" className="text-sm text-accent">今月に戻る</Link>
          </div>
        )}
      </div>
      <p className="px-4 pt-3 text-xs text-muted">日付をタップすると予定を見られます。緑の点は自分が参加している予定です。</p>
    </>
  );
}
