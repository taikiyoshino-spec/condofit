"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { scaleAmount } from "@/lib/cook/amount";
import { findTimers, formatSeconds, ingredientsInStep, voiceCommand } from "@/lib/cook/cook-mode";
import type { RecipeIngredient } from "@/lib/cook/queries";

type Timer = { id: number; label: string; step: number; endsAt: number; done: boolean };
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start: () => void;
  stop: () => void;
};

function speechRecognition(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

let timerSeq = 1;

/**
 * 作るモード（D24）。1画面に1手順を大きく表示し、画面の右半分タップで次・左半分で前。
 * 調理中は画面を消さない、手順の時間からタイマー、音声で「次」「戻る」
 */
export function CookMode({
  recipeId,
  title,
  ingredients,
  steps,
  factor,
  people,
}: {
  recipeId: string;
  title: string;
  ingredients: RecipeIngredient[];
  steps: string[];
  factor: number;
  people: number | null;
}) {
  // 0 = 材料、1..steps.length = 手順、steps.length + 1 = できあがり。材料はレシピ画面で見ているので手順1から始める（手順1で「前」を押すと材料）
  const last = steps.length + 1;
  const [page, setPage] = useState(steps.length > 0 ? 1 : 0);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [timers, setTimers] = useState<Timer[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [voiceOn, setVoiceOn] = useState(false);
  const [voiceNote, setVoiceNote] = useState<string | null>(null);
  const [wakeLocked, setWakeLocked] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const audioRef = useRef<AudioContext | null>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const voiceOnRef = useRef(false);

  const go = useCallback((d: number) => setPage((p) => Math.min(last, Math.max(0, p + d))), [last]);

  // 画面を消さない（Wake Lock。画面に戻ったら取り直す。非対応なら何もしない）
  useEffect(() => {
    let lock: { release: () => Promise<void>; addEventListener: (t: string, f: () => void) => void } | null = null;
    let cancelled = false;
    const nav = navigator as unknown as { wakeLock?: { request: (t: "screen") => Promise<typeof lock> } };
    const acquire = async () => {
      if (!nav.wakeLock || document.visibilityState !== "visible") return;
      try {
        lock = await nav.wakeLock.request("screen");
        if (cancelled) return void lock?.release();
        setWakeLocked(true);
        lock?.addEventListener("release", () => setWakeLocked(false));
      } catch {
        setWakeLocked(false);
      }
    };
    void acquire();
    const onVisible = () => void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release();
    };
  }, []);

  // 音声認識が使える端末か（画面を出してから判定）
  useEffect(() => {
    const t = setTimeout(() => setSpeechSupported(speechRecognition() !== null), 0);
    return () => clearTimeout(t);
  }, []);

  // タイマー（1秒ごとに残りを更新し、終わったら音と振動）
  useEffect(() => {
    if (!timers.some((t) => !t.done)) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [timers]);
  useEffect(() => {
    const finished = timers.filter((t) => !t.done && t.endsAt <= now);
    if (finished.length === 0) return;
    const t = setTimeout(() => {
      setTimers((list) => list.map((x) => (finished.some((f) => f.id === x.id) ? { ...x, done: true } : x)));
      navigator.vibrate?.([400, 200, 400, 200, 400]);
      beep(audioRef.current);
    }, 0);
    return () => clearTimeout(t);
  }, [now, timers]);

  const startTimer = (label: string, seconds: number) => {
    // 音を鳴らせるよう、押したときに音声の準備をしておく（iPhone はユーザー操作の中でないと鳴らせない）
    if (!audioRef.current) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctx) audioRef.current = new Ctx();
    }
    void audioRef.current?.resume();
    setTimers((list) => [...list, { id: timerSeq++, label, step: page, endsAt: Date.now() + seconds * 1000, done: false }]);
  };

  // 音声で「次」「戻る」（オンの間だけマイクを使う。止まったら自動で聞き直す）
  const stopVoice = useCallback(() => {
    voiceOnRef.current = false;
    setVoiceOn(false);
    recRef.current?.stop();
    recRef.current = null;
  }, []);
  const startVoice = () => {
    const Rec = speechRecognition();
    if (!Rec) return;
    const rec = new Rec();
    rec.lang = "ja-JP";
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (!e.results[i].isFinal) continue;
        const words = e.results[i][0].transcript;
        const cmd = voiceCommand(words);
        setVoiceNote(cmd ? `「${words.trim()}」` : null);
        if (cmd === "next") go(1);
        else if (cmd === "prev") go(-1);
      }
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setVoiceNote("マイクを使えません（ブラウザの設定で許可してください）");
        stopVoice();
      }
    };
    rec.onend = () => {
      if (voiceOnRef.current) {
        try {
          rec.start();
        } catch {
          stopVoice();
        }
      }
    };
    recRef.current = rec;
    voiceOnRef.current = true;
    setVoiceOn(true);
    setVoiceNote("「次」「戻る」と話しかけてください");
    rec.start();
  };
  useEffect(() => () => stopVoice(), [stopVoice]);

  // キーボード（左右キー）でも進められる
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  const stepText = page >= 1 && page <= steps.length ? steps[page - 1] : null;
  const stepTimers = useMemo(() => (stepText ? findTimers(stepText) : []), [stepText]);
  const stepIngredients = useMemo(() => (stepText ? ingredientsInStep(stepText, ingredients) : []), [stepText, ingredients]);

  // 画面の左右どちらを押したかで前後に進む（ボタンなどを押したときは除く）
  const onTap = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button, a, input, label")) return;
    const rect = e.currentTarget.getBoundingClientRect();
    go(e.clientX - rect.left > rect.width / 2 ? 1 : -1);
  };

  return (
    <div className="theme-cook fixed inset-0 z-30 flex flex-col bg-bg text-fg">
      <header className="flex items-center gap-2 border-b border-border px-3 pb-2 pt-[calc(0.5rem+env(safe-area-inset-top))]">
        <Link href={`/cook/r/${recipeId}`} aria-label="作るモードを終わる" className="rounded p-2 text-muted">
          ✕
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{title}</p>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-border" aria-hidden>
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(page / last) * 100}%` }} />
          </div>
        </div>
        <span className="shrink-0 text-sm text-muted" aria-live="polite">
          {page === 0 ? "材料" : page === last ? "完成" : `${page}/${steps.length}`}
        </span>
        {speechSupported && (
          <button
            type="button"
            onClick={() => (voiceOn ? stopVoice() : startVoice())}
            aria-pressed={voiceOn}
            className={`shrink-0 rounded-full border px-2.5 py-1 text-xs ${voiceOn ? "border-accent bg-accent text-accent-fg" : "border-border text-muted"}`}
          >
            🎤 {voiceOn ? "オン" : "音声"}
          </button>
        )}
      </header>

      <div className="relative flex-1 overflow-y-auto" onClick={onTap}>
        <div className="min-h-full px-5 py-6">
          {page === 0 && (
            <section>
              <h2 className="mb-1 text-xl font-bold">材料{people ? `（${people}人分）` : ""}</h2>
              <p className="mb-3 text-xs text-muted">そろったものにチェック。画面の右側を押すと手順1に戻ります。</p>
              <ul className="divide-y divide-border">
                {ingredients.map((ing, i) => (
                  <li key={i}>
                    <label className="flex items-center gap-3 py-3 text-lg">
                      <input
                        type="checkbox"
                        checked={checked.has(i)}
                        onChange={() =>
                          setChecked((s) => {
                            const next = new Set(s);
                            if (next.has(i)) next.delete(i);
                            else next.add(i);
                            return next;
                          })
                        }
                        className="h-5 w-5"
                      />
                      <span className={`flex-1 ${checked.has(i) ? "text-muted line-through" : ""}`}>
                        {ing.section && <span className="mr-1 text-sm text-accent">[{ing.section}]</span>}
                        {ing.orPrevious && <span className="mr-1 text-sm font-semibold text-accent">または</span>}
                        {ing.name}
                      </span>
                      <span className="font-semibold">{scaleAmount(ing.amount, factor)}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {stepText !== null && (
            <section>
              <p className="mb-2 text-sm font-semibold text-accent">手順 {page}</p>
              <p className="whitespace-pre-wrap text-2xl font-medium leading-relaxed">{stepText}</p>
              {stepTimers.length > 0 && (
                <div className="mt-5 flex flex-wrap gap-2">
                  {stepTimers.map((t) => (
                    <button
                      key={t.seconds}
                      type="button"
                      onClick={() => startTimer(`手順${page}・${t.label}`, t.seconds)}
                      className="rounded-full bg-accent px-4 py-2.5 text-base font-semibold text-accent-fg"
                    >
                      ⏱ {t.label}のタイマー
                    </button>
                  ))}
                </div>
              )}
              {stepIngredients.length > 0 && (
                <div className="mt-6 rounded-xl border border-border bg-surface p-3">
                  <p className="mb-1 text-xs text-muted">この手順で使う材料</p>
                  <ul className="space-y-1">
                    {stepIngredients.map((ing, i) => (
                      <li key={i} className="flex justify-between gap-2 text-base">
                        <span>{ing.name}</span>
                        <span className="font-semibold">{scaleAmount(ing.amount, factor)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}

          {page === last && (
            <section className="pt-10 text-center">
              <p className="text-3xl font-bold">できあがり！</p>
              <p className="mt-2 text-muted">おつかれさまでした</p>
              <Link href={`/cook/r/${recipeId}?cooked=1`} className="mt-8 inline-block rounded-xl bg-accent px-6 py-3 font-semibold text-accent-fg">
                「作った！」を記録する
              </Link>
              <Link href={`/cook/r/${recipeId}`} className="mt-4 block text-sm text-muted underline">
                記録しないでレシピに戻る
              </Link>
            </section>
          )}
        </div>
      </div>

      {timers.length > 0 && (
        <div className="border-t border-border bg-surface px-3 py-2">
          <ul className="flex flex-wrap gap-2">
            {timers.map((t) => {
              const left = (t.endsAt - now) / 1000;
              return (
                <li
                  key={t.id}
                  className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-sm ${t.done ? "animate-pulse bg-danger text-white" : "border border-border"}`}
                >
                  <span className="max-w-[9rem] truncate">{t.label}</span>
                  <span className="font-mono font-semibold">{t.done ? "時間です" : formatSeconds(left)}</span>
                  <button type="button" aria-label="タイマーを消す" onClick={() => setTimers((list) => list.filter((x) => x.id !== t.id))} className="px-1">
                    ✕
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <footer className="flex items-center justify-between gap-2 border-t border-border px-3 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] text-xs text-muted">
        <button type="button" onClick={() => go(-1)} disabled={page === 0} className="rounded-lg border border-border px-4 py-2 text-sm disabled:opacity-30">
          ‹ 前
        </button>
        <span className="text-center">
          {voiceNote ?? "画面の右を押すと次、左で前"}
          {wakeLocked && <span className="block">画面は消えません</span>}
        </span>
        <button type="button" onClick={() => go(1)} disabled={page === last} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-fg disabled:opacity-30">
          次 ›
        </button>
      </footer>
    </div>
  );
}

/** 終了の音（ピピピ）。音声の準備ができていなければ鳴らさない（振動だけ） */
function beep(ctx: AudioContext | null) {
  if (!ctx) return;
  for (let i = 0; i < 3; i++) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.value = 0.2;
    osc.connect(gain).connect(ctx.destination);
    const at = ctx.currentTime + i * 0.35;
    osc.start(at);
    osc.stop(at + 0.2);
  }
}
