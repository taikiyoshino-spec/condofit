"use server";

import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { isValidDateString, todayJst } from "@/lib/date";

export type CommentResult = { ok: true } | { ok: false; error: string };

const MAX_LENGTH = 500;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 日ごとの実績コメントを書く（今日以前のみ。権限・日付はDB側でも確認） */
export async function postDayCommentAction(date: string, rawBody: string): Promise<CommentResult> {
  await requireMember();
  const body = String(rawBody ?? "").trim();
  if (!isValidDateString(date) || date > todayJst()) return { ok: false, error: "この日にはコメントできません" };
  if (!body) return { ok: false, error: "コメントを入力してください" };
  if ([...body].length > MAX_LENGTH) return { ok: false, error: `${MAX_LENGTH}文字以内で入力してください` };

  const supabase = await createClient();
  const { error } = await supabase.from("day_comments").insert({ date, body });
  if (error) return { ok: false, error: "投稿できませんでした" };
  revalidatePath(`/schedule/${date}`);
  return { ok: true };
}

/** 削除（書いた本人と管理者のみ。DBのRLSで強制） */
export async function deleteDayCommentAction(id: string, date: string): Promise<CommentResult> {
  await requireMember();
  if (!UUID_RE.test(id)) return { ok: false, error: "不正なコメントです" };
  const supabase = await createClient();
  const { data, error } = await supabase.from("day_comments").delete().eq("id", id).select("id");
  if (error || !data.length) return { ok: false, error: "削除できませんでした" };
  if (isValidDateString(date)) revalidatePath(`/schedule/${date}`);
  return { ok: true };
}
