import { Suspense } from "react";
import { requireMember } from "@/lib/auth/session";
import { listActiveCheckIns } from "@/lib/checkin/service";
import { listSchedules } from "@/lib/schedule/queries";
import { getMyMonthStats, getRecentActivity } from "@/lib/home/queries";
import { formatActivity } from "@/lib/home/activity";
import { addDays, todayJst } from "@/lib/date";
import { PageHeader, Section } from "@/components/page";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { FitStatus } from "./fit-status";
import { NextDays } from "./next-days";
import { NotificationBell } from "./notification-bell";
import { RelativeTime } from "./relative-time";

export default async function HomePage() {
  const member = await requireMember();
  const today = todayJst();
  const [active, schedules, stats, activity] = await Promise.all([
    listActiveCheckIns(),
    listSchedules(today, addDays(today, 4)),
    getMyMonthStats(),
    getRecentActivity(),
  ]);

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

      <Section title="最近の活動">
        {activity.length === 0 ? (
          <p className="text-sm text-muted">最近の活動はまだありません</p>
        ) : (
          <ul className="space-y-2.5">
            {activity.map((a, i) => (
              <li key={i} className="flex items-baseline justify-between gap-3 text-sm">
                <span>{formatActivity(a)}</span>
                <RelativeTime iso={a.occurredAt} className="shrink-0 text-xs text-muted" />
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
