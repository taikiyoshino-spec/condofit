"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteMenuAction, saveMenuAction } from "@/app/actions/menus";
import { showToast } from "@/components/toaster";
import type { Entry } from "@/lib/records/format";
import { asManualRow, EMPTY_ROW, entryToRow, rowToEntry, type Block } from "@/lib/records/plan";
import type { Catalog, CatalogExercise } from "@/lib/records/queries";
import type { Menu } from "@/lib/menus/queries";
import { ExercisePicker, IconButton, NumberInput } from "../editor-parts";

let nextKey = 1;

/** メニューの作成・編集（自分専用）。種目ごとにセット数と各セットの重さ・回数を決める */
export function MenuEditor({
  menu,
  catalog,
  recentExerciseIds,
  lastEntries,
}: {
  menu: Menu | null;
  catalog: Catalog;
  recentExerciseIds: string[];
  lastEntries: Record<string, Entry[]>;
}) {
  const router = useRouter();
  const [name, setName] = useState(menu?.name ?? "");
  const [blocks, setBlocks] = useState<Block[]>(() =>
    (menu?.items ?? []).map((it) => ({
      key: nextKey++,
      exerciseId: it.exerciseId,
      name: it.name,
      type: it.type,
      rows: it.sets.length ? it.sets.map((s) => entryToRow(s)) : [{ ...EMPTY_ROW }],
    })),
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();

  const update = (key: number, fn: (b: Block) => Block | null) =>
    setBlocks((list) => list.flatMap((b) => (b.key === key ? (fn(b) ?? []) : [b])));

  const setField = (key: number, j: number, field: "weight" | "reps" | "duration" | "distance", value: string) =>
    update(key, (b) => ({ ...b, rows: b.rows.map((r, k) => (k === j ? { ...r, [field]: value } : r)) }));

  const move = (index: number, delta: number) =>
    setBlocks((list) => {
      const to = index + delta;
      if (to < 0 || to >= list.length) return list;
      const next = [...list];
      [next[index], next[to]] = [next[to], next[index]];
      return next;
    });

  const addExercise = (ex: CatalogExercise) => {
    // 前回の記録をそのままセットの初期値にする（初回は空のセット3つ）
    const rows = lastEntries[ex.id]?.map((e) => entryToRow(e)) ?? [{ ...EMPTY_ROW }, { ...EMPTY_ROW }, { ...EMPTY_ROW }];
    setBlocks((list) => [...list, { key: nextKey++, exerciseId: ex.id, name: ex.name, type: ex.type, rows }]);
    setPickerOpen(false);
  };

  const save = () =>
    startTransition(async () => {
      const result = await saveMenuAction(menu?.id ?? null, {
        name,
        items: blocks.map((b) => ({ exerciseId: b.exerciseId, sets: b.rows.map(rowToEntry) })),
      });
      if (!result.ok) return showToast(result.error);
      showToast("メニューを保存しました");
      router.push("/records/menus");
      router.refresh();
    });

  const remove = () =>
    startTransition(async () => {
      if (!menu) return;
      const result = await deleteMenuAction(menu.id);
      if (!result.ok) return showToast(result.error ?? "削除できませんでした");
      showToast("メニューを削除しました");
      router.push("/records/menus");
      router.refresh();
    });

  return (
    <div className="pb-36">
      <section className="mx-4 mb-4 rounded-xl border border-border bg-surface p-4">
        <label className="block space-y-1">
          <span className="text-sm font-medium">メニュー名</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            placeholder="例：胸と背中の日"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-base"
          />
        </label>
      </section>

      {blocks.length === 0 && <p className="mx-4 mb-4 text-sm text-muted">種目を追加して、セットごとの重さと回数を決めましょう。</p>}

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
              {b.rows.map((r, j) => (
                <li key={j} className="flex items-center gap-2">
                  <span className="w-10 shrink-0 text-xs text-muted">{j + 1}セット</span>
                  {b.type === "weight" ? (
                    <>
                      <NumberInput label="重量" unit="kg" value={r.weight} onChange={(v) => setField(b.key, j, "weight", v)} decimal />
                      <span className="text-muted" aria-hidden>
                        ×
                      </span>
                      <NumberInput label="回数" unit="回" value={r.reps} onChange={(v) => setField(b.key, j, "reps", v)} />
                    </>
                  ) : (
                    <>
                      <NumberInput label="時間" unit="分" value={r.duration} onChange={(v) => setField(b.key, j, "duration", v)} decimal />
                      <NumberInput label="距離" unit="km" value={r.distance} onChange={(v) => setField(b.key, j, "distance", v)} decimal />
                    </>
                  )}
                  <IconButton
                    label="このセットを削除"
                    disabled={b.rows.length === 1}
                    onClick={() => update(b.key, (blk) => ({ ...blk, rows: blk.rows.filter((_, k) => k !== j) }))}
                    path="M6 12h12"
                  />
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => update(b.key, (blk) => ({ ...blk, rows: [...blk.rows, asManualRow(blk.rows[blk.rows.length - 1])] }))}
              className="mt-2 text-sm text-accent"
            >
              ＋ セットを追加
            </button>
          </li>
        ))}
      </ol>

      <div className="mx-4 mt-3 space-y-3">
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="w-full rounded-xl border border-dashed border-border py-3 font-medium text-accent"
        >
          ＋ 種目を追加
        </button>
        {menu &&
          (confirmDelete ? (
            <div className="flex items-center gap-2 text-sm">
              <span className="flex-1">このメニューを削除しますか？（記録は消えません）</span>
              <button type="button" onClick={() => setConfirmDelete(false)} className="rounded-lg border border-border px-3 py-1.5">
                やめる
              </button>
              <button type="button" disabled={pending} onClick={remove} className="rounded-lg border border-danger px-3 py-1.5 text-danger">
                削除する
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmDelete(true)} className="w-full py-2 text-sm text-danger">
              メニューを削除
            </button>
          ))}
      </div>

      <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10 mx-auto max-w-lg px-4 pb-2">
        <button
          type="button"
          onClick={save}
          disabled={pending || !name.trim() || blocks.length === 0}
          className="w-full rounded-xl bg-accent py-3 font-semibold text-accent-fg shadow-lg disabled:opacity-50"
        >
          {pending ? "保存中…" : "メニューを保存"}
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
