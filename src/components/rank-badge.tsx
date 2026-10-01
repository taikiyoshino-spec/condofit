const MEDAL: Record<number, string> = { 1: "bg-[#d4a017] text-white", 2: "bg-[#9ca3af] text-white", 3: "bg-[#b87333] text-white" };

/** 順位の表示（1〜3位はメダル色） */
export function RankBadge({ rank }: { rank: number }) {
  return (
    <span
      className={`inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full px-1 text-xs font-bold ${
        MEDAL[rank] ?? "bg-border text-fg"
      }`}
      aria-label={`${rank}位`}
    >
      {rank}
    </span>
  );
}
