import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Intention, TimeSlot } from "@/lib/schedule/time-slots";
import { groupVisits, type DayVisits } from "@/lib/schedule/visits";

export type Participant = { userId: string; displayName: string; intention: Intention };
export type Schedule = {
  id: string;
  date: string;
  timeSlot: TimeSlot;
  creatorId: string;
  creatorName: string;
  deletedAt: string | null;
  participants: Participant[];
};

const SELECT = `id, date, time_slot, creator_user_id, deleted_at, created_at,
  creator:users!schedules_creator_user_id_fkey(display_name),
  schedule_participants(user_id, intention, created_at, users(display_name))`;

const SLOT_ORDER: Record<TimeSlot, number> = { morning: 0, noon: 1, evening: 2, night: 3 };

type Row = {
  id: string;
  date: string;
  time_slot: TimeSlot;
  creator_user_id: string;
  deleted_at: string | null;
  created_at: string;
  creator: { display_name: string } | null;
  schedule_participants: { user_id: string; intention: Intention; created_at: string; users: { display_name: string } | null }[];
};

function toSchedule(r: Row): Schedule {
  return {
    id: r.id,
    date: r.date,
    timeSlot: r.time_slot,
    creatorId: r.creator_user_id,
    creatorName: r.creator?.display_name ?? "",
    deletedAt: r.deleted_at,
    participants: [...r.schedule_participants]
      .sort((a, b) =>
        a.intention === b.intention ? a.created_at.localeCompare(b.created_at) : a.intention === "going" ? -1 : 1,
      )
      .map((p) => ({ userId: p.user_id, displayName: p.users?.display_name ?? "", intention: p.intention })),
  };
}

function sortSchedules(list: Schedule[]) {
  return list.sort((a, b) => a.date.localeCompare(b.date) || SLOT_ORDER[a.timeSlot] - SLOT_ORDER[b.timeSlot]);
}

/** 期間内の予定（論理削除済みは除く） */
export async function listSchedules(start: string, end: string): Promise<Schedule[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("schedules")
    .select(SELECT)
    .gte("date", start)
    .lte("date", end)
    .is("deleted_at", null)
    .order("date")
    .order("created_at");
  if (error) throw error;
  return sortSchedules((data as unknown as Row[]).map(toSchedule));
}

/** 1件（論理削除済みも返す。通知から開かれた場合に「削除されました」と表示するため） */
export async function getSchedule(id: string): Promise<Schedule | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("schedules").select(SELECT).eq("id", id).maybeSingle();
  if (error) return null;
  return data ? toSchedule(data as unknown as Row) : null;
}

/**
 * 期間内（JSTの日付、両端含む）に誰がいつ頃Fitに行ったか。トレーニング記録の日時を使う（チェックインは使わない）。
 * 共有するのは時間帯と名前だけ（種目・重量などは含めない）
 */
export async function listVisits(start: string, end: string): Promise<Map<string, DayVisits>> {
  const supabase = await createClient();
  const from = new Date(`${start}T00:00:00+09:00`);
  const to = new Date(new Date(`${end}T00:00:00+09:00`).getTime() + 24 * 60 * 60 * 1000);
  const { data, error } = await supabase
    .from("training_sessions")
    .select("user_id, performed_at, users(display_name)")
    .gte("performed_at", from.toISOString())
    .lt("performed_at", to.toISOString())
    .order("performed_at");
  if (error) throw error;
  return groupVisits(
    (data as unknown as { user_id: string; performed_at: string; users: { display_name: string } | null }[]).map((r) => ({
      userId: r.user_id,
      displayName: r.users?.display_name ?? "",
      performedAt: r.performed_at,
    })),
  );
}
