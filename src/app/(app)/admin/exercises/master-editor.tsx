"use client";

import { useState, useTransition, type ComponentProps } from "react";
import {
  addBodyPartAction,
  addExerciseAction,
  moveBodyPartAction,
  moveExerciseAction,
  setExerciseActiveAction,
  updateBodyPartAction,
  updateExerciseAction,
  type MasterResult,
} from "@/app/actions/exercises";
import { showToast } from "@/components/toaster";
import type { BodyPart, Exercise } from "@/lib/exercises/queries";

const TYPE_LABEL = { weight: "重量系", cardio: "有酸素" } as const;

function useRun() {
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<MasterResult>, success?: string, after?: () => void) =>
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) return showToast(r.error);
      if (success) showToast(success);
      after?.();
    });
  return { pending, run };
}

export function MasterEditor({ parts, exercises }: { parts: BodyPart[]; exercises: Exercise[] }) {
  const { pending, run } = useRun();
  const [newPart, setNewPart] = useState("");

  return (
    <div className="space-y-4 pb-8">
      {parts.map((part, i) => (
        <PartSection
          key={part.id}
          part={part}
          parts={parts}
          exercises={exercises.filter((e) => e.bodyPartId === part.id)}
          isFirst={i === 0}
          isLast={i === parts.length - 1}
        />
      ))}

      <section className="mx-4 rounded-xl border border-dashed border-border p-4">
        <h2 className="mb-2 text-sm font-semibold">部位を追加</h2>
        <div className="flex gap-2">
          <input
            value={newPart}
            onChange={(e) => setNewPart(e.target.value)}
            placeholder="例: 体幹"
            maxLength={40}
            aria-label="部位名"
            className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2"
          />
          <button
            type="button"
            disabled={pending || !newPart.trim()}
            onClick={() => run(() => addBodyPartAction(newPart), "部位を追加しました", () => setNewPart(""))}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg disabled:opacity-50"
          >
            追加
          </button>
        </div>
      </section>
    </div>
  );
}

type PartProps = { part: BodyPart; parts: BodyPart[]; exercises: Exercise[]; isFirst: boolean; isLast: boolean };

function PartSection({ part, parts, exercises, isFirst, isLast }: PartProps) {
  const { pending, run } = useRun();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(part.name);
  const [adding, setAdding] = useState(false);

  return (
    <section className={`mx-4 rounded-xl border border-border bg-surface p-4 ${part.active ? "" : "opacity-60"}`}>
      <div className="mb-2 flex items-center gap-1">
        {renaming ? (
          <>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              aria-label="部位名"
              className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 py-1"
            />
            <SmallButton
              disabled={pending}
              onClick={() => run(() => updateBodyPartAction(part.id, { name }), "部位名を変更しました", () => setRenaming(false))}
            >
              保存
            </SmallButton>
          </>
        ) : (
          <h2 className="flex-1 font-semibold">
            {part.name}
            {!part.active && <span className="ml-2 text-xs font-normal text-muted">非表示</span>}
          </h2>
        )}
        <SmallButton aria-label="上へ" disabled={pending || isFirst} onClick={() => run(() => moveBodyPartAction(part.id, -1))}>
          ↑
        </SmallButton>
        <SmallButton aria-label="下へ" disabled={pending || isLast} onClick={() => run(() => moveBodyPartAction(part.id, 1))}>
          ↓
        </SmallButton>
      </div>
      <div className="mb-3 flex gap-3 text-xs">
        <button type="button" className="text-accent" onClick={() => setRenaming((v) => !v)}>
          {renaming ? "やめる" : "名前を変更"}
        </button>
        <button
          type="button"
          className="text-muted"
          disabled={pending}
          onClick={() =>
            run(
              () => updateBodyPartAction(part.id, { active: !part.active }),
              part.active ? "部位を非表示にしました" : "部位を表示しました",
            )
          }
        >
          {part.active ? "非表示にする" : "表示する"}
        </button>
      </div>

      <ul className="divide-y divide-border">
        {exercises.map((ex, i) => (
          <ExerciseRow key={ex.id} exercise={ex} parts={parts} isFirst={i === 0} isLast={i === exercises.length - 1} />
        ))}
        {exercises.length === 0 && <li className="py-2 text-sm text-muted">種目はありません</li>}
      </ul>

      {adding ? (
        <ExerciseForm
          parts={parts}
          initial={{ name: "", bodyPartId: part.id, type: "weight" }}
          submitLabel="追加"
          onCancel={() => setAdding(false)}
          onSubmit={(v) => run(() => addExerciseAction(v), "種目を追加しました", () => setAdding(false))}
          pending={pending}
        />
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="mt-2 text-sm text-accent">
          ＋ 種目を追加
        </button>
      )}
    </section>
  );
}

