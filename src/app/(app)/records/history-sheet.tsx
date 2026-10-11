"use client";

import { BottomSheet } from "@/components/bottom-sheet";
import { formatDate } from "@/lib/date";
import { formatEntry } from "@/lib/records/format";
import type { ExerciseHistoryResult } from "@/app/actions/records";

/** 記録の入力中に、その種目の最近の記録と自己ベストを見るシート（入力中の内容はそのまま） */
export function HistorySheet({
  name,
  data,
  onClose,
}: {
  name: string | null;
  data: ExerciseHistoryResult | null;
  onClose: () => void;
}) {
  return (
    <BottomSheet open={name !== null} onClose={onClose} title={`${name ?? ""}の履歴`}>
      {!data ? (
        <p className="py-6 text-center text-sm text-muted">読み込み中…</p>
      ) : !data.ok || data.sessions.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">まだ記録がありません</p>
      ) : (
        <>
          {data.best && (
            <p className="mb-3 rounded-lg bg-bg px-3 py-2 text-sm">
              <span className="text-muted">自己ベスト </span>
              <span className="font-semibold">★ {data.best}</span>
            </p>
          )}
          <ul className="divide-y divide-border">
            {data.sessions.map((s, i) => {
              const lines = s.entries.map((e) => formatEntry(data.type, e)).filter((l): l is string => l !== null);
              return (
                <li key={`${s.date}-${i}`} className="py-2.5">
                  <p className="text-xs text-muted">{formatDate(s.date)}</p>
                  <p className="text-sm">{lines.length ? lines.join("、") : "やった"}</p>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-xs text-muted">新しい順に最大8回分。入力中の記録は含みません。</p>
        </>
      )}
    </BottomSheet>
  );
}
