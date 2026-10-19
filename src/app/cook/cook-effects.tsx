"use client";

import { useEffect } from "react";

/** CondoCook だけを開いた端末でもプッシュ通知を受け取れるように、Service Worker を登録する（CondoFit と共通） */
export function CookEffects() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
    }
  }, []);
  return null;
}
