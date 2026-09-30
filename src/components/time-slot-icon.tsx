import { TIME_SLOT_LABEL, type TimeSlot } from "@/lib/schedule/time-slots";

// 時間帯のアプリ内統一アイコン（ホームでは文字を使わずこれで表す）
const PATHS: Record<TimeSlot, string> = {
  // 朝: 地平線から昇る太陽
  morning: "M4 17h16M7 17a5 5 0 0 1 10 0M12 7v2M5.6 10.6l1.4 1.4M18.4 10.6 17 12M8 21h8",
  // 昼: 太陽
  noon: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  // 夕: 沈む太陽（下向き矢印）
  evening: "M4 17h16M7 17a5 5 0 0 1 10 0M12 4v5M9.5 6.5 12 9l2.5-2.5M8 21h8",
  // 夜: 月
  night: "M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z",
};

const COLORS: Record<TimeSlot, string> = {
  morning: "text-[#d97706]",
  noon: "text-[#ca8a04]",
  evening: "text-[#ea580c]",
  night: "text-[#4f46e5] dark:text-[#a5b4fc]",
};

export function TimeSlotIcon({ slot, className = "h-5 w-5", label = true }: { slot: TimeSlot; className?: string; label?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`${className} ${COLORS[slot]} shrink-0`}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? "img" : undefined}
      aria-label={label ? TIME_SLOT_LABEL[slot] : undefined}
      aria-hidden={label ? undefined : true}
    >
      <path d={PATHS[slot]} />
    </svg>
  );
}
