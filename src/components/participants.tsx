import { MemberName } from "@/components/avatar";
import { formatTimeJst } from "@/lib/date";
import type { Participant } from "@/lib/schedule/queries";

type Person = Omit<Participant, "departedAt"> & { departedAt?: string | null };

/** 予定の参加者（写真付き・折り返し表示）。「出発します」を押した人には出発した時刻を添える */
export function ParticipantList({ people, size = 22 }: { people: Person[]; size?: number }) {
  if (people.length === 0) return <span className="text-muted">—</span>;
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1.5">
      {people.map((p) => (
        <li key={p.userId} className="flex min-w-0 items-center gap-1">
          <MemberName userId={p.userId} name={p.displayName} size={size} />
          {p.departedAt && (
            <span className="shrink-0 rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-medium text-accent-fg">
              {formatTimeJst(p.departedAt)} 出発
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
