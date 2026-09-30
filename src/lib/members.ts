import "server-only";
import { createClient } from "@/lib/supabase/server";

export type MemberProfile = { id: string; displayName: string; avatarPath: string | null };

/** グループのメンバー（利用停止者も過去の記録に出るため含める）。RLSでグループ外は取得できない */
export async function listMemberProfiles(): Promise<MemberProfile[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("users").select("id, display_name, avatar_path");
  if (error) throw error;
  return data.map((u) => ({
    id: u.id as string,
    displayName: u.display_name as string,
    avatarPath: (u.avatar_path as string | null) ?? null,
  }));
}
