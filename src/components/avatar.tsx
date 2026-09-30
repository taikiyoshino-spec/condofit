"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { avatarUrl, colorFor, initialOf } from "@/lib/avatar";

export type Profile = { id: string; displayName: string; avatarPath: string | null };

const MembersContext = createContext<Map<string, Profile>>(new Map());

/** メンバーのプロフィール（表示名・画像）をアプリ全体に配る */
export function MembersProvider({ profiles, children }: { profiles: Profile[]; children: ReactNode }) {
  const map = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);
  return <MembersContext.Provider value={map}>{children}</MembersContext.Provider>;
}

export function useProfile(userId: string | null | undefined) {
  const map = useContext(MembersContext);
  return userId ? map.get(userId) : undefined;
}

/** プロフィール画像。未登録・読み込み失敗時は色付きの丸に頭文字 */
export function Avatar({
  userId,
  name,
  size = 28,
  src,
  className = "",
}: {
  userId: string;
  name?: string;
  size?: number;
  /** 端末に保存した縮小画像など、URLを直接指定する場合 */
  src?: string | null;
  className?: string;
}) {
  const profile = useProfile(userId);
  const displayName = profile?.displayName ?? name ?? "";
  const url = src !== undefined ? src : avatarUrl(userId, profile?.avatarPath ?? null);
  const [failed, setFailed] = useState<string | null>(null);
  const style = { width: size, height: size, fontSize: Math.round(size * 0.45) };

  if (url && failed !== url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- 認証付きの小さな画像をそのまま表示する
      <img
        src={url}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        onError={() => setFailed(url)}
        className={`shrink-0 rounded-full bg-border object-cover ${className}`}
        style={style}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${className}`}
      style={{ ...style, backgroundColor: colorFor(userId) }}
    >
      {initialOf(displayName)}
    </span>
  );
}

/** 名前の前にアバターを付けた表示 */
export function MemberName({ userId, name, size = 22, className = "" }: { userId: string; name: string; size?: number; className?: string }) {
  return (
    <span className={`inline-flex min-w-0 items-center gap-1.5 ${className}`}>
      <Avatar userId={userId} name={name} size={size} />
      <span className="truncate">{name}</span>
    </span>
  );
}
