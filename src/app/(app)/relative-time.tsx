"use client";

import { useEffect, useState } from "react";
import { relativeMinutes } from "@/lib/client/time";

/** 相対時刻（サーバーとクライアントの時刻差でずれないよう、表示はマウント後に確定） */
export function RelativeTime({ iso, className }: { iso: string; className?: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const initial = setTimeout(() => setNow(Date.now()), 0);
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => {
      clearTimeout(initial);
      clearInterval(id);
    };
  }, []);
  return (
    <time dateTime={iso} className={className}>
      {now === null ? "" : relativeMinutes(iso, now)}
    </time>
  );
}
