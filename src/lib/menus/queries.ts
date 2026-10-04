import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Entry, ExerciseType } from "@/lib/records/format";

export type MenuItem = { exerciseId: string; name: string; type: ExerciseType; sets: Partial<Entry>[] };
export type Menu = { id: string; name: string; updatedAt: string; items: MenuItem[] };

type Row = {
  id: string;
  name: string;
  updated_at: string;
  workout_menu_items: {
    exercise_id: string;
    display_order: number;
    sets: Partial<Entry>[];
    exercises: { name: string; type: ExerciseType } | null;
  }[];
};

const SELECT = "id, name, updated_at, workout_menu_items(exercise_id, display_order, sets, exercises(name, type))";

const toMenu = (r: Row): Menu => ({
  id: r.id,
  name: r.name,
  updatedAt: r.updated_at,
  items: [...r.workout_menu_items]
    .sort((a, b) => a.display_order - b.display_order)
    .map((it) => ({
      exerciseId: it.exercise_id,
      name: it.exercises?.name ?? "",
      type: it.exercises?.type ?? "weight",
      sets: Array.isArray(it.sets) ? it.sets : [],
    })),
});

/** 自分のメニュー（最近更新した順）。他人のメニューはRLSで取得できない */
export async function listMyMenus(userId: string): Promise<Menu[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workout_menus")
    .select(SELECT)
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data as unknown as Row[]).map(toMenu);
}

export async function getMyMenu(userId: string, id: string): Promise<Menu | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("workout_menus").select(SELECT).eq("id", id).eq("user_id", userId).maybeSingle();
  return data ? toMenu(data as unknown as Row) : null;
}
