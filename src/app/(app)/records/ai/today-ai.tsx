"use client";

import { useEffect, useState, useTransition } from "react";
import { generateTodayMenuAction, type TodayProposal } from "@/app/actions/menu-ai";
import { saveMenuAction } from "@/app/actions/menus";
import { PageHeader } from "@/components/page";
import { showToast } from "@/components/toaster";
import { CONDITIONS, MENU_MINUTES, MENU_NOTE_MAX, type TodayRequest } from "@/lib/menus/generate";
import type { Entry } from "@/lib/records/format";
import type { Catalog } from "@/lib/records/queries";
import { SessionEditor, type MenuForEditor } from "../session-editor";

const PREFS_KEY = "condofit:today-ai";

function setText(s: Partial<Entry>) {
  const parts: string[] = [];
  if (s.weight_kg != null) parts.push(`${s.weight_kg}kg`);
  if (s.reps != null) parts.push(`${s.reps}回`);
  if (s.duration_min != null) parts.push(`${s.duration_min}分`);
  if (s.distance_km != null) parts.push(`${s.distance_km}km`);
  return parts.join("×") || "—";
}

/** 今日の調子・やりたい部位・時間を選ぶ → AIの案（いくつか）から選ぶ → そのまま記録（記録画面は同じ画面のまま切り替える） */
export function TodayAi({
  catalog,
  history,
  performedAt,
  checkedIn,
}: {
  catalog: Catalog;
  history: { recent: string[]; lastEntries: Record<string, Entry[]> };
  performedAt: string;
  checkedIn: boolean;
}) {
  const [condition, setCondition] = useState<TodayRequest["condition"]>("ふつう");
  const [minutes, setMinutes] = useState(60);
  const [parts, setParts] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [proposals, setProposals] = useState<TodayProposal[] | null>(null);
  const [saveAsMenu, setSaveAsMenu] = useState(false);
  const [started, setStarted] = useState<MenuForEditor | null>(null);
  const [pending, startTransition] = useTransition();

  // いつもの時間は端末に覚えておく
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const m = Number(JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}").minutes);
        if ((MENU_MINUTES as readonly number[]).includes(m)) setMinutes(m);
      } catch {
        // 覚えていなければ初期値のまま
      }
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const generate = () =>
    startTransition(async () => {
      setError(null);
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify({ minutes }));
      } catch {
        // 覚えられなくても続ける
      }
      const r = await generateTodayMenuAction({ condition, minutes, parts, note }).catch(() => null);
      if (!r) return setError("AIにつながりませんでした。時間をおいて試してください");
      if (!r.ok) return setError(r.error);
      setProposals(r.proposals);
      window.scrollTo({ top: 0 });
    });

  const start = (chosen: TodayProposal) =>
    startTransition(async () => {
      let menu = chosen.menu;
      if (saveAsMenu) {
        const r = await saveMenuAction(null, { name: menu.name, items: menu.items.map((it) => ({ exerciseId: it.exerciseId, sets: it.sets })) });
        if (!r.ok) return showToast(r.error);
        menu = { ...menu, id: r.id };
        showToast("メニューにも保存しました");
      }
      setStarted(menu);
      window.scrollTo({ top: 0 });
    });

  if (started) {
    return (
      <>
        <PageHeader title="メニューで記録" back="/records/start" />
        <SessionEditor
          sessionId={null}
          initialPerformedAt={performedAt}
          initialExercises={[]}
          catalog={catalog}
          recentExerciseIds={history.recent}
          lastEntries={history.lastEntries}
          menu={started}
          checkedIn={checkedIn}
        />
      </>
    );
  }

  const chip = (on: boolean) => `rounded-full px-3 py-1.5 text-sm ${on ? "bg-accent font-medium text-accent-fg" : "border border-border"}`;

  if (proposals) {
    return (
      <>
        <PageHeader title="今日のメニュー" back="/records/start" />
        <p className="px-4 pb-3 text-sm text-muted">
          {proposals.length > 1 ? `AIが${proposals.length}つの案を作りました。やりたい案を選んでください。` : "AIが案を作りました。"}
        </p>
        {proposals.map(({ menu, comment, dropped }, i) => (
          <section key={i} className="mx-4 mb-3 rounded-xl border border-border bg-surface p-4">
            <p className="text-xs font-medium text-accent">案{i + 1}</p>
            <h2 className="text-lg font-semibold">{menu.name}</h2>
            {comment && <p className="mt-1 text-sm text-muted">{comment}</p>}
            <ul className="mt-2 divide-y divide-border">
              {menu.items.map((it, k) => (
                <li key={k} className="flex items-baseline justify-between gap-3 py-2">
                  <span className="min-w-0 font-medium">{it.name}</span>
                  <span className="shrink-0 text-right text-sm text-muted">{it.sets.length ? it.sets.map(setText).join("、") : "セットなし"}</span>
                </li>
              ))}
            </ul>
            {dropped.length > 0 && <p className="mt-1 text-xs text-muted">ジムの種目にない「{dropped.join("」「")}」は外しました。</p>}
            <button
              type="button"
              disabled={pending}
              onClick={() => start(proposals[i])}
              className="mt-3 w-full rounded-lg bg-accent py-3 font-semibold text-accent-fg disabled:opacity-50"
            >
              この案で始める
            </button>
          </section>
        ))}
        <div className="mx-4 mb-6 space-y-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={saveAsMenu} onChange={(e) => setSaveAsMenu(e.target.checked)} className="h-4 w-4" />
            選んだ案をメニューにも保存する（次から「メニューから始める」で使える）
          </label>
          <p className="text-xs text-muted">重さが空の種目は、その場で決めて入れてください。始めてから種目の追加・削除もできます。</p>
          <button
            type="button"
            disabled={pending}
            onClick={() => setProposals(null)}
            className="w-full rounded-lg border border-border py-2.5 text-sm disabled:opacity-50"
          >
            条件を変えて作り直す
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="AIと相談して始める" back="/records/start" />
      <section className="mx-4 mb-4 rounded-xl border border-border bg-surface p-4">
        <p className="text-sm text-muted">今日のことを教えてください。最近の記録をもとに、AIが今日のメニューを作ります。</p>
        <fieldset className="mt-4">
          <legend className="text-sm font-medium">今日の調子は？</legend>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {CONDITIONS.map((c) => (
              <button key={c} type="button" aria-pressed={condition === c} onClick={() => setCondition(c)} className={chip(condition === c)}>
                {c}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset className="mt-4">
          <legend className="text-sm font-medium">
            やりたい部位はある？ <span className="text-xs font-normal text-muted">（いくつでも選べます）</span>
          </legend>
          <div className="mt-1.5 flex flex-wrap gap-2">
            <button type="button" aria-pressed={parts.length === 0} onClick={() => setParts([])} className={chip(parts.length === 0)}>
              おまかせ
            </button>
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
          <p className="mt-1 text-xs text-muted">おまかせなら、最近やっていない部位を中心にします。</p>
        </fieldset>
        <fieldset className="mt-4">
          <legend className="text-sm font-medium">時間は？</legend>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {MENU_MINUTES.map((m) => (
              <button key={m} type="button" aria-pressed={minutes === m} onClick={() => setMinutes(m)} className={chip(minutes === m)}>
                {m}分
              </button>
            ))}
          </div>
        </fieldset>
        <label className="mt-4 block space-y-1">
          <span className="text-sm font-medium">
            ひと言 <span className="text-xs font-normal text-muted">（任意）</span>
          </span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={MENU_NOTE_MAX}
            rows={2}
            placeholder="例: 最後に走りたい / ベンチプレスは混んでいる"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-base"
          />
        </label>
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
        <button
          type="button"
          disabled={pending}
          onClick={generate}
          className="mt-4 w-full rounded-lg bg-accent py-3 font-semibold text-accent-fg disabled:opacity-50"
        >
          {pending ? "AIが考えています…（10秒ほど）" : "今日のメニューの案を作ってもらう"}
        </button>
        <p className="mt-2 text-xs text-muted">名前は送りません。送るのは調子・希望・最近の記録の数字だけです。</p>
      </section>
    </>
  );
}
