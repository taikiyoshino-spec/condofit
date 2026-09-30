"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { showToast } from "@/components/toaster";
import { avatarUrl } from "@/lib/avatar";
import { rememberAccount, toThumbnail } from "@/lib/client/device-accounts";

type Props = { myId: string; myName: string; myAvatarPath: string | null };

/** アプリ共通の常駐処理: 端末へのアカウント記憶、Service Worker 登録、アプリを開いている間のチェックイン通知トースト */
export function AppEffects({ myId, myName, myAvatarPath }: Props) {
  // この端末でログインした人として覚える（ログイン画面で選べるように。サーバーには送らない）
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const url = avatarUrl(myId, myAvatarPath);
      const thumb = url ? await toThumbnail(url) : null;
      if (!cancelled) rememberAccount({ userId: myId, displayName: myName, thumb });
    })();
    return () => {
      cancelled = true;
    };
  }, [myId, myName, myAvatarPath]);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
    }
  }, []);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`notifications:${myId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `recipient_user_id=eq.${myId}` },
        async (payload) => {
          const n = payload.new as { type: string; actor_user_id: string | null };
          if (n.type !== "check_in" || !n.actor_user_id) return;
          const { data } = await supabase.from("users").select("display_name").eq("id", n.actor_user_id).maybeSingle();
          if (data) showToast(`${data.display_name}さんがFitにチェックインしました`);
        },
      )
      .subscribe();
    return () => void supabase.removeChannel(channel);
  }, [myId]);

  return null;
}
