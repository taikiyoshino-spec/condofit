"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveSessionAction } from "@/app/actions/records";
import { BottomSheet } from "@/components/bottom-sheet";
import { showToast } from "@/components/toaster";
import { jstDateOf, parseNumber, toJstInputValue, type Entry, type ExerciseType } from "@/lib/records/format";
import type { Catalog, CatalogExercise, SessionExercise } from "@/lib/records/queries";

type Row = { weight: string; reps: string; duration: string; distance: string };
type Block = { key: number; exerciseId: string; name: string; type: ExerciseType; rows: Row[] };

const EMPTY_ROW: Row = { weight: "", reps: "", duration: "", distance: "" };
const str = (n: number | null) => (n === null ? "" : String(n));
const toRow = (e: Entry): Row => ({
  weight: str(e.weight_kg),
  reps: str(e.reps),
  duration: str(e.duration_min),
  distance: str(e.distance_km),
});

let nextKey = 1;

type Props = {
  sessionId: string | null;
  initialPerformedAt: string;
  initialExercises: SessionExercise[];
  catalog: Catalog;
  recentExerciseIds: string[];
  lastEntries: Record<string, Entry[]>;
};

export function SessionEditor({ sessionId, initialPerformedAt, initialExercises, catalog, recentExerciseIds, lastEntries }: Props) {
  const router = useRouter();
  const [performedAt, setPerformedAt] = useState(() => toJstInputValue(initialPerformedAt));
  const [blocks, setBlocks] = useState<Block[]>(() =>
    initialExercises.map((ex) => ({
      key: nextKey++,
      exerciseId: ex.exerciseId,
      name: ex.name,
      type: ex.type,
      rows: ex.entries.length ? ex.entries.map(toRow) : [{ ...EMPTY_ROW }],
    })),
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const addExercise = (ex: CatalogExercise) => {
    setBlocks((list) => {
      // 同一セッション内で同じ種目を追加 → 直前に入力した値を初期値にする
      const sameInSession = [...list].reverse().find((b) => b.exerciseId === ex.id);
      const rows = sameInSession
        ? [{ ...sameInSession.rows[sameInSession.rows.length - 1] }]
        : // 新しいセッションで追加 → 直近のその種目の記録を初期値（初回は空欄）
          (lastEntries[ex.id]?.map(toRow) ?? [{ ...EMPTY_ROW }]);
      return [...list, { key: nextKey++, exerciseId: ex.id, name: ex.name, type: ex.type, rows }];
    });
    setPickerOpen(false);
  };

  const update = (key: number, fn: (b: Block) => Block | null) =>
    setBlocks((list) => list.flatMap((b) => (b.key === key ? (fn(b) ?? []) : [b])));

  const move = (index: number, delta: number) =>
    setBlocks((list) => {
      const to = index + delta;
      if (to < 0 || to >= list.length) return list;
      const next = [...list];
      [next[index], next[to]] = [next[to], next[index]];
      return next;
    });

  const save = () =>
    startTransition(async () => {
      setError(null);
      const exercises = blocks.map((b) => ({
        exerciseId: b.exerciseId,
        entries: b.rows.map((r) => ({
          weight_kg: parseNumber(r.weight, { max: 999 }),
          reps: parseNumber(r.reps, { integer: true }),
          duration_min: parseNumber(r.duration),
          distance_km: parseNumber(r.distance, { max: 999 }),
        })),
      }));
      const result = await saveSessionAction(sessionId, { performedAtLocal: performedAt, exercises });
      if (!result.ok) return setError(result.error);
      if (result.personalBests.length > 0) {
        for (const pb of result.personalBests.slice(0, 3)) showToast(`🎉 自己ベスト更新！ ${pb}`, { variant: "celebrate" });
      } else {
        showToast("記録を保存しました");
      }
      router.push(`/records/${jstDateOf(new Date(`${performedAt}:00+09:00`).toISOString())}`);
      router.refresh();
    });

  return (
    <div className="pb-32">
      <section className="mx-4 mb-4 rounded-xl border border-border bg-surface p-4">
        <label className="block space-y-1">
          <span className="text-sm font-medium">Fitに行った日時</span>
          <input
            type="datetime-local"
            value={performedAt}
            onChange={(e) => e.target.value && setPerformedAt(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2.5"
          />
        </label>
      </section>

      {blocks.length === 0 && (
        <p className="mx-4 mb-4 text-sm text-muted">種目を追加しなくても「Fitに行った」として保存できます。</p>
      )}

      <ol className="space-y-3">
        {blocks.map((b, i) => (
          <li key={b.key} className="mx-4 rounded-xl border border-border bg-surface p-4">
            <div className="mb-2 flex items-center gap-1">
              <span className="flex-1 font-semibold">{b.name}</span>
              <IconButton label="上へ" disabled={i === 0} onClick={() => move(i, -1)} path="M6 15l6-6 6 6" />
              <IconButton label="下へ" disabled={i === blocks.length - 1} onClick={() => move(i, 1)} path="M6 9l6 6 6-6" />
              <IconButton label={`${b.name}を削除`} onClick={() => update(b.key, () => null)} path="M6 6l12 12M18 6L6 18" />
            </div>

            <ul className="space-y-2">
              {b.rows.map((r, j) => {
                const setField = (field: keyof Row) => (value: string) =>
                  update(b.key, (blk) => ({
                    ...blk,
                    rows: blk.rows.map((row, k) => (k === j ? { ...row, [field]: value } : row)),
                  }));
                return (
                  <li key={j} className="flex items-center gap-2">
                    {b.type === "weight" ? (
                      <>
                        <NumberInput label="重量" unit="kg" value={r.weight} onChange={setField("weight")} decimal />
                        <span className="text-muted" aria-hidden>×</span>
                        <NumberInput label="回数" unit="回" value={r.reps} onChange={setField("reps")} />
                      </>
                    ) : (
                      <>
                        <NumberInput label="時間" unit="分" value={r.duration} onChange={setField("duration")} decimal />
                        <NumberInput label="距離" unit="km" value={r.distance} onChange={setField("distance")} decimal />
                      </>
                    )}
                    <IconButton
                      label="この行を削除"
                      disabled={b.rows.length === 1}
                      onClick={() => update(b.key, (blk) => ({ ...blk, rows: blk.rows.filter((_, k) => k !== j) }))}
                      path="M6 12h12"
                    />
                  </li>
                );
              })}
            </ul>
            <button
              type="button"
              onClick={() => update(b.key, (blk) => ({ ...blk, rows: [...blk.rows, { ...blk.rows[blk.rows.length - 1] }] }))}
              className="mt-2 text-sm text-accent"
            >
              ＋ 同じ種目をもう1セット
            </button>
          </li>
        ))}
      </ol>

      <div className="mx-4 mt-3">
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="w-full rounded-xl border border-dashed border-border py-3 font-medium text-accent"
        >
          ＋ 種目を追加
        </button>
      </div>

      <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10 mx-auto max-w-lg px-4 pb-2">
        {error && <p className="mb-2 rounded-lg bg-surface p-2 text-sm text-danger">{error}</p>}
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="w-full rounded-xl bg-accent py-3 font-semibold text-accent-fg shadow-lg disabled:opacity-50"
        >
          {pending ? "保存中…" : "保存する"}
        </button>
      </div>

      <ExercisePicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        catalog={catalog}
        recentExerciseIds={recentExerciseIds}
        onPick={addExercise}
      />
    </div>
  );
}

function NumberInput({
  label,
  unit,
  value,
  onChange,
  decimal = false,
}: {
  label: string;
  unit: string;
  value: string;
  onChange: (v: string) => void;
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
        placeholder="—"
        className="w-full min-w-0 bg-transparent py-2 text-right text-base outline-none"
      />
      <span className="text-sm text-muted">{unit}</span>
    </label>
  );
}

function IconButton({ label, onClick, path, disabled }: { label: string; onClick: () => void; path: string; disabled?: boolean }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} disabled={disabled} className="rounded p-1.5 text-muted disabled:opacity-30">
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
        <path d={path} />
      </svg>
    </button>
  );
}

function ExercisePicker({
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
