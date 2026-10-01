import { Suspense } from "react";
import Link from "next/link";
import { requireMember } from "@/lib/auth/session";
import { listActiveCheckIns } from "@/lib/checkin/service";
import { listSchedules } from "@/lib/schedule/queries";
import { getMyMonthStats, getRecentActivity } from "@/lib/home/queries";
import { formatActivity } from "@/lib/home/activity";
import { getMonthlyRanking } from "@/lib/ranking-queries";
import { addDays, monthOf, todayJst } from "@/lib/date";
import { PageHeader, Section } from "@/components/page";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { Avatar, MemberName } from "@/components/avatar";
import { RankBadge } from "@/components/rank-badge";
import { FitStatus } from "./fit-status";
import { NextDays } from "./next-days";
import { NotificationBell } from "./notification-bell";
import { RelativeTime } from "./relative-time";

export default async function HomePage() {
  const member = await requireMember();
  const today = todayJst();
  const [active, schedules, stats, activity, ranking] = await Promise.all([
    listActiveCheckIns(),
    listSchedules(today, addDays(today, 4)),
    getMyMonthStats(),
    getRecentActivity(),
    getMonthlyRanking(monthOf(today), "visits"),
  ]);
  const top = ranking.filter((r) => r.visits > 0).slice(0, 3);

  return (
    <>
      <RealtimeRefresh tables={["schedules", "schedule_participants", "training_sessions"]} />
      <PageHeader title="CondoFit" action={<NotificationBell myId={member.id} />} />

      <Suspense>
        <FitStatus initial={active} myId={member.id} />
      </Suspense>

      <NextDays today={today} schedules={schedules} myId={member.id} />

      <Section title="今月の活動">
        <dl className="grid grid-cols-3 text-center">
          {[
            { label: "Fit", value: stats.visits, unit: "回" },
            { label: "トレーニング日数", value: stats.trainingDays, unit: "日" },
            { label: "種目", value: stats.exerciseKinds, unit: "種" },
          ].map((s) => (
            <div key={s.label}>
              <dt className="text-xs text-muted">{s.label}</dt>
              <dd className="text-xl font-bold">
                {s.value}
                <span className="ml-0.5 text-sm font-normal">{s.unit}</span>
              </dd>
            </div>
          ))}
        </dl>
      </Section>

      <section className="mx-4 mb-4 rounded-xl border border-border bg-surface p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">今月のランキング</h2>
          <Link href="/ranking" className="text-sm text-muted">すべて見る ›</Link>
        </div>
        {top.length === 0 ? (
          <p className="text-sm text-muted">今月はまだ記録がありません</p>
        ) : (
          <ol className="space-y-2">
            {top.map((r) => (
              <li key={r.userId} className={`flex items-center gap-3 text-sm ${r.userId === member.id ? "font-semibold" : ""}`}>
                <RankBadge rank={r.rank} />
                <MemberName userId={r.userId} name={r.displayName} size={28} className="flex-1" />
                <span className="shrink-0">Fit {r.visits}回</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <Section title="最近の活動">
        {activity.length === 0 ? (
          <p className="text-sm text-muted">最近の活動はまだありません</p>
        ) : (
          <ul className="space-y-2.5">
            {activity.map((a, i) => (
              <li key={i} className="flex items-center justify-between gap-3 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  {a.actorUserId && <Avatar userId={a.actorUserId} name={a.displayName} size={26} />}
                  <span>{formatActivity(a)}</span>
                </span>
                <RelativeTime iso={a.occurredAt} className="shrink-0 text-xs text-muted" />
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
