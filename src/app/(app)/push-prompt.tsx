"use client";

import { useEffect, useState, useTransition } from "react";
import { showToast } from "@/components/toaster";
import { enablePush, hasDeviceSubscription, pushSupported } from "@/lib/client/push";

// プッシュ通知のおすすめ。この端末で通知を受け取る登録をしていない人に出す。
// 「閉じる」はログインごとのセッションIDと結び付けて覚えるので、再ログインするとまた出る。
// 通知に対応していない環境（iPhoneのSafariなど）や、通知をブロックしている端末では出さない。

const KEY = "condofit:push-prompt-dismissed";

function dismissedFor(sessionId: string) {
  try {
    return Boolean(sessionId) && localStorage.getItem(KEY) === sessionId;
  } catch {
    return false;
  }
}

export function PushPrompt({ vapidPublicKey, sessionId }: { vapidPublicKey: string; sessionId: string }) {
  const [visible, setVisible] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!pushSupported(vapidPublicKey) || Notification.permission === "denied" || dismissedFor(sessionId)) return;
      const subscribed = await hasDeviceSubscription().catch(() => true);
      if (!cancelled && !subscribed) setVisible(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [vapidPublicKey, sessionId]);

  if (!visible) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(KEY, sessionId);
    } catch {
      // 保存できない環境ではこの画面の間だけ消える
    }
    setVisible(false);
  };

  return (
    <section className="mx-4 mb-4 rounded-xl border border-accent bg-surface p-4" aria-label="プッシュ通知のおすすめ">
      <div className="flex items-start gap-3">
        <span aria-hidden className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0" />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">プッシュ通知をオンにしよう</h2>
          <p className="mt-0.5 text-sm text-muted">誰かがFitにチェックインしたら、すぐに分かります。</p>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={dismiss} className="flex-1 rounded-lg border border-border py-2 text-sm">
          閉じる
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              try {
                const result = await enablePush(vapidPublicKey);
                if (result === "on") {
                  showToast("プッシュ通知をオンにしました");
                  setVisible(false);
                } else if (result === "denied") {
                  showToast("通知がブロックされました。端末の設定から許可できます");
                  setVisible(false);
                }
              } catch {
                showToast("プッシュ通知をオンにできませんでした");
              }
            })
          }
          className="flex-1 rounded-lg bg-accent py-2 text-sm font-medium text-accent-fg disabled:opacity-50"
        >
          {pending ? "設定中…" : "通知を受け取る"}
        </button>
      </div>
      <p className="mt-2 text-xs text-muted">あとからマイページ → 設定 → 通知設定でも変えられます。</p>
    </section>
  );
}
