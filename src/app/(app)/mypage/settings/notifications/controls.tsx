"use client";

import { useEffect, useState, useTransition } from "react";
import {
  removePushSubscriptionAction,
  savePushSubscriptionAction,
  updateNotificationSettingAction,
  type NotificationSettingKey,
} from "@/app/actions/checkin";

type Settings = Record<NotificationSettingKey, boolean>;

const LABELS: { key: NotificationSettingKey; label: string; hint: string }[] = [
  { key: "check_in", label: "チェックイン通知", hint: "誰かがFitにチェックインしたとき（プッシュ + アプリ内）" },
  { key: "location_stale", label: "位置確認停止通知", hint: "チェックイン中に15分以上位置を確認できないとき（プッシュ + アプリ内）" },
  { key: "schedule", label: "予定関連アプリ内通知", hint: "予定への参加・キャンセル・変更・削除（アプリ内のみ）" },
];

export function SettingToggles({ initial }: { initial: Settings }) {
  const [settings, setSettings] = useState(initial);
  const [, startTransition] = useTransition();

  return (
    <ul className="divide-y divide-border">
      {LABELS.map(({ key, label, hint }) => (
        <li key={key} className="py-3">
          <label className="flex items-start justify-between gap-3">
            <span>
              <span className="block">{label}</span>
              <span className="block text-xs text-muted">{hint}</span>
            </span>
            <input
              type="checkbox"
              className="mt-1 h-5 w-5 accent-[var(--accent)]"
              checked={settings[key]}
              onChange={(e) => {
                const value = e.target.checked;
                setSettings((s) => ({ ...s, [key]: value }));
                startTransition(async () => {
                  const result = await updateNotificationSettingAction(key, value);
                  if (!result.ok) setSettings((s) => ({ ...s, [key]: !value }));
                });
              }}
            />
          </label>
        </li>
      ))}
    </ul>
  );
}

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

type PushState = "loading" | "unsupported" | "ios_needs_install" | "denied" | "off" | "on";

export function PushToggle({ vapidPublicKey }: { vapidPublicKey: string }) {
  const [state, setState] = useState<PushState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    (async () => {
      const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const standalone = window.matchMedia("(display-mode: standalone)").matches;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !vapidPublicKey) {
        setState(isIos && !standalone ? "ios_needs_install" : "unsupported");
        return;
      }
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })();
  }, [vapidPublicKey]);

  const enable = () =>
    startTransition(async () => {
      setError(null);
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") return setState(permission === "denied" ? "denied" : "off");
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        });
        const result = await savePushSubscriptionAction(JSON.parse(JSON.stringify(sub)));
        if (!result.ok) throw new Error();
        setState("on");
      } catch {
        setError("プッシュ通知を有効にできませんでした");
      }
    });

  const disable = () =>
    startTransition(async () => {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await removePushSubscriptionAction(sub.endpoint);
        await sub.unsubscribe();
      }
      setState("off");
    });

  const messages: Partial<Record<PushState, string>> = {
    loading: "確認中…",
    unsupported: "このブラウザはプッシュ通知に対応していません。",
    ios_needs_install: "iPhoneでは、Safariの共有メニューから「ホーム画面に追加」し、ホーム画面のアイコンから開くとプッシュ通知を使えます。",
    denied: "通知がブロックされています。端末・ブラウザの設定から通知を許可してください。",
  };

  return (
    <div className="space-y-2">
      {messages[state] && <p className="text-sm text-muted">{messages[state]}</p>}
      {(state === "off" || state === "on") && (
        <>
          <p className="text-sm">{state === "on" ? "この端末でプッシュ通知を受け取ります" : "この端末ではプッシュ通知を受け取っていません"}</p>
          <button
            type="button"
            disabled={pending}
            onClick={state === "on" ? disable : enable}
            className={`w-full rounded-lg px-4 py-2.5 font-medium disabled:opacity-50 ${state === "on" ? "border border-border" : "bg-accent text-accent-fg"}`}
          >
            {state === "on" ? "プッシュ通知をやめる" : "プッシュ通知を受け取る"}
          </button>
        </>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
