// この端末の Web Push 登録（通知設定画面とホームの案内で共通）
import { savePushSubscriptionAction } from "@/app/actions/checkin";

export function pushSupported(vapidPublicKey: string): boolean {
  return Boolean(vapidPublicKey) && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** この端末で通知を受け取る登録が済んでいるか */
export async function hasDeviceSubscription(): Promise<boolean> {
  const reg = await navigator.serviceWorker.ready;
  return (await reg.pushManager.getSubscription()) !== null;
}

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** 通知の許可を求め、この端末を登録する。失敗時は例外 */
export async function enablePush(vapidPublicKey: string): Promise<"on" | "denied" | "off"> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "off";
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
  });
  const result = await savePushSubscriptionAction(JSON.parse(JSON.stringify(sub)));
  if (!result.ok) throw new Error("save failed");
  return "on";
}
