"use client";

import { Avatar, useProfile } from "@/components/avatar";

/** レシピの作成者（アイコン＋名前。名前はメンバー一覧から引く） */
export function Owner({ userId, size = 18, className = "" }: { userId: string; size?: number; className?: string }) {
  const name = useProfile(userId)?.displayName ?? "";
  return (
    <span className={`inline-flex min-w-0 items-center gap-1.5 ${className}`}>
      <Avatar userId={userId} name={name} size={size} />
      <span className="truncate">{name}</span>
    </span>
  );
}
