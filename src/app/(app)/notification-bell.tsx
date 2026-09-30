"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { BottomSheet } from "@/components/bottom-sheet";
import { createClient } from "@/lib/supabase/client";
import { formatNotification, type NotificationRow } from "@/lib/notifications/format";
import { relativeMinutes } from "@/lib/client/time";

async function fetchNotifications(): Promise<NotificationRow[]> {
  const supabase = createClient();
  // RLS により自分宛て・7日以内（期限内）のみ返る
  const { data } = await supabase
    .from("notifications")
    .select("id, type, payload, created_at, read_at, actor_user_id, actor:users!notifications_actor_user_id_fkey(display_name)")
    .order("created_at", { ascending: false })
    .limit(100);
  return (data ?? []).map((n) => ({
    id: n.id as string,
    type: n.type as string,
    payload: (n.payload ?? {}) as Record<string, unknown>,
    createdAt: n.created_at as string,
    readAt: n.read_at as string | null,
    actorId: (n.actor_user_id as string | null) ?? null,
    actorName: (n.actor as unknown as { display_name: string } | null)?.display_name ?? null,
  }));
}

export function NotificationBell({ myId }: { myId: string }) {
  const router = useRouter();
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const unread = items.filter((n) => !n.readAt).length;

  const refresh = useCallback(async () => {
    setItems(await fetchNotifications());
    setNow(Date.now());
  }, []);

  useEffect(() => {
    const supabase = createClient();
    const initial = setTimeout(() => void refresh(), 0);
    const channel = supabase
      .channel(`bell:${myId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `recipient_user_id=eq.${myId}` },
        () => void refresh(),
      )
      .subscribe();
    return () => {
      clearTimeout(initial);
      void supabase.removeChannel(channel);
    };
  }, [myId, refresh]);

  const markRead = async (ids: string[]) => {
    if (ids.length === 0) return;
    const readAt = new Date().toISOString();
    setItems((list) => list.map((n) => (ids.includes(n.id) ? { ...n, readAt } : n)));
    await createClient().from("notifications").update({ read_at: readAt }).in("id", ids);
  };

  const markAllRead = async () => {
    const readAt = new Date().toISOString();
    setItems((list) => list.map((n) => ({ ...n, readAt: n.readAt ?? readAt })));
    await createClient().rpc("mark_all_notifications_read");
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setNow(Date.now());
          setOpen(true);
        }}
        aria-label={unread ? `通知 未読${unread}件` : "通知"}
        className="relative rounded-full p-2"
      >
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      <BottomSheet open={open} onClose={() => setOpen(false)} title="通知">
        {items.length === 0 ? (
          <p className="text-sm text-muted">通知はありません（7日間保持されます）</p>
        ) : (
          <>
            <div className="mb-2 flex justify-end">
              <button type="button" onClick={markAllRead} disabled={unread === 0} className="text-sm text-accent disabled:text-muted">
                すべて既読
              </button>
            </div>
            <ul className="divide-y divide-border">
              {items.map((n) => {
                const f = formatNotification(n);
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      className="flex w-full items-start gap-2 py-3 text-left"
                      onClick={() => {
                        void markRead([n.id]);
                        setOpen(false);
                        router.push(f.href);
                      }}
                    >
                      <span
                        aria-label={n.readAt ? "既読" : "未読"}
                        className={`mt-3 h-2 w-2 shrink-0 rounded-full ${n.readAt ? "bg-transparent" : "bg-accent"}`}
                      />
                      {n.actorId ? (
                        <Avatar userId={n.actorId} name={n.actorName ?? ""} size={32} />
                      ) : (
                        <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-warn/20 text-warn">
                          !
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className={`block text-sm ${n.readAt ? "text-muted" : ""}`}>{f.text}</span>
                        {f.sub && <span className="block text-sm text-muted">{f.sub}</span>}
                        <span className="block text-xs text-muted">{relativeMinutes(n.createdAt, now)}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </BottomSheet>
    </>
  );
}
