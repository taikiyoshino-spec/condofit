import Link from "next/link";
import { requireMember } from "@/lib/auth/session";
import { listSchedules, listVisits } from "@/lib/schedule/queries";
import { peopleOfDay, type DayVisits } from "@/lib/schedule/visits";
import { addMonths, formatMonth, isValidMonthString, monthGrid, monthOf, monthRange, todayJst } from "@/lib/date";
import { PageHeader } from "@/components/page";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { Avatar } from "@/components/avatar";

const WEEK_HEADER = ["日", "月", "火", "水", "木", "金", "土"];

export default async function SchedulePage({ searchParams }: PageProps<"/schedule">) {
  const member = await requireMember();
  const { m } = await searchParams;
  const today = todayJst();
  const month = typeof m === "string" && isValidMonthString(m) ? m : monthOf(today);
  const { start, end } = monthRange(month);
  // 予定は月全体、行った人（トレーニング記録）は今日まで
  const [schedules, visits] = await Promise.all([
    listSchedules(start, end),
    start <= today ? listVisits(start, end < today ? end : today) : Promise.resolve(new Map<string, DayVisits>()),
  ]);

  const byDate = new Map<string, { count: number; mine: boolean }>();
  for (const s of schedules) {
    const cur = byDate.get(s.date) ?? { count: 0, mine: false };
    cur.count++;
    cur.mine ||= s.participants.some((p) => p.userId === member.id);
    byDate.set(s.date, cur);
  }

  return (
    <>
      <RealtimeRefresh tables={["schedules", "schedule_participants", "training_sessions"]} />
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
                  const went = peopleOfDay(visits.get(date));
                  const label = [date, info ? `予定${info.count}件` : "", went.length ? `${went.length}人がFitに行った` : ""]
                    .filter(Boolean)
                    .join(" ");
                  return (
                    <td key={date} className="p-0.5">
                      <Link
                        href={`/schedule/${date}`}
                        aria-label={label}
                        aria-current={isToday ? "date" : undefined}
                        className={`flex h-14 flex-col items-center justify-start rounded-lg pt-1 text-sm ${
                          isToday ? "bg-accent font-bold text-accent-fg" : isPast ? "text-muted" : ""
                        }`}
                      >
                        <span className="flex items-center gap-0.5">
                          {Number(date.slice(8))}
                          {info && (
                            <span
                              aria-hidden
                              className={`h-1.5 w-1.5 rounded-full ${isToday ? "bg-accent-fg" : info.mine ? "bg-accent" : "bg-muted"}`}
                            />
                          )}
                        </span>
                        {went.length > 0 && (
                          // マスが狭いので2人までは写真、3人以上は1人＋「+N」
                          <span aria-hidden className="mt-1 flex items-center -space-x-1">
                            {went.slice(0, went.length > 2 ? 1 : 2).map((p) => (
                              <Avatar
                                key={p.userId}
                                userId={p.userId}
                                name={p.displayName}
                                size={16}
                                className={isToday ? "ring-2 ring-white" : "ring-1 ring-surface"}
                              />
                            ))}
                            {went.length > 2 && <span className="pl-1.5 text-[10px] font-semibold leading-none">+{went.length - 1}</span>}
                          </span>
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
      <p className="px-4 pt-3 text-xs text-muted">
        日付をタップすると詳細を見られます。点は予定（緑は自分が参加）、写真はその日にFitに行った人です。
      </p>
    </>
  );
}
