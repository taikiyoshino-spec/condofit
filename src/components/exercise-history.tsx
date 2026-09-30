import Link from "next/link";
import { formatDate } from "@/lib/date";
import { formatEntry, type ExerciseType } from "@/lib/records/format";
import type { HistoryPoint } from "@/lib/exercises/queries";

/** 自分の過去推移（重量系: 重量・回数 / 有酸素: 時間・距離。存在する値のみ） */
export function ExerciseHistory({ type, points }: { type: ExerciseType; points: HistoryPoint[] }) {
  if (points.length === 0) return <p className="text-sm text-muted">まだ記録がありません</p>;
  return (
    <ul className="divide-y divide-border">
      {points.map((p) => (
        <li key={p.sessionId}>
          <Link href={`/records/${p.date}`} className="flex items-baseline justify-between py-2.5 text-sm">
            <span className="text-muted">{formatDate(p.date)}</span>
            <span className="font-medium">{p.value ? formatEntry(type, p.value) : "やった"}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
