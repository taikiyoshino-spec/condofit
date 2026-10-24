"use server";

import { requireMember } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { AI_FAILURE_MESSAGE, aiAvailable, geminiJsonResult } from "@/lib/ai/gemini";
import { listPartInfo } from "@/lib/records/parts-queries";
import { getMonthReview, getReviewSessions, reviewMonth, type MonthReview } from "@/lib/records/review-queries";
import { monthReviewFacts, monthReviewPrompt, REVIEW_COMMENT_MAX, REVIEW_TIP_MAX } from "@/lib/records/review";

const SCHEMA = {
  type: "OBJECT",
  properties: { comment: { type: "STRING" }, tip: { type: "STRING" } },
  required: ["comment", "tip"],
};

const cut = (s: unknown, max: number) => {
  const t = String(s ?? "").trim();
  return t ? [...t].slice(0, max).join("") : null;
};

export type ReviewResult = { ok: true; review: MonthReview; aiError: string | null } | { ok: false };

/**
 * 先月のふりかえりを作って保存する（成長タブを開いたときに、まだなければ呼ぶ）。
 * 数字はアプリで数え、AIにはひと言だけ書いてもらう。AIが使えないときは数字だけ保存し、retry で書き直せる
 */
export async function createMonthReviewAction(retry = false): Promise<ReviewResult> {
  const member = await requireMember();
  const month = reviewMonth();
  const saved = await getMonthReview(member.id, month);
  if (saved && (saved.comment || !retry)) return { ok: true, review: saved, aiError: null };

  const facts = saved?.facts ?? monthReviewFacts(await getReviewSessions(member.id, month), month, await listPartInfo());
  if (!facts) return { ok: false };

  let comment: string | null = null;
  let tip: string | null = null;
  let aiError: string | null = null;
  if (aiAvailable()) {
    const r = await geminiJsonResult<{ comment: string; tip: string }>(monthReviewPrompt(facts), SCHEMA, { feature: "fit_review", timeoutMs: 20000, temperature: 0.7 });
    if (r.ok) {
      comment = cut(r.data.comment, REVIEW_COMMENT_MAX + 20);
      tip = cut(r.data.tip, REVIEW_TIP_MAX + 20);
    } else aiError = AI_FAILURE_MESSAGE[r.reason];
  }

  const { error } = await createAdminClient()
    .from("monthly_reviews")
    .upsert({ user_id: member.id, month, facts, comment, tip }, { onConflict: "user_id,month" });
  if (error) console.error("monthly review save failed", error.message);
  return { ok: true, review: { month, facts, comment, tip }, aiError };
}
