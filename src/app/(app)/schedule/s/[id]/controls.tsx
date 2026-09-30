"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteScheduleAction, setIntentionAction, updateScheduleAction } from "@/app/actions/schedule";
import { showToast } from "@/components/toaster";
import { TimeSlotIcon } from "@/components/time-slot-icon";
import { formatDate } from "@/lib/date";
import { INTENTION_LABEL, TIME_SLOT_LABEL, TIME_SLOTS, type Intention, type TimeSlot } from "@/lib/schedule/time-slots";

const OPTIONS: { value: Intention | null; label: string }[] = [
  { value: "going", label: INTENTION_LABEL.going },
  { value: "maybe", label: INTENTION_LABEL.maybe },
  { value: null, label: "未回答" },
];

export function IntentionControl({ scheduleId, current }: { scheduleId: string; current: Intention | null }) {
  const [value, setValue] = useState(current);
  const [pending, startTransition] = useTransition();

  return (
    <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="参加意思">
      {OPTIONS.map((o) => {
        const selected = value === o.value;
        return (
          <button
            key={o.label}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                if (selected) return;
                const prev = value;
                setValue(o.value);
                const result = await setIntentionAction(scheduleId, o.value);
                if (!result.ok) {
                  setValue(prev);
                  showToast(result.error);
                }
              })
            }
            className={`rounded-lg px-2 py-2.5 text-sm font-medium ${
              selected ? "bg-accent text-accent-fg" : "border border-border"
            } disabled:opacity-60`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

type CreatorProps = {
  scheduleId: string;
  date: string;
  timeSlot: TimeSlot;
  minDate: string;
  hasOthers: boolean;
};

export function CreatorControls({ scheduleId, date, timeSlot, minDate, hasOthers }: CreatorProps) {
  const router = useRouter();
  const [newDate, setNewDate] = useState(date);
  const [newSlot, setNewSlot] = useState(timeSlot);
  const [confirming, setConfirming] = useState<"edit" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const changed = newDate !== date || newSlot !== timeSlot;

  const before = `${formatDate(date)} ${TIME_SLOT_LABEL[timeSlot]}`;
  const after = `${formatDate(newDate)} ${TIME_SLOT_LABEL[newSlot]}`;
  const notifyNote = hasOthers ? "参加中のメンバーに通知されます。" : "";

  const save = () =>
    startTransition(async () => {
      setError(null);
      const result = await updateScheduleAction(scheduleId, newDate, newSlot);
      if (!result.ok) return setError(result.error);
      setConfirming(null);
      showToast("予定を変更しました");
      router.refresh();
    });

  const remove = () =>
    startTransition(async () => {
      setError(null);
      const result = await deleteScheduleAction(scheduleId);
      if (!result.ok) return setError(result.error);
      showToast("予定を削除しました");
      router.push(`/schedule/${date}`);
    });

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <label className="block space-y-1">
          <span className="text-sm font-medium">日付</span>
          <input
            type="date"
            value={newDate}
            min={minDate}
            onChange={(e) => {
              setNewDate(e.target.value || date);
              setConfirming(null);
            }}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2.5"
          />
        </label>
        <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="時間帯">
          {TIME_SLOTS.map((slot) => (
            <button
              key={slot}
              type="button"
              role="radio"
              aria-checked={newSlot === slot}
              onClick={() => {
                setNewSlot(slot);
                setConfirming(null);
              }}
              className={`flex flex-col items-center gap-1 rounded-lg py-2 text-sm ${
                newSlot === slot ? "border-2 border-accent" : "border border-border"
              }`}
            >
              <TimeSlotIcon slot={slot} label={false} />
              {TIME_SLOT_LABEL[slot]}
            </button>
          ))}
        </div>

        {confirming === "edit" ? (
          <div className="space-y-2 rounded-lg bg-bg p-3">
            <p className="text-sm">
              {before} <span aria-label="から">→</span> <span className="font-semibold">{after}</span>
            </p>
            <p className="text-xs text-muted">参加意思はそのまま引き継がれます。{notifyNote}</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setConfirming(null)} className="flex-1 rounded-lg border border-border py-2 text-sm">
                やめる
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={save}
                className="flex-1 rounded-lg bg-accent py-2 text-sm font-medium text-accent-fg disabled:opacity-50"
              >
                変更する
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            disabled={!changed}
            onClick={() => setConfirming("edit")}
            className="w-full rounded-lg border border-border py-2.5 text-sm font-medium disabled:opacity-40"
          >
            変更内容を確認
          </button>
        )}
      </div>

      <div className="border-t border-border pt-4">
        {confirming === "delete" ? (
          <div className="space-y-2">
            <p className="text-sm">
              {before} の予定を削除します。{notifyNote}
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setConfirming(null)} className="flex-1 rounded-lg border border-border py-2 text-sm">
                やめる
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={remove}
                className="flex-1 rounded-lg border border-danger py-2 text-sm font-medium text-danger disabled:opacity-50"
              >
                削除する
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirming("delete")} className="w-full py-2 text-sm text-danger">
            予定を削除
          </button>
        )}
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
