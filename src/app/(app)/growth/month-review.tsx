"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createMonthReviewAction } from "@/app/actions/review";
import type { MonthReview } from "@/lib/records/review-queries";
import { factLines } from "@/lib/records/review";

/** 成長タブ: 先月のふりかえり。まだ作っていなければ、開いたときに作る */
export function MonthReviewCard({ month, initial, aiReady }: { month: string; initial: MonthReview | null; aiReady: boolean }) {
  const [review, setReview] = useState(initial);
  const [aiError, setAiError] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const [pending, startTransition] = useTransition();
  const started = useRef(false);

  const run = (retry: boolean) =>
    startTransition(async () => {
      const r = await createMonthReviewAction(retry).catch(() => null);
      if (!r) return setAiError("まとめられませんでした。時間をおいて開き直してください");
      if (!r.ok) return setGone(true);
      setReview(r.review);
      setAiError(r.aiError);
    });

  useEffect(() => {
    if (initial || started.current) return;
    started.current = true;
    run(false);
    // 開いたときに1回だけ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (gone) return null;
  const label = `${Number(month.slice(5, 7))}月のふりかえり`;

  return (
    <section className="mx-4 mb-4 rounded-xl border border-accent bg-surface p-4" aria-busy={pending}>
      <h2 className="font-semibold">{label}</h2>
      {!review ? (
        <p className="mt-2 text-sm text-muted">{aiError ?? "先月の記録をまとめています…"}</p>
      ) : (
        <>
          {review.comment && <p className="mt-2 text-sm leading-relaxed">{review.comment}</p>}
          {review.tip && (
            <p className="mt-2 rounded-lg bg-bg px-3 py-2 text-sm">
              <span className="font-medium text-accent">来月は </span>
              {review.tip}
            </p>
          )}
          <ul className="mt-3 space-y-1 text-xs text-muted">
            {factLines(review.facts).map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
          {!review.comment && aiReady && (
            <div className="mt-3">
              {aiError && <p className="mb-1 text-xs text-warn">{aiError}</p>}
              <button
                type="button"
                disabled={pending}
                onClick={() => run(true)}
                className="w-full rounded-lg border border-accent py-2 text-sm font-medium text-accent disabled:opacity-50"
              >
                {pending ? "作っています…" : "AIのひと言を作る"}
              </button>
            </div>
          )}
          {review.comment && <p className="mt-2 text-[11px] text-muted">ひと言はAIが書いています。数字はアプリが数えたものです。</p>}
        </>
      )}
    </section>
  );
}
