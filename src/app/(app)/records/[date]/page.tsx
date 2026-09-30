import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMember } from "@/lib/auth/session";
import { listMySessionsOn } from "@/lib/records/queries";
import { formatEntry, jstTimeOf } from "@/lib/records/format";
import { formatDate, isValidDateString } from "@/lib/date";
import { PageHeader, Section } from "@/components/page";
import { DeleteSession } from "./delete-session";

export default async function RecordDayPage({ params }: PageProps<"/records/[date]">) {
  const member = await requireMember();
  const { date } = await params;
  if (!isValidDateString(date)) notFound();
  const sessions = await listMySessionsOn(member.id, date);

  return (
    <>
      <PageHeader title={formatDate(date)} back="/records" />
      {sessions.length === 0 && (
        <Section>
          <p className="text-sm text-muted">この日の記録はありません</p>
        </Section>
      )}
      {sessions.map((s) => (
        <Section key={s.id}>
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm text-muted">{jstTimeOf(s.performedAt)}</span>
            <Link href={`/records/s/${s.id}/edit`} className="text-sm font-medium text-accent">
              編集
            </Link>
          </div>
          {s.exercises.length === 0 ? (
            <p className="text-sm text-muted">Fitに行った（種目なし）</p>
          ) : (
            <ul className="space-y-3">
              {s.exercises.map((ex, i) => {
                const lines = ex.entries.map((e) => formatEntry(ex.type, e)).filter((l): l is string => l !== null);
                return (
                  <li key={i}>
                    <p className="font-medium">{ex.name}</p>
                    {lines.length > 0 ? (
                      <ul className="ml-3 text-sm">
                        {lines.map((l, j) => (
                          <li key={j}>{l}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="ml-3 text-sm text-muted">やった</p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <DeleteSession sessionId={s.id} />
        </Section>
      ))}
    </>
  );
}
