"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

const HOLD_MS = 250; // 指はこの時間押し続けたら持ち上げる（マウスはすぐ）
const CANCEL_MOVE = 10; // 持ち上げる前にこれ以上動いたらやめる
const EDGE = 70; // 画面の上下の端に近づいたら自動でスクロール
const SCROLL_STEP = 12;

/**
 * つまみ（⠿）の長押しで行を持ち上げ、上下に動かして並べ替える。
 * 指の位置にある行の上半分なら前、下半分なら後ろへ動かす（onMove で並びを変える）。
 * 使い方: 行に ref={register(key)}、つまみに {...handleProps(key)}
 */
export function useLongPressSort(onMove: (fromKey: number, toKey: number, after: boolean) => void) {
  const elements = useRef(new Map<number, HTMLElement>());
  const [dragging, setDragging] = useState<number | null>(null);
  const draggingRef = useRef<number | null>(null);
  const press = useRef<{ key: number; x: number; y: number; timer: ReturnType<typeof setTimeout> | null } | null>(null);
  const lastY = useRef(0);
  const onMoveRef = useRef(onMove);
  useEffect(() => {
    onMoveRef.current = onMove;
  }, [onMove]);

  const register = useCallback(
    (key: number) => (el: HTMLElement | null) => {
      if (el) elements.current.set(key, el);
      else elements.current.delete(key);
    },
    [],
  );

  // 指の位置にある行を探して、その前・後ろへ動かす
  const follow = useCallback((y: number) => {
    const from = draggingRef.current;
    if (from === null) return;
    for (const [key, el] of elements.current) {
      if (key === from) continue;
      const r = el.getBoundingClientRect();
      if (y >= r.top && y <= r.bottom) {
        onMoveRef.current(from, key, y > r.top + r.height / 2);
        return;
      }
    }
  }, []);

  const stop = useCallback(() => {
    if (press.current?.timer) clearTimeout(press.current.timer);
    press.current = null;
    draggingRef.current = null;
    setDragging(null);
  }, []);

  // 持ち上げている間、画面の端に近ければスクロールし続ける
  useEffect(() => {
    if (dragging === null) return;
    const id = setInterval(() => {
      const y = lastY.current;
      const dy = y < EDGE ? -SCROLL_STEP : y > window.innerHeight - EDGE ? SCROLL_STEP : 0;
      if (dy) {
        window.scrollBy(0, dy);
        follow(y);
      }
    }, 16);
    return () => clearInterval(id);
  }, [dragging, follow]);

  const start = (key: number) => {
    draggingRef.current = key;
    setDragging(key);
    navigator.vibrate?.(15);
  };

  const handleProps = (key: number) => ({
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      try {
        e.currentTarget.setPointerCapture(e.pointerId); // 指がつまみから外れても動きを追う
      } catch {
        // 取れなくても並べ替えはできる
      }
      lastY.current = e.clientY;
      if (e.pointerType === "mouse") {
        press.current = { key, x: e.clientX, y: e.clientY, timer: null };
        start(key);
        return;
      }
      press.current = { key, x: e.clientX, y: e.clientY, timer: setTimeout(() => start(key), HOLD_MS) };
    },
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
      const p = press.current;
      if (!p) return;
      lastY.current = e.clientY;
      if (draggingRef.current === null) {
        if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > CANCEL_MOVE) stop();
        return;
      }
      e.preventDefault();
      follow(e.clientY);
    },
    onPointerUp: stop,
    onPointerCancel: stop,
    onContextMenu: (e: ReactPointerEvent<HTMLElement> | React.MouseEvent) => e.preventDefault(),
    style: { touchAction: "none" as const },
  });

  return { register, handleProps, dragging };
}
