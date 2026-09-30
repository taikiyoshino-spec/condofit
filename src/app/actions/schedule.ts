"use server";

import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { isValidDateString, todayJst } from "@/lib/date";
import { isTimeSlot, type Intention } from "@/lib/schedule/time-slots";

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

// 権限（作成者のみ編集・削除、本人の参加意思のみ変更、過去予定は不可）はDBのRLSとトリガーで強制している
function dbError(message: string): string {
  if (message.includes("past_date")) return "今日以降の日付を選んでください";
  if (message.includes("past_schedule")) return "過去の予定は変更できません";
  if (message.includes("schedule_deleted")) return "この予定は削除されています";
  return "保存できませんでした。もう一度お試しください";
}

function revalidate() {
  revalidatePath("/schedule", "layout");
  revalidatePath("/");
}

export async function createScheduleAction(date: string, timeSlot: string): Promise<ActionResult> {
  await requireMember();
  if (!isValidDateString(date) || !isTimeSlot(timeSlot)) return { ok: false, error: "日付と時間帯を選んでください" };
  if (date < todayJst()) return { ok: false, error: "今日以降の日付を選んでください" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("schedules")
    .insert({ date, time_slot: timeSlot })
    .select("id")
    .single();
  if (error) return { ok: false, error: dbError(error.message) };
  revalidate();
  return { ok: true, id: data.id as string };
}

export async function updateScheduleAction(id: string, date: string, timeSlot: string): Promise<ActionResult> {
  const member = await requireMember();
  if (!isValidDateString(date) || !isTimeSlot(timeSlot)) return { ok: false, error: "日付と時間帯を選んでください" };
  if (date < todayJst()) return { ok: false, error: "今日以降の日付を選んでください" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("schedules")
    .update({ date, time_slot: timeSlot })
    .eq("id", id)
    .eq("creator_user_id", member.id)
    .select("id");
  if (error) return { ok: false, error: dbError(error.message) };
  if (!data.length) return { ok: false, error: "予定を作成した人だけが編集できます" };
  revalidate();
  return { ok: true, id };
}

export async function deleteScheduleAction(id: string): Promise<ActionResult> {
  const member = await requireMember();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("schedules")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("creator_user_id", member.id)
    .is("deleted_at", null)
    .select("id");
  if (error) return { ok: false, error: dbError(error.message) };
  if (!data.length) return { ok: false, error: "予定を作成した人だけが削除できます" };
  revalidate();
  return { ok: true };
}

/** 参加意思の設定。null は未回答に戻す（参加キャンセル） */
export async function setIntentionAction(scheduleId: string, intention: Intention | null): Promise<ActionResult> {
  const member = await requireMember();
  const supabase = await createClient();

  if (intention === null) {
    const { error } = await supabase
      .from("schedule_participants")
      .delete()
      .eq("schedule_id", scheduleId)
      .eq("user_id", member.id);
    if (error) return { ok: false, error: dbError(error.message) };
  } else if (intention === "going" || intention === "maybe") {
    // insert と update を分けるのは、通知トリガーが「参加」と「行く↔行けたら」を区別するため
    const { data: existing } = await supabase
      .from("schedule_participants")
      .select("intention")
      .eq("schedule_id", scheduleId)
      .eq("user_id", member.id)
      .maybeSingle();
    const { error } = existing
      ? await supabase
          .from("schedule_participants")
          .update({ intention })
          .eq("schedule_id", scheduleId)
          .eq("user_id", member.id)
      : await supabase.from("schedule_participants").insert({ schedule_id: scheduleId, intention });
    if (error) return { ok: false, error: dbError(error.message) };
  } else {
    return { ok: false, error: "不正な値です" };
  }
  revalidate();
  return { ok: true };
}