type RowProps = { exercise: Exercise; parts: BodyPart[]; isFirst: boolean; isLast: boolean };

function ExerciseRow({ exercise, parts, isFirst, isLast }: RowProps) {
  const { pending, run } = useRun();
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <li className="py-2">
        <ExerciseForm
          parts={parts}
          initial={{ name: exercise.name, bodyPartId: exercise.bodyPartId, type: exercise.type }}
          submitLabel="保存"
          typeNote="種目タイプを変えると、過去の記録の表示が変わることがあります"
          onCancel={() => setEditing(false)}
          onSubmit={(v) => run(() => updateExerciseAction(exercise.id, v), "種目を変更しました", () => setEditing(false))}
          pending={pending}
        />
      </li>
    );
  }

  return (
    <li className={`flex items-center gap-1 py-2 ${exercise.active ? "" : "opacity-60"}`}>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm">{exercise.name}</span>
        <span className="block text-xs text-muted">
          {TYPE_LABEL[exercise.type]}
          {!exercise.active && "・非表示"}
        </span>
      </span>
      <SmallButton onClick={() => setEditing(true)}>編集</SmallButton>
      <SmallButton
        disabled={pending}
        onClick={() =>
          run(() => setExerciseActiveAction(exercise.id, !exercise.active), exercise.active ? "非表示にしました" : "表示しました")
        }
      >
        {exercise.active ? "非表示" : "表示"}
      </SmallButton>
      <SmallButton
        aria-label="上へ"
        disabled={pending || isFirst}
        onClick={() => run(() => moveExerciseAction(exercise.id, exercise.bodyPartId, -1))}
      >
        ↑
      </SmallButton>
      <SmallButton
        aria-label="下へ"
        disabled={pending || isLast}
        onClick={() => run(() => moveExerciseAction(exercise.id, exercise.bodyPartId, 1))}
      >
        ↓
      </SmallButton>
    </li>
  );
}

type FormValue = { name: string; bodyPartId: string; type: "weight" | "cardio" };

type FormProps = {
  parts: BodyPart[];
  initial: FormValue;
  submitLabel: string;
  typeNote?: string;
  onSubmit: (v: FormValue) => void;
  onCancel: () => void;
  pending: boolean;
};

function ExerciseForm({ parts, initial, submitLabel, typeNote, onSubmit, onCancel, pending }: FormProps) {
  const [value, setValue] = useState(initial);
  return (
    <div className="mt-2 space-y-2 rounded-lg bg-bg p-3">
      <input
        value={value.name}
        onChange={(e) => setValue({ ...value, name: e.target.value })}
        placeholder="種目名"
        maxLength={40}
        aria-label="種目名"
        className="w-full rounded-lg border border-border bg-surface px-3 py-2"
      />
      <div className="flex gap-2">
        <select
          value={value.bodyPartId}
          onChange={(e) => setValue({ ...value, bodyPartId: e.target.value })}
          aria-label="部位"
          className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 py-2"
        >
          {parts.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {/* MVPの種目タイプは重量系・有酸素の2種類のみ */}
        <select
          value={value.type}
          onChange={(e) => setValue({ ...value, type: e.target.value as FormValue["type"] })}
          aria-label="種目タイプ"
          className="rounded-lg border border-border bg-surface px-2 py-2"
        >
          <option value="weight">重量系</option>
          <option value="cardio">有酸素</option>
        </select>
      </div>
      {typeNote && value.type !== initial.type && <p className="text-xs text-warn">{typeNote}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="flex-1 rounded-lg border border-border py-2 text-sm">
          やめる
        </button>
        <button
          type="button"
          disabled={pending || !value.name.trim()}
          onClick={() => onSubmit(value)}
          className="flex-1 rounded-lg bg-accent py-2 text-sm font-medium text-accent-fg disabled:opacity-50"
        >
          {submitLabel}
        </button>
      </div>
    </div>
  );
}

function SmallButton(props: ComponentProps<"button">) {
  return <button type="button" {...props} className="rounded px-2 py-1 text-xs text-muted disabled:opacity-30" />;
}
