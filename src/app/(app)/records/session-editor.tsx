"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { finishSessionAction, saveSessionAction } from "@/app/actions/records";
import { showToast } from "@/components/toaster";
import { jstDateOf, toJstInputValue, type Entry, type ExerciseType } from "@/lib/records/format";
import {
  asManualRow,
  blocksToExercises,
  EMPTY_ROW,
  entryToRow,
  menuToBlocks,
  planProgress,
  type Block,
  type Row,
} from "@/lib/records/plan";
import type { Catalog, CatalogExercise, SessionExercise } from "@/lib/records/queries";
import { CardioInputs, ExercisePicker, IconButton, NumberInput } from "./editor-parts";
import { PlanRow } from "./plan-row";

// 記録の入力。入力のたびにサーバーへ自動保存する（アプリを閉じても入力が消えないように）
// - 数値の入力は手を止めてから約0.8秒後、種目や行の追加・削除・並び替えはすぐに保存
// - 入力欄から離れたとき・アプリを裏に回したときも、未保存があればすぐ保存
// - 新規は最初の保存で記録を作り、URLを編集画面に切り替える（開き直すと続きから）

type SaveState =
  | { state: "idle" }
  | { state: "dirty" }
  | { state: "saving" }
  | { state: "saved"; at: number }
  | { state: "error"; message: string };

const TYPING_DELAY_MS = 800;
const STRUCTURE_DELAY_MS = 150;
// メニューで記録中の「まだやっていない予定のセット」はサーバーに保存しないので、この端末に覚えておく
const PLAN_KEY = (sessionId: string) => `condofit:record-plan:${sessionId}`;

let nextKey = 1;
const newKey = () => nextKey++;

export type MenuForEditor = {
  id: string;
  name: string;
  items: { exerciseId: string; name: string; type: ExerciseType; sets: Partial<Entry>[] }[];
};
type SavedPlan = { menuName: string; blocks: Block[] };

function loadPlan(sessionId: string | null): SavedPlan | null {
  if (!sessionId) return null;
  try {
    const raw = localStorage.getItem(PLAN_KEY(sessionId));
    return raw ? (JSON.parse(raw) as SavedPlan) : null;
  } catch {
    return null;
  }
}
function storePlan(sessionId: string, plan: SavedPlan | null) {
  try {
    if (plan) localStorage.setItem(PLAN_KEY(sessionId), JSON.stringify(plan));
    else localStorage.removeItem(PLAN_KEY(sessionId));
  } catch {
    // 保存できない環境では予定の続きは復元されない（できたセットはサーバーに保存済み）
  }
}

type Props = {
  sessionId: string | null;
  initialPerformedAt: string;
  initialExercises: SessionExercise[];
  catalog: Catalog;
  recentExerciseIds: string[];
  lastEntries: Record<string, Entry[]>;
  /** メニューから始めたとき */
  menu?: MenuForEditor | null;
};

/** 保存する内容は「できた」行だけ（予定・やらなかったセットは記録しない） */
function toInput(performedAt: string, blocks: Block[]) {
  return { performedAtLocal: performedAt, exercises: blocksToExercises(blocks) };
}

