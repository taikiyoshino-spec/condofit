"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createScheduleAction } from "@/app/actions/schedule";
import { TimeSlotIcon } from "@/components/time-slot-icon";
import { showToast } from "@/components/toaster";
import { TIME_SLOT_LABEL, TIME_SLOTS } from "@/lib/schedule/time-slots";

export function CreateSchedule({ date }: { date: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted">時間帯を選ぶと予定を作成し、自分は「行く！」になります。</p>
      <div className="grid grid-cols-4 gap-2">
        {TIME_SLOTS.map((slot) => (
          <button
            key={slot}
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                const result = await createScheduleAction(date, slot);
                if (!result.ok) return setError(result.error);
                showToast(`${TIME_SLOT_LABEL[slot]}の予定を作成しました`);
                router.push(`/schedule/s/${result.id}`);
              })
            }
            className="flex flex-col items-center gap-1 rounded-lg border border-border py-3 text-sm disabled:opacity-50"
          >
            <TimeSlotIcon slot={slot} label={false} className="h-6 w-6" />
            {TIME_SLOT_LABEL[slot]}
          </button>
        ))}
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
