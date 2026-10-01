"use client";

import { useEffect, useState } from "react";

// ホーム画面へのインストール案内。
// - インストール済み（ホーム画面から起動）なら出さない
// - Android/Chrome: beforeinstallprompt を受け取れたときだけ「インストール」ボタン（インストール済みなら発火しない）
// - iPhone/iPad の Safari: 手順を案内（Safari からはインストール済みか判定できないため「追加した」で消せる）
// 表示状態はこの端末の localStorage にだけ保存する

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const KEY = "condofit:install-prompt";
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

type Saved = { installed?: boolean; snoozedUntil?: number };

function load(): Saved {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Saved;
  } catch {
    return {};
  }
}

function save(v: Saved) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...load(), ...v }));
  } catch {
    // 保存できない環境では毎回表示される（閉じるとその場では消える）
  }
}

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos() {
  const ua = navigator.userAgent;
  // iPadOS は Mac として名乗るため、タッチ対応で判定する
  return /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
}

type Mode = "hidden" | "android" | "ios";

export function InstallPrompt() {
  const [mode, setMode] = useState<Mode>("hidden");
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (isStandalone()) {
      save({ installed: true });
      return;
    }
    const saved = load();
    const snoozed = (saved.snoozedUntil ?? 0) > Date.now();

    const onBeforeInstall = (e: Event) => {
      e.preventDefault(); // ブラウザ標準のミニバーを出さず、こちらのカードから案内する
      setDeferred(e as BeforeInstallPromptEvent);
      if (!snoozed) setMode("android");
    };
    const onInstalled = () => {
      save({ installed: true });
      setMode("hidden");
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);

    // iOS は beforeinstallprompt が無いので手順を案内する（「追加した」を押した端末では出さない）
    const timer = setTimeout(() => {
      if (isIos() && !saved.installed && !snoozed) setMode("ios");
    }, 0);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (mode === "hidden") return null;

  const snooze = () => {
    save({ snoozedUntil: Date.now() + SNOOZE_MS });
    setMode("hidden");
  };

  return (
    <section className="mx-4 mb-4 rounded-xl border border-accent bg-surface p-4" aria-label="アプリのインストール">
      <div className="flex items-start gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- 静的な小さいアイコン */}
        <img src="/icons/icon-192.png" alt="" width={44} height={44} className="shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">ホーム画面に追加しよう</h2>
          <p className="mt-0.5 text-sm text-muted">
            アプリのように1タップで開けて、チェックインのプッシュ通知も受け取れます。
          </p>
        </div>
      </div>

      {mode === "android" && (
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={snooze} className="flex-1 rounded-lg border border-border py-2 text-sm">
            あとで
          </button>
          <button
            type="button"
            onClick={async () => {
              if (!deferred) return;
              await deferred.prompt();
              const { outcome } = await deferred.userChoice;
              setDeferred(null);
              if (outcome === "accepted") {
                save({ installed: true });
                setMode("hidden");
              }
            }}
            className="flex-1 rounded-lg bg-accent py-2 text-sm font-medium text-accent-fg"
          >
            インストール
          </button>
        </div>
      )}

      {mode === "ios" && (
        <>
          <ol className="mt-3 space-y-2 text-sm">
            <li className="flex items-center gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-fg">1</span>
              <span>
                Safariの下にある共有ボタン
                <ShareIcon />
                を押す
              </span>
            </li>
            <li className="flex items-center gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-fg">2</span>
              <span>「ホーム画面に追加」を選ぶ</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-fg">3</span>
              <span>ホーム画面のCondoFitから開く</span>
            </li>
          </ol>
          <p className="mt-2 text-xs text-muted">Safari以外のブラウザでは追加できないことがあります。</p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={snooze} className="flex-1 rounded-lg border border-border py-2 text-sm">
              あとで
            </button>
            <button
              type="button"
              onClick={() => {
                save({ installed: true });
                setMode("hidden");
              }}
              className="flex-1 rounded-lg border border-accent py-2 text-sm font-medium text-accent"
            >
              追加した
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" className="mx-1 inline h-4 w-4 align-[-2px] text-[#2563eb]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" role="img" aria-label="共有">
      <path d="M12 3v12M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
    </svg>
  );
}
