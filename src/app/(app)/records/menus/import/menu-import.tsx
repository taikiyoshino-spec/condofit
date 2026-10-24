"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveMenuAction } from "@/app/actions/menus";
import { createCustomExerciseAction } from "@/app/actions/custom-exercises";
import { generateMenuAction } from "@/app/actions/menu-ai";
import { MENU_GOALS, MENU_MINUTES, MENU_NOTE_MAX } from "@/lib/menus/generate";
import { showToast } from "@/components/toaster";
import type { Entry, ExerciseType } from "@/lib/records/format";
import type { Catalog } from "@/lib/records/queries";
import type { Menu } from "@/lib/menus/queries";
import { buildMenuPrompt, guessType, matchExercise, parseMenuText, type TextMenu } from "@/lib/menus/text";

/** 一致しない種目の扱い: 既存の種目のID、または自分の種目として新しく作る */
type Choice = { kind: "existing"; exerciseId: string } | { kind: "new"; type: ExerciseType };

function setText(s: Partial<Entry>) {
  const parts: string[] = [];
  if (s.weight_kg != null) parts.push(`${s.weight_kg}kg`);
  if (s.reps != null) parts.push(`${s.reps}回`);
  if (s.duration_min != null) parts.push(`${s.duration_min}分`);
  if (s.distance_km != null) parts.push(`${s.distance_km}km`);
  return parts.join("×") || "—";
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function MenuImport({
  catalog,
  menu,
  recent,
  aiReady,
}: {
  catalog: Catalog;
  menu: Menu | null;
  recent: { name: string; sets: Partial<Entry>[] }[];
  /** アプリのAIが使える（キーが設定されている） */
  aiReady: boolean;
}) {
  const router = useRouter();
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<TextMenu | null>(null);
  const [name, setName] = useState("");
  const [choices, setChoices] = useState<Choice[]>([]);
  const [overwrite, setOverwrite] = useState(Boolean(menu));
  const [showPrompt, setShowPrompt] = useState(false);
  const [pending, startTransition] = useTransition();
  const [goal, setGoal] = useState<string>(MENU_GOALS[0]);
  const [minutes, setMinutes] = useState<number>(60);
  const [parts, setParts] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [aiComment, setAiComment] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [generating, startGenerate] = useTransition();
  const confirmRef = useRef<HTMLElement>(null);

  const prompt = useMemo(
    () =>
      buildMenuPrompt({
        exercises: catalog.exercises.map((e) => ({ name: e.name, type: e.type, excludesBar: e.excludesBar })),
        current: menu,
        recent,
      }),
    [catalog.exercises, menu, recent],
  );
  const byId = useMemo(() => new Map(catalog.exercises.map((e) => [e.id, e])), [catalog.exercises]);

  const copyPrompt = async () => {
    if (await copyText(prompt)) showToast("依頼文をコピーしました。AIに貼り付けてください");
    else {
      setShowPrompt(true);
      showToast("コピーできませんでした。下の依頼文を長押しでコピーしてください");
    }
  };

  const applyMenu = (m: TextMenu) => {
    setParsed(m);
    setName(m.name);
    setChoices(
      m.items.map((it): Choice => {
        const hit = matchExercise(it.exercise, catalog.exercises);
        return hit ? { kind: "existing", exerciseId: hit.id } : { kind: "new", type: guessType(it.sets) };
      }),
    );
    requestAnimationFrame(() => confirmRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const load = () => {
    setError(null);
    setAiComment(null);
    const r = parseMenuText(answer);
    if (!r.ok) {
      setParsed(null);
      return setError(r.error);
    }
    applyMenu(r.menu);
  };

  const generate = () =>
    startGenerate(async () => {
      setAiError(null);
      const r = await generateMenuAction({ goal, minutes, parts, note }, menu?.id ?? null).catch(() => null);
      if (!r) return setAiError("AIにつながりませんでした。時間をおいて試してください");
      if (!r.ok) return setAiError(r.error);
      setAiComment(r.comment);
      applyMenu(r.menu);
    });

  const chip = (on: boolean) => `rounded-full px-3 py-1.5 text-sm ${on ? "bg-accent font-medium text-accent-fg" : "border border-border"}`;

  const save = () =>
    startTransition(async () => {
      if (!parsed) return;
      // 一覧にない種目は自分の種目として作る（同じ名前があればそれを使う）
      const items: { exerciseId: string; sets: Partial<Entry>[] }[] = [];
      for (const [i, it] of parsed.items.entries()) {
        const c = choices[i];
        if (c.kind === "existing") {
          items.push({ exerciseId: c.exerciseId, sets: it.sets });
          continue;
        }
        const created = await createCustomExerciseAction(it.exercise, c.type);
        if (!created.ok) return showToast(`${it.exercise}: ${created.error}`);
        items.push({ exerciseId: created.exercise.id, sets: it.sets });
      }
      const result = await saveMenuAction(menu && overwrite ? menu.id : null, { name, items });
      if (!result.ok) return showToast(result.error);
      showToast(menu && overwrite ? "メニューを更新しました" : "メニューを登録しました");
      router.push(`/records/menus/${result.id}`);
      router.refresh();
    });

  const pasteSteps = (
    <>
      <section className="mx-4 rounded-xl border border-border bg-surface p-4">
        <h2 className="font-semibold">1. AIへの依頼文をコピー</h2>
        <p className="mt-1 text-sm text-muted">
          ふだん使っているAI（ChatGPT・Gemini など）でメニューを相談したあと、その会話に貼り付けてください。相談した内容を、このアプリで読み込める形で出してもらえます。
          {menu ? "今のメニューと前回の記録も入っています。" : ""}
        </p>
        <button type="button" onClick={() => void copyPrompt()} className="mt-3 w-full rounded-lg bg-accent py-2.5 text-sm font-semibold text-accent-fg">
          依頼文をコピー
        </button>
        <button type="button" onClick={() => setShowPrompt((v) => !v)} className="mt-2 text-xs text-muted">
          {showPrompt ? "依頼文を閉じる" : "依頼文の中身を見る"}
        </button>
        {showPrompt && (
          <textarea
            readOnly
            value={prompt}
            rows={10}
            aria-label="依頼文"
            onFocus={(e) => e.target.select()}
            className="mt-2 w-full rounded-lg border border-border bg-bg px-3 py-2 text-xs"
          />
        )}
      </section>

      <section className="mx-4 rounded-xl border border-border bg-surface p-4">
        <h2 className="font-semibold">2. AIの答えを貼り付け</h2>
        <p className="mt-1 text-sm text-muted">AIの答えを全部そのまま貼り付けて大丈夫です（説明文があっても読み取れます）。</p>
        <textarea
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          rows={6}
          aria-label="AIの答え"
          className="mt-2 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
        />
        {error && <p className="mt-1 text-sm text-danger">{error}</p>}
        <button
          type="button"
          disabled={!answer.trim()}
          onClick={load}
          className="mt-2 w-full rounded-lg border border-accent py-2.5 text-sm font-semibold text-accent disabled:opacity-50"
        >
          読み込む
        </button>
      </section>
    </>
  );

  return (
    <div className="space-y-4 pb-8">
      {aiReady && (
        <details className="mx-4 rounded-xl border border-border bg-surface">
          <summary className="cursor-pointer p-4 text-sm font-medium">ふだん使っているAI（ChatGPT など）で相談する</summary>
          <div className="space-y-4 pb-4 [&>section]:mx-0 [&>section]:border-0 [&>section]:py-0">{pasteSteps}</div>
        </details>
      )}

      {aiReady && (
        <section className="mx-4 rounded-xl border border-accent bg-surface p-4">
          <h2 className="font-semibold">{menu ? "アプリのAIに見直してもらう" : "アプリのAIに作ってもらう"}</h2>
          <p className="mt-1 text-sm text-muted">
            希望を選ぶと、ジムにある種目と最近の記録から{menu ? "今のメニューを見直します" : "メニューを作ります"}。登録の前に中身を確かめられます。
          </p>
          <fieldset className="mt-3">
            <legend className="text-sm font-medium">目的</legend>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {MENU_GOALS.map((g) => (
                <button key={g} type="button" aria-pressed={goal === g} onClick={() => setGoal(g)} className={chip(goal === g)}>
                  {g}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="mt-3">
            <legend className="text-sm font-medium">時間</legend>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {MENU_MINUTES.map((m) => (
                <button key={m} type="button" aria-pressed={minutes === m} onClick={() => setMinutes(m)} className={chip(minutes === m)}>
                  {m}分
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="mt-3">
            <legend className="text-sm font-medium">
              鍛えたい部位 <span className="text-xs font-normal text-muted">（任意・いくつでも）</span>
            </legend>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {catalog.bodyParts.map((p) => {
                const on = parts.includes(p.name);
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setParts((list) => (on ? list.filter((x) => x !== p.name) : [...list, p.name]))}
                    className={chip(on)}
                  >
                    {p.name}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <label className="mt-3 block space-y-1">
            <span className="text-sm font-medium">
              そのほかの希望 <span className="text-xs font-normal text-muted">（任意）</span>
            </span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={MENU_NOTE_MAX}
              rows={2}
              placeholder="例: マシンだけで / 最後に走りたい"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-base"
            />
          </label>
          {aiError && <p className="mt-2 text-sm text-danger">{aiError}</p>}
          <button
            type="button"
            disabled={generating}
            onClick={generate}
            className="mt-3 w-full rounded-lg bg-accent py-3 text-sm font-semibold text-accent-fg disabled:opacity-50"
          >
            {generating ? "AIが考えています…（10秒ほど）" : menu ? "見直してもらう" : "メニューを作ってもらう"}
          </button>
          <p className="mt-2 text-xs text-muted">名前は送りません。送るのは希望・種目・最近の記録の数字だけです。</p>
        </section>
      )}

      {!aiReady && pasteSteps}

      {parsed && (
        <section ref={confirmRef} className="mx-4 scroll-mt-4 rounded-xl border border-accent bg-surface p-4">
          <h2 className="font-semibold">{aiReady ? "確認して登録" : "3. 確認して登録"}</h2>
          {aiComment && <p className="mt-1 text-sm text-muted">{aiComment}</p>}
          <label className="mt-2 block space-y-1">
            <span className="text-sm font-medium">メニュー名</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-base"
            />
          </label>
          <ul className="mt-3 divide-y divide-border">
            {parsed.items.map((it, i) => {
              const c = choices[i];
              const matched = c.kind === "existing" ? byId.get(c.exerciseId) : null;
              return (
                <li key={i} className="py-2.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium">{matched?.name ?? it.exercise}</span>
                    {c.kind === "existing" && matched?.name === it.exercise ? (
                      <span className="shrink-0 text-xs text-accent">✓ 一覧の種目</span>
                    ) : null}
                  </div>
                  <p className="text-sm text-muted">{it.sets.length ? it.sets.map(setText).join("、") : "セットなし"}</p>
                  {(c.kind === "new" || matched?.name !== it.exercise) && (
                    <label className="mt-1.5 block space-y-1">
                      <span className="text-xs text-warn">
                        {c.kind === "new" ? `「${it.exercise}」は一覧にありません` : `「${it.exercise}」を次の種目として登録`}
                      </span>
                      <select
                        value={c.kind === "existing" ? c.exerciseId : `new:${c.type}`}
                        onChange={(e) => {
                          const v = e.target.value;
                          const next: Choice = v.startsWith("new:")
                            ? { kind: "new", type: v.slice(4) as ExerciseType }
                            : { kind: "existing", exerciseId: v };
                          setChoices((list) => list.map((x, k) => (k === i ? next : x)));
                        }}
                        className="w-full rounded-lg border border-border bg-surface px-2 py-2 text-sm"
                      >
                        <option value="new:weight">自分の種目として追加（重量系）</option>
                        <option value="new:cardio">自分の種目として追加（有酸素）</option>
                        {catalog.exercises.map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.name}
                            {e.custom ? "（自分の種目）" : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </li>
              );
            })}
          </ul>
          {menu && (
            <div className="mt-3 grid grid-cols-2 gap-2" role="radiogroup" aria-label="保存のしかた">
              {(
                [
                  [true, `「${menu.name}」を上書き`],
                  [false, "新しいメニューとして保存"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={String(value)}
                  type="button"
                  role="radio"
                  aria-checked={overwrite === value}
                  onClick={() => setOverwrite(value)}
                  className={`rounded-lg py-2 text-sm ${overwrite === value ? "border-2 border-accent font-medium" : "border border-border"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            disabled={pending || !name.trim()}
            onClick={save}
            className="mt-3 w-full rounded-lg bg-accent py-3 text-sm font-semibold text-accent-fg disabled:opacity-50"
          >
            {pending ? "登録中…" : menu && overwrite ? "メニューを更新する" : "メニューを登録する"}
          </button>
        </section>
      )}
    </div>
  );
}
