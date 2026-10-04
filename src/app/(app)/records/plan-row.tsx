"use client";

import { useState } from "react";
import { formatEntry, type ExerciseType } from "@/lib/records/format";
import { adjustCount, rowToEntry, type Row } from "@/lib/records/plan";
import { NumberInput } from "./editor-parts";

type Values = Pick<Row, "weight" | "reps" | "duration" | "distance">;

/**
 * メニューの予定セット1行。
 * - 予定: 「できた」で予定どおり記録、「できなかった」で回数（と重さ）を直して記録。0回なら「やらなかった」
 * - やらなかった: 記録には残さない。「元に戻す」で予定に戻せる
 */
export function PlanRow({
  type,
  row,
  setNumber,
  onDone,
  onSkip,
  onUndo,
}: {
  type: ExerciseType;
  row: Row;
  setNumber: number;
  onDone: (values?: Values) => void;
  onSkip: () => void;
  onUndo: () => void;
}) {
  const [adjusting, setAdjusting] = useState<Values | null>(null);
  const planText = formatEntry(type, rowToEntry(row)) ?? "数値なし";

  if (row.status === "skipped") {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-bg px-3 py-2 text-sm">
        <span className="w-12 shrink-0 text-xs text-muted">{setNumber}セット</span>
        <span className="flex-1 text-muted line-through">{planText}</span>
        <span className="text-xs text-muted">やらなかった</span>
        <button type="button" onClick={onUndo} className="text-xs font-medium text-accent">
          元に戻す
        </button>
      </div>
    );
  }

  if (adjusting) {
    const commit = () => {
      const reps = type === "weight" ? Number(adjusting.reps || 0) : null;
      const emptyCardio = type === "cardio" && !adjusting.duration && !adjusting.distance;
      // 0回（有酸素は時間も距離もなし）なら、やらなかった扱い
      if (reps === 0 || emptyCardio) onSkip();
      else onDone(adjusting);
      setAdjusting(null);
    };
    return (
      <div className="space-y-2 rounded-lg border border-accent p-3">
        <p className="text-xs text-muted">
          {setNumber}セット目（予定 {planText}）。実際にできたところまでに直してください。
        </p>
        {type === "weight" ? (
          <div className="flex items-center gap-2">
            <NumberInput label="重量" unit="kg" value={adjusting.weight} onChange={(v) => setAdjusting({ ...adjusting, weight: v })} decimal />
            <div className="flex items-center rounded-lg border border-border" role="group" aria-label="回数">
              <button
                type="button"
                aria-label="1回減らす"
                onClick={() => setAdjusting({ ...adjusting, reps: adjustCount(adjusting.reps, -1) })}
                className="px-3 py-2 text-lg leading-none"
              >
                −
              </button>
              <span className="min-w-12 text-center font-semibold" aria-live="polite">
                {adjusting.reps || 0}回
              </span>
              <button
                type="button"
                aria-label="1回増やす"
                onClick={() => setAdjusting({ ...adjusting, reps: adjustCount(adjusting.reps, 1) })}
                className="px-3 py-2 text-lg leading-none"
              >
                ＋
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <NumberInput label="時間" unit="分" value={adjusting.duration} onChange={(v) => setAdjusting({ ...adjusting, duration: v })} decimal />
            <NumberInput label="距離" unit="km" value={adjusting.distance} onChange={(v) => setAdjusting({ ...adjusting, distance: v })} decimal />
          </div>
        )}
        <div className="flex gap-2">
          <button type="button" onClick={() => setAdjusting(null)} className="flex-1 rounded-lg border border-border py-2 text-sm">
            やめる
          </button>
          <button type="button" onClick={commit} className="flex-1 rounded-lg bg-accent py-2 text-sm font-medium text-accent-fg">
            この内容で記録
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2">
      <span className="w-12 shrink-0 text-xs text-muted">{setNumber}セット</span>
      <span className="flex-1 text-sm font-medium">{planText}</span>
      <button
        type="button"
        onClick={() => setAdjusting({ weight: row.weight, reps: row.reps, duration: row.duration, distance: row.distance })}
        className="rounded-lg border border-border px-2.5 py-1.5 text-xs"
      >
        できなかった
      </button>
      <button type="button" onClick={() => onDone()} className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-fg">
        できた
      </button>
    </div>
  );
}
