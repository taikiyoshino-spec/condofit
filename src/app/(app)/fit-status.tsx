"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { checkInAction, checkOutAction, verifyLocationAction } from "@/app/actions/checkin";
import { Avatar } from "@/components/avatar";
import { BottomSheet } from "@/components/bottom-sheet";
import { showToast } from "@/components/toaster";
import { createClient } from "@/lib/supabase/client";
import { geolocationMessage, getPosition } from "@/lib/client/geolocation";
import { minutesSince, relativeMinutes, STALE_MINUTES } from "@/lib/client/time";
import type { ActiveCheckIn } from "@/lib/checkin/service";

const VERIFY_INTERVAL_MS = 60_000;
const INTERACTION_THROTTLE_MS = 30_000;

const CHECK_IN_ERRORS = {
  gym_not_configured: "店舗の位置が未設定のためチェックインできません。管理者に連絡してください",
  invalid_position: "位置情報を取得できませんでした。もう一度お試しください",
  too_far: "Fitから50m以内でチェックインできます",
  error: "チェックインに失敗しました。もう一度お試しください",
} as const;

async function fetchActive(): Promise<ActiveCheckIn[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("check_ins")
    .select("user_id, checked_in_at, last_location_verified_at, users!inner(display_name)")
    .eq("status", "active")
    .order("checked_in_at");
  return (data ?? []).map((c) => ({
    userId: c.user_id as string,
    displayName: (c.users as unknown as { display_name: string }).display_name,
    checkedInAt: c.checked_in_at as string,
    lastVerifiedAt: c.last_location_verified_at as string,
  }));
}

export function FitStatus({ initial, myId }: { initial: ActiveCheckIn[]; myId: string }) {
  const searchParams = useSearchParams();
  const [active, setActive] = useState(initial);
  const [sheetOpen, setSheetOpen] = useState(searchParams.get("fit") === "1");
  const [now, setNow] = useState(() => Date.now());
  const [locationNote, setLocationNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const lastVerifyRef = useRef(0);

  const me = active.find((c) => c.userId === myId);
  const checkedIn = Boolean(me);

  const refresh = useCallback(async () => setActive(await fetchActive()), []);

  // 他メンバーのチェックイン・位置確認をリアルタイム反映
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("check_ins")
      .on("postgres_changes", { event: "*", schema: "public", table: "check_ins" }, () => void refresh())
      .subscribe();
    return () => void supabase.removeChannel(channel);
  }, [refresh]);

  // 「N分前」の表示更新
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // チェックイン中: アプリを開いている/操作したときに位置を再確認する（自動チェックアウトはしない）
  const verify = useCallback(async () => {
    if (Date.now() - lastVerifyRef.current < INTERACTION_THROTTLE_MS) return;
    lastVerifyRef.current = Date.now();
    try {
      const result = await verifyLocationAction(await getPosition({ fresh: false }));
      if (result.status === "verified") {
        setLocationNote(null);
        await refresh();
      } else if (result.status === "out_of_range") {
        setLocationNote("Fitの近くで位置を確認できませんでした。Fitを出たらチェックアウトしてください");
      }
    } catch (e) {
      setLocationNote(geolocationMessage(e));
    }
  }, [refresh]);

  useEffect(() => {
    if (!checkedIn) return;
    const onVisible = () => document.visibilityState === "visible" && void verify();
    const onInteract = () => void verify();
    // 画面を開いた直後にも1回確認する
    const initial = setTimeout(() => void verify(), 0);
    const id = setInterval(() => document.visibilityState === "visible" && void verify(), VERIFY_INTERVAL_MS);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pointerdown", onInteract);
    return () => {
      clearTimeout(initial);
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pointerdown", onInteract);
    };
  }, [checkedIn, verify]);

  const handleCheckIn = () =>
    startTransition(async () => {
      try {
        const result = await checkInAction(await getPosition({ fresh: true }));
        if (result.ok) {
          lastVerifyRef.current = Date.now();
          setLocationNote(null);
          showToast("チェックインしました");
          await refresh();
        } else {
          showToast(CHECK_IN_ERRORS[result.reason]);
        }
      } catch (e) {
        showToast(geolocationMessage(e));
      }
    });

  const handleCheckOut = () =>
    startTransition(async () => {
      const result = await checkOutAction();
      showToast(result.ok ? "チェックアウトしました" : "チェックアウトに失敗しました");
      await refresh();
    });

  const myStale = me ? minutesSince(me.lastVerifiedAt, now) >= STALE_MINUTES : false;

  return (
    <section className="mx-4 mb-4 rounded-xl border border-border bg-surface p-4">
      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        className="flex w-full items-center justify-between text-left"
        aria-haspopup="dialog"
      >
        <span className="text-lg font-semibold">
          <span aria-hidden>{active.length > 0 ? "🟢" : "⚪"}</span> Fit中 {active.length}人
        </span>
        <span className="text-sm text-muted">詳細 ›</span>
      </button>

      <div className="mt-3">
        {checkedIn ? (
          <div className="space-y-2">
            <p className="text-sm">
              チェックイン中
              {myStale && <span className="ml-2 text-warn">⚠ 位置情報を確認できていません</span>}
            </p>
            {locationNote && <p className="text-xs text-muted">{locationNote}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  lastVerifyRef.current = 0;
                  void verify();
                }}
                disabled={pending}
                className="flex-1 rounded-lg border border-border px-3 py-2 text-sm"
              >
                位置を再確認
              </button>
              <button
                type="button"
                onClick={handleCheckOut}
                disabled={pending}
                className="flex-1 rounded-lg border border-border px-3 py-2 text-sm font-medium"
              >
                チェックアウト
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleCheckIn}
            disabled={pending}
            className="w-full rounded-lg bg-accent px-4 py-2.5 font-medium text-accent-fg disabled:opacity-50"
          >
            {pending ? "位置を確認中…" : "チェックイン"}
          </button>
        )}
      </div>

      <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title={`Fit中 ${active.length}人`}>
        {active.length === 0 ? (
          <p className="text-sm text-muted">いまFitにいる人はいません</p>
        ) : (
          <ul className="divide-y divide-border">
            {active.map((c) => {
              const stale = minutesSince(c.lastVerifiedAt, now) >= STALE_MINUTES;
              return (
                <li key={c.userId} className="flex items-center justify-between gap-2 py-2.5">
                  <span className="flex min-w-0 items-center gap-2 font-medium">
                    <Avatar userId={c.userId} name={c.displayName} size={32} />
                    <span className="truncate">{c.displayName}</span>
                    {c.userId === myId && <span className="shrink-0 text-xs text-muted">（自分）</span>}
                  </span>
                  <span className={`text-sm ${stale ? "text-warn" : "text-muted"}`}>
                    {stale && "⚠ "}
                    {relativeMinutes(c.lastVerifiedAt, now)}に位置情報確認
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </BottomSheet>
    </section>
  );
}
