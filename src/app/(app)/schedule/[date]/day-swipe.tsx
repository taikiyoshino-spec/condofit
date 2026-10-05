"use client";

import { useEffect, useRef, useState, type ReactNode, type TouchEvent } from "react";
import { useRouter } from "next/navigation";
import { swipeDirection } from "@/lib/client/swipe";

/**
 * 日別画面の左右スワイプ: 左へ → 翌日、右へ → 前日。
 * 入力欄の上で始めた操作や、縦スクロールに近い動きでは移動しない。
 * 履歴は置き換えるので、何日分移動しても「戻る」でカレンダーに戻れる。
 */
export function DaySwipe({ prevHref, nextHref, children }: { prevHref: string; nextHref: string; children: ReactNode }) {
  const router = useRouter();
  const start = useRef<{ x: number; y: number } | null>(null);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    router.prefetch(prevHref);
    router.prefetch(nextHref);
  }, [router, prevHref, nextHref]);

  const onTouchStart = (e: TouchEvent) => {
    const target = e.target as HTMLElement;
    if (e.touches.length !== 1 || target.closest("input, textarea, select, [data-no-swipe]")) {
      start.current = null;
      return;
    }
    start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };

  const onTouchMove = (e: TouchEvent) => {
    if (!start.current) return;
    const dx = e.touches[0].clientX - start.current.x;
    const dy = e.touches[0].clientY - start.current.y;
    // 横に動かしている間だけ、少しだけ画面をずらして反応を見せる
    setOffset(Math.abs(dx) > Math.abs(dy) ? Math.max(-40, Math.min(40, dx / 3)) : 0);
  };

  const onTouchEnd = (e: TouchEvent) => {
    const s = start.current;
    start.current = null;
    setOffset(0);
    if (!s) return;
    const t = e.changedTouches[0];
    const dir = swipeDirection(t.clientX - s.x, t.clientY - s.y);
    if (dir === "left") router.replace(nextHref, { scroll: true });
    else if (dir === "right") router.replace(prevHref, { scroll: true });
  };

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={() => {
        start.current = null;
        setOffset(0);
      }}
      style={{ transform: offset ? `translateX(${offset}px)` : undefined, transition: offset ? "none" : "transform 150ms ease-out" }}
      className="min-h-[60vh] touch-pan-y"
    >
      {children}
    </div>
  );
}
