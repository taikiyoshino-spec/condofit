import { MemberName } from "@/components/avatar";
import type { Participant } from "@/lib/schedule/queries";

/** 予定の参加者（写真付き・折り返し表示） */
export function ParticipantList({ people, size = 22 }: { people: Participant[]; size?: number }) {
  if (people.length === 0) return <span className="text-muted">—</span>;
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1.5">
      {people.map((p) => (
        <li key={p.userId} className="min-w-0">
          <MemberName userId={p.userId} name={p.displayName} size={size} />
        </li>
      ))}
    </ul>
  );
}
