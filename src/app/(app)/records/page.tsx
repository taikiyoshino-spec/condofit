import Link from "next/link";
import { requireMember } from "@/lib/auth/session";
import { getMyRecentProgress, listMySessions } from "@/lib/records/queries";
import { jstDateOf } from "@/lib/records/format";
import { formatDate } from "@/lib/date";
import { PageHeader, Section } from "@/components/page";
import { RecentProgressList } from "./recent-progress";

export default async function RecordsPage() {
  const member = await requireMember();
  const [sessions, progress] = await Promise.all([listMySessions(member.id), getMyRecentProgress(member.id)]);

  // 日付ごとにまとめる（同じ日に複数回行った場合も1日として表示）
  const days = new Map<string, { names: string[]; kinds: Set<string> }>();
  for (const s of sessions) {
    const date = jstDateOf(s.performedAt);
    const day = days.get(date) ?? { names: [], kinds: new Set<string>() };
    for (const ex of s.exercises) {
      if (!day.kinds.has(ex.exerciseId)) day.names.push(ex.name);
      day.kinds.add(ex.exerciseId);
    }
    days.set(date, day);
  }

  return (
    <>
      <PageHeader
        title="記録"
        action={
          <Link href="/records/start" className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-fg">
            ＋ 記録する
          </Link>
        }
      />
      <RecentProgressList items={progress} moreHref="/records/progress" />
      {days.size > 0 && <h2 className="mx-4 mb-2 text-sm font-medium text-muted">日付ごと</h2>}
      {days.size === 0 ? (
        <Section>
          <p className="text-sm text-muted">まだ記録がありません。Fitに行ったら「記録する」から残しましょう。</p>
        </Section>
      ) : (
        <ul className="mx-4 mb-4 space-y-2">
          {[...days].map(([date, day]) => (
            <li key={date}>
              <Link href={`/records/${date}`} className="block rounded-xl border border-border bg-surface p-4">
                <div className="flex items-baseline justify-between">
                  <span className="font-semibold">{formatDate(date)}</span>
                  <span className="text-sm text-muted">{day.kinds.size}種目</span>
                </div>
                {day.names.length > 0 ? (
                  <ul className="mt-1 text-sm text-muted">
                    {day.names.map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-sm text-muted">Fitに行った（種目なし）</p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