export function SessionEditor({
  sessionId: initialSessionId,
  initialPerformedAt,
  initialExercises,
  catalog,
  recentExerciseIds,
  lastEntries,
  menu,
}: Props) {
  const router = useRouter();
  const [performedAt, setPerformedAt] = useState(() => toJstInputValue(initialPerformedAt));
  const [blocks, setBlocks] = useState<Block[]>(() =>
    menu
      ? menuToBlocks(menu.items, newKey)
      : initialExercises.map((ex) => ({
          key: newKey(),
          exerciseId: ex.exerciseId,
          name: ex.name,
          type: ex.type,
          rows: ex.entries.length ? ex.entries.map((e) => entryToRow(e)) : [{ ...EMPTY_ROW }],
        })),
  );
  const [menuName, setMenuName] = useState(menu?.name ?? null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [save, setSave] = useState<SaveState>(initialSessionId ? { state: "saved", at: 0 } : { state: "idle" });
  const [finishing, setFinishing] = useState(false);

  // 保存処理から常に最新の値を読むための参照
  const latest = useRef({ performedAt, blocks, menuName });
  useEffect(() => {
    latest.current = { performedAt, blocks, menuName };
    // メニューの予定が残っている間は、この端末に予定ごと覚えておく（開き直したら続きから）
    const sid = sessionIdRef.current;
    if (sid && menuName) storePlan(sid, blocks.some((b) => b.rows.some((r) => r.fromPlan)) ? { menuName, blocks } : null);
  }, [performedAt, blocks, menuName]);

  // 開き直したとき、この端末に覚えている予定があれば続きから（サーバーには「できた」分だけ保存されている）
  useEffect(() => {
    const t = setTimeout(() => {
      const plan = loadPlan(initialSessionId);
      if (!plan) return;
      setBlocks(plan.blocks.map((b) => ({ ...b, key: newKey() })));
      setMenuName(plan.menuName);
    }, 0);
    return () => clearTimeout(t);
  }, [initialSessionId]);
  const sessionIdRef = useRef(initialSessionId);
  const dirty = useRef(false);
  const inFlight = useRef<Promise<boolean> | null>(null);
  const again = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const celebrated = useRef(new Set<string>());

  /** 未保存の内容をサーバーへ保存する。保存中に変更があれば続けてもう一度保存。成功したら true */
  const runSave = useCallback((): Promise<boolean> => {
    clearTimeout(timer.current);
    if (inFlight.current) {
      again.current = true;
      return inFlight.current;
    }
    const task = (async () => {
      setSave({ state: "saving" });
      try {
        do {
          again.current = false;
          dirty.current = false;
          const { performedAt: p, blocks: b } = latest.current;
          const result = await saveSessionAction(sessionIdRef.current, toInput(p, b), { revalidate: false });
          if (!result.ok) {
            dirty.current = true;
            setSave({ state: "error", message: result.error });
            return false;
          }
          if (!sessionIdRef.current) {
            sessionIdRef.current = result.id;
            // 開き直したときに続きから編集できるよう、URLを編集画面に（画面は作り直さない）
            window.history.replaceState(null, "", `/records/s/${result.id}/edit`);
            const { blocks: current, menuName: name } = latest.current;
            if (name && current.some((x) => x.rows.some((r) => r.fromPlan))) storePlan(result.id, { menuName: name, blocks: current });
          }
          for (const pb of result.personalBests) {
            if (celebrated.current.has(pb)) continue;
            celebrated.current.add(pb);
            showToast(`🎉 自己ベスト更新！ ${pb}`, { variant: "celebrate" });
          }
        } while (again.current);
        setSave({ state: "saved", at: Date.now() });
        return true;
      } catch {
        dirty.current = true;
        setSave({ state: "error", message: "通信できませんでした" });
        return false;
      } finally {
        inFlight.current = null;
      }
    })();
    inFlight.current = task;
    return task;
  }, []);

  /** 変更を記録し、少し待ってから保存する */
  const scheduleSave = useCallback(
    (delay: number) => {
      dirty.current = true;
      setSave((s) => (s.state === "saving" ? s : { state: "dirty" }));
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void runSave(), delay);
    },
    [runSave],
  );

  const flush = useCallback(() => {
    if (dirty.current) void runSave();
  }, [runSave]);

  // アプリを裏に回した・閉じそうなときは未保存をすぐ保存し、保存前に閉じようとしたら確認
  useEffect(() => {
    const onHidden = () => document.visibilityState === "hidden" && flush();
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty.current || inFlight.current) {
        flush();
        e.preventDefault();
      }
    };
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("beforeunload", onBeforeUnload);
      clearTimeout(timer.current);
    };
  }, [flush]);

  const addExercise = (ex: CatalogExercise) => {
    setBlocks((list) => {
      // 同一セッション内で同じ種目を追加 → 直前に入力した値を初期値にする
      const sameInSession = [...list].reverse().find((b) => b.exerciseId === ex.id);
      const rows = sameInSession
        ? [asManualRow(sameInSession.rows[sameInSession.rows.length - 1])]
        : // 新しいセッションで追加 → 直近のその種目の記録を初期値（初回は空欄）
          (lastEntries[ex.id]?.map((e) => entryToRow(e)) ?? [{ ...EMPTY_ROW }]);
      return [...list, { key: newKey(), exerciseId: ex.id, name: ex.name, type: ex.type, rows }];
    });
    setPickerOpen(false);
    scheduleSave(STRUCTURE_DELAY_MS);
  };

  const update = (key: number, fn: (b: Block) => Block | null, delay = STRUCTURE_DELAY_MS) => {
    setBlocks((list) => list.flatMap((b) => (b.key === key ? (fn(b) ?? []) : [b])));
    scheduleSave(delay);
  };

  /** 数値の入力（手を止めてから保存） */
  const setField = (key: number, rowIndex: number, field: "weight" | "reps" | "duration" | "distance", value: string) =>
    update(
      key,
      (blk) => ({ ...blk, rows: blk.rows.map((row, k) => (k === rowIndex ? { ...row, [field]: value } : row)) }),
      TYPING_DELAY_MS,
    );

  /** 複数の値をまとめて変更（有酸素で時間と距離を同時に変えるときなど） */
  const setFields = (key: number, rowIndex: number, values: Partial<Pick<Row, "duration" | "distance">>) =>
    update(
      key,
      (blk) => ({ ...blk, rows: blk.rows.map((row, k) => (k === rowIndex ? { ...row, ...values } : row)) }),
      TYPING_DELAY_MS,
    );

  /** メニューの予定セット: できた（値を確定）／やらなかった／予定に戻す。すぐ保存 */
  const setRow = (key: number, rowIndex: number, fn: (row: Row) => Row) =>
    update(key, (blk) => ({ ...blk, rows: blk.rows.map((row, k) => (k === rowIndex ? fn(row) : row)) }));
  const markDone = (key: number, rowIndex: number, values?: Partial<Row>) =>
    setRow(key, rowIndex, (row) => ({ ...row, ...values, status: "done" }));
  const markSkipped = (key: number, rowIndex: number) => setRow(key, rowIndex, (row) => ({ ...row, status: "skipped" }));
  const backToPlan = (key: number, rowIndex: number) =>
    setRow(key, rowIndex, (row) => ({ ...row, ...(row.plan ?? {}), status: "planned" }));
  const progress = planProgress(blocks);

  const move = (index: number, delta: number) => {
    setBlocks((list) => {
      const to = index + delta;
      if (to < 0 || to >= list.length) return list;
      const next = [...list];
      [next[index], next[to]] = [next[to], next[index]];
      return next;
    });
    scheduleSave(STRUCTURE_DELAY_MS);
  };

  /** 完了: 最後の保存を待ってから、その日の記録へ（種目なしでもここで記録を作る） */
  const finish = async () => {
    setFinishing(true);
    const ok = dirty.current || inFlight.current || !sessionIdRef.current ? await runSave() : true;
    if (!ok) {
      setFinishing(false);
      return;
    }
    await finishSessionAction();
    // 完了したら、やらなかった予定は残さない
    if (sessionIdRef.current) storePlan(sessionIdRef.current, null);
    if (celebrated.current.size === 0) showToast("記録を保存しました");
    router.push(`/records/${jstDateOf(new Date(`${latest.current.performedAt}:00+09:00`).toISOString())}`);
    router.refresh();
  };

  return (
    <div className="pb-36">
      <section className="mx-4 mb-4 rounded-xl border border-border bg-surface p-4">
        <label className="block space-y-1">
          <span className="text-sm font-medium">Fitに行った日時</span>
          <input
            type="datetime-local"
            value={performedAt}
            onChange={(e) => {
              if (!e.target.value) return;
              setPerformedAt(e.target.value);
              // 新規で種目がまだないうちは記録を作らない（完了時に作る）
              if (sessionIdRef.current) scheduleSave(TYPING_DELAY_MS);
            }}
            onBlur={flush}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2.5"
          />
        </label>
      </section>

      {menuName && progress.total > 0 && (
        <section className="mx-4 mb-4 rounded-xl border border-accent bg-surface p-4" aria-label="メニューの進み具合">
          <div className="flex items-baseline justify-between">
            <span className="font-semibold">メニュー：{menuName}</span>
            <span className="text-sm text-muted">
              {progress.finished}/{progress.total}セット
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-border" aria-hidden>
            <div className="h-full rounded-full bg-accent" style={{ width: `${(progress.finished / progress.total) * 100}%` }} />
          </div>
          <p className="mt-2 text-xs text-muted">セットごとに「できた」か「できなかった」を押してください。押した分から自動で保存されます。</p>
        </section>
      )}

      {blocks.length === 0 && (
        <p className="mx-4 mb-4 text-sm text-muted">
          種目を追加すると、入力するたびに自動で保存されます。種目なしでも「完了」で「Fitに行った」として残せます。
        </p>
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
                if (r.fromPlan && r.status !== "done") {
                  return (
                    <li key={j}>
                      <PlanRow
                        type={b.type}
                        row={r}
                        setNumber={j + 1}
                        onDone={(values) => markDone(b.key, j, values)}
                        onSkip={() => markSkipped(b.key, j)}
                        onUndo={() => backToPlan(b.key, j)}
                      />
                    </li>
                  );
                }
                return (
                  <li key={j} className="flex items-center gap-2">
                    {r.fromPlan && (
                      <button
                        type="button"
                        onClick={() => backToPlan(b.key, j)}
                        aria-label="予定に戻す"
                        title="予定に戻す"
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-fg"
                      >
                        ✓
                      </button>
                    )}
                    {b.type === "weight" ? (
                      <>
                        <NumberInput label="重量" unit="kg" value={r.weight} onChange={(v) => setField(b.key, j, "weight", v)} onBlur={flush} decimal />
                        <span className="text-muted" aria-hidden>×</span>
                        <NumberInput label="回数" unit="回" value={r.reps} onChange={(v) => setField(b.key, j, "reps", v)} onBlur={flush} />
                      </>
                    ) : (
                      <>
                        <CardioInputs
                          duration={r.duration}
                          distance={r.distance}
                          onChange={(v) => setFields(b.key, j, v)}
                          onBlur={flush}
                        />
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
              onClick={() => update(b.key, (blk) => ({ ...blk, rows: [...blk.rows, asManualRow(blk.rows[blk.rows.length - 1])] }))}
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
        <SaveStatus save={save} onRetry={() => void runSave()} />
        <button
          type="button"
          onClick={() => void finish()}
          disabled={finishing}
          className="w-full rounded-xl bg-accent py-3 font-semibold text-accent-fg shadow-lg disabled:opacity-50"
        >
          {finishing ? "保存中…" : "完了"}
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

function SaveStatus({ save, onRetry }: { save: SaveState; onRetry: () => void }) {
  const time = (at: number) =>
    new Date(at).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo" });
  return (
    <div className="mb-2 flex justify-center" role="status" aria-live="polite">
      <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs shadow-sm">
        {save.state === "idle" && <span className="text-muted">記録すると自動で保存されます</span>}
        {save.state === "dirty" && <span className="text-muted">入力中…</span>}
        {save.state === "saving" && <span className="text-muted">保存中…</span>}
        {save.state === "saved" && (
          <span className="text-accent">✓ 保存済み{save.at ? `（${time(save.at)}）` : ""}</span>
        )}
        {save.state === "error" && (
          <span className="text-danger">
            保存できませんでした（{save.message}）
            <button type="button" onClick={onRetry} className="ml-2 font-semibold underline">
              再試行
            </button>
          </span>
        )}
      </span>
    </div>
  );
}
