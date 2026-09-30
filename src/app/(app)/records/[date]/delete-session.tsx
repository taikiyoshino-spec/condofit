"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteSessionAction } from "@/app/actions/records";
import { showToast } from "@/components/toaster";

export function DeleteSession({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className="mt-4 text-sm text-danger">
        この記録を削除
      </button>
    );
  }
  return (
    <div className="mt-4 flex items-center gap-2">
      <span className="text-sm">削除しますか？</span>
      <button type="button" onClick={() => setConfirming(false)} className="rounded-lg border border-border px-3 py-1.5 text-sm">
        やめる
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await deleteSessionAction(sessionId);
            if (!result.ok) return showToast(result.error ?? "削除できませんでした");
            showToast("記録を削除しました");
            router.refresh();
          })
        }
        className="rounded-lg border border-danger px-3 py-1.5 text-sm text-danger disabled:opacity-50"
      >
        削除する
      </button>
    </div>
  );
}
