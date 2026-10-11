"use client";

import { useEffect, useRef, useState, type ReactNode, type TouchEvent } from "react";
import { shouldDismissSheet } from "@/lib/client/swipe";

/**
 * 下から出るシート。背景タップ・Escキー・下にスライドで閉じる。
 * 中身をスクロールしている途中では閉じない（いちばん上までスクロールした状態から下に引いたときだけ）。
 */
export function BottomSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startY: number; startAt: number; active: boolean } | null>(null);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const onTouchStart = (e: TouchEvent) => {
    if (e.touches.length !== 1) return;
    // 入力欄の上で始めた操作はスライドにしない
    if ((e.target as HTMLElement).closest("input, textarea, select")) return;
    drag.current = { startY: e.touches[0].clientY, startAt: Date.now(), active: false };
  };

  const onTouchMove = (e: TouchEvent) => {
    const d = drag.current;
    if (!d) return;
    const dy = e.touches[0].clientY - d.startY;
    // 中身がいちばん上にあるときに下へ引いたときだけ、シートを動かす
    if (!d.active) {
      if (dy <= 0 || (sheetRef.current?.scrollTop ?? 0) > 0) return;
      d.active = true;
    }
    setOffset(Math.max(0, dy));
  };

  const onTouchEnd = (e: TouchEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d?.active) return;
    const dy = e.changedTouches[0].clientY - d.startY;
    if (shouldDismissSheet(dy, Date.now() - d.startAt)) {
      setOffset(0);
      onClose();
    } else {
      setOffset(0);
    }
  };

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center" role="dialog" aria-modal="true" aria-label={title}>
      <button
        type="button"
        aria-label="閉じる"
        className="absolute inset-0 bg-black/40"
        style={{ opacity: offset ? Math.max(0.3, 1 - offset / 300) : undefined }}
        onClick={onClose}
      />
      <div
        ref={sheetRef}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={() => {
          drag.current = null;
          setOffset(0);
        }}
        style={{
          transform: offset ? `translateY(${offset}px)` : undefined,
          transition: offset ? "none" : "transform 180ms ease-out",
        }}
        className="relative max-h-[80vh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-t-2xl bg-surface p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
      >
        <div className="-mx-4 -mt-4 mb-1 flex justify-center pb-2 pt-3" aria-hidden>
          <div className="h-1.5 w-10 rounded-full bg-border" />
        </div>
        <h2 className="mb-3 font-semibold">{title}</h2>
        {children}
      </div>
    </div>
  );
}
