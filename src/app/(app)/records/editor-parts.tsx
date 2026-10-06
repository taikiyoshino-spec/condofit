"use client";

// 記録入力・メニュー作成で共通の部品（数値入力、アイコンボタン、種目の選択シート）
import { useMemo, useState } from "react";
import { BottomSheet } from "@/components/bottom-sheet";
import type { Catalog, CatalogExercise } from "@/lib/records/queries";
import { distanceFrom, SPEED_PRESETS, SPEED_STEP, speedFrom, stepSpeed } from "@/lib/records/speed";

export function NumberInput({
  label,
  unit,
  value,
  onChange,
  onBlur,
  decimal = false,
}: {
  label: string;
  unit: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  decimal?: boolean;
}) {
  return (
    <label className="flex min-w-0 flex-1 items-center gap-1 rounded-lg border border-border px-2 focus-within:border-accent">
      <span className="sr-only">{label}</span>
      <input
        type="text"
        inputMode={decimal ? "decimal" : "numeric"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder="—"
        className="w-full min-w-0 bg-transparent py-2 text-right text-base outline-none"
      />
      <span className="text-sm text-muted">{unit}</span>
    </label>
  );
}

export function IconButton({ label, onClick, path, disabled }: { label: string; onClick: () => void; path: string; disabled?: boolean }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} disabled={disabled} className="rounded p-1.5 text-muted disabled:opacity-30">
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
        <path d={path} />
      </svg>
    </button>
  );
}

export function ExercisePicker({
  open,
  onClose,
  catalog,
  recentExerciseIds,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  catalog: Catalog;
  recentExerciseIds: string[];
  onPick: (ex: CatalogExercise) => void;
}) {
  const [partId, setPartId] = useState<string | null>(null);
  const byId = useMemo(() => new Map(catalog.exercises.map((e) => [e.id, e])), [catalog.exercises]);
  // 非表示にされた種目は最近使った一覧にも出さない
  const recent = recentExerciseIds.map((id) => byId.get(id)).filter((e): e is CatalogExercise => Boolean(e)).slice(0, 8);
  const partExercises = partId ? catalog.exercises.filter((e) => e.bodyPartId === partId) : [];
  const partName = catalog.bodyParts.find((p) => p.id === partId)?.name;

  return (
    <BottomSheet
      open={open}
      onClose={() => {
        setPartId(null);
        onClose();
      }}
      title={partId ? `${partName}の種目` : "種目を選ぶ"}
    >
      {partId ? (
        <>
          <button type="button" onClick={() => setPartId(null)} className="mb-2 text-sm text-muted">
            ‹ 部位に戻る
          </button>
          <ExerciseList items={partExercises} onPick={onPick} />
        </>
      ) : (
        <>
          {recent.length > 0 && (
            <div className="mb-4">
              <h3 className="mb-2 text-sm font-medium text-muted">最近使った種目</h3>
              <ExerciseList items={recent} onPick={onPick} />
            </div>
          )}
          <h3 className="mb-2 text-sm font-medium text-muted">部位から選ぶ</h3>
          <div className="grid grid-cols-2 gap-2">
            {catalog.bodyParts.map((p) => (
              <button key={p.id} type="button" onClick={() => setPartId(p.id)} className="rounded-lg border border-border py-3 text-sm">
                {p.name}
              </button>
            ))}
          </div>
        </>
      )}
    </BottomSheet>
  );
}

function ExerciseList({ items, onPick }: { items: CatalogExercise[]; onPick: (ex: CatalogExercise) => void }) {
  if (items.length === 0) return <p className="text-sm text-muted">種目がありません</p>;
  return (
    <ul className="divide-y divide-border">
      {items.map((ex) => (
        <li key={ex.id}>
          <button type="button" onClick={() => onPick(ex)} className="flex w-full items-center justify-between py-3 text-left">
            {ex.name}
            <span className="text-xs text-muted">{ex.type === "weight" ? "重量" : "有酸素"}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * 有酸素の入力（時間・距離）＋時速から距離を自動計算する補助。
 * 時速を選ぶ・上下すると「時速 × 時間」で距離を入れる（途中で速度を変えなかった前提）。
 * 距離を手で直したら自動計算はやめる。時速は保存しない（距離を出すための補助）。
 */
export function CardioInputs({
  duration,
  distance,
  onChange,
  onBlur,
}: {
  duration: string;
  distance: string;
  onChange: (values: { duration?: string; distance?: string }) => void;
  onBlur?: () => void;
}) {
  const [speed, setSpeed] = useState(() => speedFrom(duration, distance));

  const applySpeed = (next: string) => {
    setSpeed(next);
    const d = distanceFrom(duration, next);
    if (d !== null) onChange({ distance: d });
  };

  return (
    <div className="min-w-0 flex-1 space-y-1.5">
      <div className="flex items-center gap-2">
        <NumberInput
          label="時間"
          unit="分"
          value={duration}
          onBlur={onBlur}
          decimal
          onChange={(v) => {
            const d = speed ? distanceFrom(v, speed) : null;
            onChange(d !== null ? { duration: v, distance: d } : { duration: v });
          }}
        />
        <NumberInput
          label="距離"
          unit="km"
          value={distance}
          onBlur={onBlur}
          decimal
          onChange={(v) => {
            setSpeed(""); // 手入力を優先
            onChange({ distance: v });
          }}
        />
      </div>
      <div className="flex flex-wrap items-center gap-1 text-xs">
        <span className="text-muted">時速</span>
        <div className="flex items-center rounded-lg border border-border" role="group" aria-label="時速">
          <button type="button" aria-label="時速を0.1下げる" onClick={() => applySpeed(stepSpeed(speed, -SPEED_STEP))} className="px-1.5 py-1">
            −
          </button>
          <input
            type="text"
            inputMode="decimal"
            value={speed}
            placeholder="—"
            aria-label="時速（km/h）"
            onChange={(e) => applySpeed(e.target.value)}
            onBlur={onBlur}
            className="w-9 bg-transparent text-right text-sm outline-none"
          />
          <span className="pl-0.5 text-muted">km/h</span>
          <button type="button" aria-label="時速を0.1上げる" onClick={() => applySpeed(stepSpeed(speed, SPEED_STEP))} className="px-1.5 py-1">
            ＋
          </button>
        </div>
        {SPEED_PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => applySpeed(String(p))}
            className={`rounded-full border px-1.5 py-0.5 ${speed === String(p) ? "border-accent bg-accent text-accent-fg" : "border-border"}`}
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}
