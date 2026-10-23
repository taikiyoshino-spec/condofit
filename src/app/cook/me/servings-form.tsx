"use client";

import { useState, useTransition } from "react";
import { setHouseholdServingsAction } from "@/app/actions/cook-pantry";
import { showToast } from "@/components/toaster";

/** 家族のいつも作る人数（− N人分 ＋。押すたびに保存） */
export function ServingsForm({ initial }: { initial: number }) {
  const [value, setValue] = useState(initial);
  const [pending, startTransition] = useTransition();
  const change = (next: number) => {
    const before = value;
    setValue(next);
    startTransition(async () => {
      const r = await setHouseholdServingsAction(next);
      if (!r.ok) {
        setValue(before);
        showToast(r.error);
      }
    });
  };
  return (
    <div className="flex items-center gap-2" role="group" aria-label="いつも作る人数">
      <button
        type="button"
        aria-label="1人分減らす"
        disabled={pending || value <= 1}
        onClick={() => change(value - 1)}
        className="h-9 w-9 rounded-full border border-border disabled:opacity-30"
      >
        −
      </button>
      <span className="w-16 text-center text-lg font-semibold">{value}人分</span>
      <button
        type="button"
        aria-label="1人分増やす"
        disabled={pending || value >= 20}
        onClick={() => change(value + 1)}
        className="h-9 w-9 rounded-full border border-border disabled:opacity-30"
      >
        ＋
      </button>
    </div>
  );
}
