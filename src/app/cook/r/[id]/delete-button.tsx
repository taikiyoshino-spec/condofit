"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteRecipeAction } from "@/app/actions/cook-recipes";
import { BottomSheet } from "@/components/bottom-sheet";
import { showToast } from "@/components/toaster";

export function DeleteRecipeButton({ recipeId, title }: { recipeId: string; title: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const remove = () =>
    startTransition(async () => {
      const r = await deleteRecipeAction(recipeId);
      if (!r.ok) return showToast(r.error ?? "削除できませんでした");
      showToast("レシピを削除しました");
      router.push("/cook");
    });
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="w-full rounded-lg border border-border py-2.5 text-sm text-danger">
        このレシピを削除
      </button>
      <BottomSheet open={open} onClose={() => setOpen(false)} title="レシピを削除しますか？">
        <p className="mb-4 text-sm text-muted">「{title}」を削除します。ほかのメンバーからも見えなくなります。</p>
        <div className="flex gap-2">
          <button type="button" onClick={() => setOpen(false)} className="flex-1 rounded-lg border border-border py-3 text-sm">
            やめる
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={remove}
            className="flex-1 rounded-lg bg-danger py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {pending ? "削除中…" : "削除する"}
          </button>
        </div>
      </BottomSheet>
    </>
  );
}
