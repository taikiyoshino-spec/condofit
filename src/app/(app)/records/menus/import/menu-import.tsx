"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveMenuAction } from "@/app/actions/menus";
import { createCustomExerciseAction } from "@/app/actions/custom-exercises";
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
}: {
  catalog: Catalog;
  menu: Menu | null;
  recent: { name: string; sets: Partial<Entry>[] }[];
}) {
  const router = useRouter();
  const [request, setRequest] = useState("");
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<TextMenu | null>(null);
  const [name, setName] = useState("");
  const [choices, setChoices] = useState<Choice[]>([]);
  const [overwrite, setOverwrite] = useState(Boolean(menu));
  const [showPrompt, setShowPrompt] = useState(false);
  const [pending, startTransition] = useTransition();

  const prompt = useMemo(
    () =>
      buildMenuPrompt({
        exercises: catalog.exercises.map((e) => ({ name: e.name, type: e.type, excludesBar: e.excludesBar })),
        request,
        current: menu,
        recent,
      }),
    [catalog.exercises, request, menu, recent],
  );
  const byId = useMemo(() => new Map(catalog.exercises.map((e) => [e.id, e])), [catalog.exercises]);

  const copyPrompt = async () => {
    if (await copyText(prompt)) showToast("相談文をコピーしました。AIに貼り付けてください");
    else {
      setShowPrompt(true);
      showToast("コピーできませんでした。下の相談文を長押しでコピーしてください");
    }
  };

  const load = () => {
    setError(null);
    const r = parseMenuText(answer);
    if (!r.ok) {
      setParsed(null);
      return setError(r.error);
    }
    setParsed(r.menu);
    setName(r.menu.name);
    setChoices(
      r.menu.items.map((it): Choice => {
        const hit = matchExercise(it.exercise, catalog.exercises);
        return hit ? { kind: "existing", exerciseId: hit.id } : { kind: "new", type: guessType(it.sets) };
      }),
    );
  };

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

  return (
    <div className="space-y-4 pb-8">
      <section className="mx-4 rounded-xl border border-border bg-surface p-4">
        <h2 className="font-semibold">1. AIへの相談文をコピー</h2>
        <p className="mt-1 text-sm text-muted">
          {menu
            ? "今のメニューと前回の記録、使える種目の一覧、答えの形の指定が入っています。"
            : "使える種目の一覧と、答えの形の指定が入っています。"}
          ふだん使っているAI（ChatGPT・Gemini など）に貼り付けてください。
        </p>
        <label className="mt-3 block space-y-1">
          <span className="text-sm font-medium">相談したいこと（任意）</span>
          <textarea
            value={request}
            onChange={(e) => setRequest(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="例：週2回・1時間で、胸と背中を中心に。腰に不安あり"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-base"
          />
        </label>
        <button type="button" onClick={() => void copyPrompt()} className="mt-2 w-full rounded-lg bg-accent py-2.5 text-sm font-semibold text-accent-fg">
          相談文をコピー
        </button>
        <button type="button" onClick={() => setShowPrompt((v) => !v)} className="mt-2 text-xs text-muted">
          {showPrompt ? "相談文を閉じる" : "相談文の中身を見る"}
        </button>
        {showPrompt && (
          <textarea
            readOnly
            value={prompt}
            rows={10}
            aria-label="相談文"
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

      {parsed && (
        <section className="mx-4 rounded-xl border border-accent bg-surface p-4">
          <h2 className="font-semibold">3. 確認して登録</h2>
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
