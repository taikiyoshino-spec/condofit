"use client";

// 記録入力・メニュー作成で共通の部品（数値入力、アイコンボタン、種目の選択シート）
import { useMemo, useState, useTransition } from "react";
import { BottomSheet } from "@/components/bottom-sheet";
import type { Catalog, CatalogExercise } from "@/lib/records/queries";
import { createCustomExerciseAction } from "@/app/actions/custom-exercises";
import { distanceFrom, SPEED_PRESETS, SPEED_STEP, speedFrom, stepSpeed } from "@/lib/records/speed";

export function NumberInput({
  label,
  unit,
  value,
  onChange,
  onBlur,
  decimal = false,
  placeholder = "—",
}: {
  label: string;
  unit: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  decimal?: boolean;
  placeholder?: string;
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
        placeholder={placeholder}
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
  // この画面で新しく作った自分の種目（再読み込みまでの間も一覧に出す）
  const [created, setCreated] = useState<CatalogExercise[]>([]);
  const all = useMemo(() => [...catalog.exercises, ...created.filter((c) => !catalog.exercises.some((e) => e.id === c.id))], [catalog.exercises, created]);
  const byId = useMemo(() => new Map(all.map((e) => [e.id, e])), [all]);
  const customs = all.filter((e) => e.custom);
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
          {customs.length > 0 && (
            <div className="mb-4">
              <h3 className="mb-2 text-sm font-medium text-muted">自分の種目</h3>
              <ExerciseList items={customs} onPick={onPick} />
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
          <CustomExerciseForm
            onCreated={(ex) => {
              if (ex.custom) setCreated((list) => (list.some((e) => e.id === ex.id) ? list : [...list, ex]));
              onPick(ex);
            }}
          />
        </>
      )}
    </BottomSheet>
  );
}

/** 一覧にない種目を自分で名前を付けて追加（自分専用。ほかのメンバーには見えない） */
function CustomExerciseForm({ onCreated }: { onCreated: (ex: CatalogExercise) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<"weight" | "cardio">("weight");
  const [excludesBar, setExcludesBar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-4 w-full rounded-lg border border-dashed border-border py-3 text-sm font-medium text-accent"
      >
        ＋ 一覧にない種目を自由に入力
      </button>
    );
  }

  const submit = () =>
    startTransition(async () => {
      setError(null);
      const result = await createCustomExerciseAction(name, type, excludesBar);
      if (!result.ok) return setError(result.error);
      setName("");
      setExcludesBar(false);
      setOpen(false);
      onCreated(result.exercise);
    });

  return (
    <div className="mt-4 space-y-2 rounded-lg border border-border p-3">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={40}
        placeholder="種目名（例：ケトルベルスイング）"
        aria-label="種目名"
        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-base"
      />
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="種目のタイプ">
        {(
          [
            ["weight", "重量系（kg×回）"],
            ["cardio", "有酸素（分・km）"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={type === value}
            onClick={() => setType(value)}
            className={`rounded-lg py-2 text-sm ${type === value ? "border-2 border-accent font-medium" : "border border-border"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {type === "weight" && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={excludesBar} onChange={(e) => setExcludesBar(e.target.checked)} />
          バーの重さを除いて記録する
        </label>
      )}
      <p className="text-xs text-muted">自分専用の種目です。ほかのメンバーには見えず、ランキングにも数えません。</p>
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={() => setOpen(false)} className="flex-1 rounded-lg border border-border py-2 text-sm">
          やめる
        </button>
        <button
          type="button"
          disabled={pending || !name.trim()}
          onClick={submit}
          className="flex-1 rounded-lg bg-accent py-2 text-sm font-medium text-accent-fg disabled:opacity-50"
        >
          {pending ? "追加中…" : "追加する"}
        </button>
      </div>
    </div>
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
