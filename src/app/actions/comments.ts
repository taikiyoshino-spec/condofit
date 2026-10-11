"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireMember } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatDate, isValidDateString, todayJst } from "@/lib/date";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPush } from "@/lib/push";

export type CommentResult = { ok: true } | { ok: false; error: string };

const MAX_LENGTH = 500;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 日ごとの実績コメントを書く（今日以前のみ。権限・日付はDB側でも確認） */
export async function postDayCommentAction(date: string, rawBody: string): Promise<CommentResult> {
  const member = await requireMember();
  const body = String(rawBody ?? "").trim();
  if (!isValidDateString(date) || date > todayJst()) return { ok: false, error: "この日にはコメントできません" };
  if (!body) return { ok: false, error: "コメントを入力してください" };
  if ([...body].length > MAX_LENGTH) return { ok: false, error: `${MAX_LENGTH}文字以内で入力してください` };

  const supabase = await createClient();
  const { error } = await supabase.from("day_comments").insert({ date, body });
  if (error) return { ok: false, error: "投稿できませんでした" };
  revalidatePath(`/schedule/${date}`);

  // アプリ内通知はDBトリガーで全員分作成済み。プッシュはレスポンス後に送る（通知設定「コメント」がオンの人だけ）
  after(async () => {
    const admin = createAdminClient();
    const { data: others } = await admin
      .from("group_members")
      .select("user_id")
      .eq("group_id", member.groupId)
      .is("removed_at", null)
      .neq("user_id", member.id);
    const excerpt = [...body].length > 40 ? `${[...body].slice(0, 40).join("")}…` : body;
    await sendPush((others ?? []).map((o) => o.user_id as string), "comment", {
      title: `${member.displayName}さんが${formatDate(date, { withWeekday: false })}の実績にコメント`,
      body: excerpt,
      url: `/schedule/${date}`,
      tag: `comment-${date}`,
    });
  });
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
