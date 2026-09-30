export const TIME_SLOTS = ["morning", "noon", "evening", "night"] as const;
export type TimeSlot = (typeof TIME_SLOTS)[number];

export const TIME_SLOT_LABEL: Record<TimeSlot, string> = {
  morning: "朝",
  noon: "昼",
  evening: "夕",
  night: "夜",
};

export type Intention = "going" | "maybe";
export const INTENTION_LABEL: Record<Intention, string> = {
  going: "行く！",
  maybe: "行けたら行く",
};

export function isTimeSlot(v: unknown): v is TimeSlot {
  return typeof v === "string" && (TIME_SLOTS as readonly string[]).includes(v);
}
