// CondoFit・CondoCook 共通の Service Worker: Web Push の受信と通知タップ時の遷移のみ（オフラインキャッシュはしない）
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  // CondoCook の通知（/cook へ移るもの）は CondoCook のアイコンで出す
  const cook = typeof data.url === "string" && data.url.startsWith("/cook");
  const icon = cook ? "/icons/cook-192.png" : "/icons/icon-192.png";
  event.waitUntil(
    self.registration.showNotification(data.title || (cook ? "CondoCook" : "CondoFit"), {
      body: data.body || "",
      icon,
      badge: icon,
      tag: data.tag,
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.startsWith(self.location.origin) && "focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
