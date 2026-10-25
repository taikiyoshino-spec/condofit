"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { departAction } from "@/app/actions/schedule";
import { showToast } from "@/components/toaster";

/** 「出発します」: 今日の予定のほかの参加者にだけ知らせる。押す前に、誰に知らせるかを確かめる */
export function DepartButton({
  scheduleId,
  others,
  departedLabel,
}: {
  scheduleId: string;
  /** 知らせる相手（自分以外の参加者）の名前 */
  others: string[];
  /** 出発済みなら「12:05」 */
  departedLabel: string | null;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  if (departedLabel) {
    return <p className="rounded-lg bg-bg px-3 py-2.5 text-center text-sm text-muted">{departedLabel} に出発を知らせました</p>;
  }
  if (others.length === 0) {
    return <p className="text-xs text-muted">ほかに参加している人がいないので、出発を知らせる相手はいません。</p>;
  }

  const depart = () =>
    startTransition(async () => {
      const r = await departAction(scheduleId);
      if (!r.ok) return showToast(r.error);
      setConfirming(false);
      showToast(`${r.count}人に出発を知らせました`);
      router.refresh();
    });

  return confirming ? (
    <div className="space-y-2 rounded-lg bg-bg p-3">
      <p className="text-sm">
        {others.map((n) => `${n}さん`).join("、")}に「出発しました」と通知します。
      </p>
      <div className="flex gap-2">
        <button type="button" onClick={() => setConfirming(false)} className="flex-1 rounded-lg border border-border py-2 text-sm">
          やめる
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={depart}
          className="flex-1 rounded-lg bg-accent py-2 text-sm font-semibold text-accent-fg disabled:opacity-50"
        >
          {pending ? "知らせています…" : "知らせる"}
        </button>
      </div>
    </div>
  ) : (
    <button type="button" onClick={() => setConfirming(true)} className="w-full rounded-lg bg-accent py-3 font-semibold text-accent-fg">
      出発します
    </button>
  );
}
