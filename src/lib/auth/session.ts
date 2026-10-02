import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Member = {
  id: string;
  displayName: string;
  role: "admin" | "member";
  groupId: string;
  /** ログインごとに変わるID（再ログインまで有効な「この案内を消した」等の記憶に使う） */
  sessionId: string;
};

/** ログイン中かつ利用停止されていないメンバー。該当しなければ null */
export const getCurrentMember = cache(async (): Promise<Member | null> => {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  const sessionId = String((claims?.claims as { session_id?: string } | undefined)?.session_id ?? "");
  if (!userId) return null;

  // RLS により、利用停止・グループ外のユーザーはここで何も取得できない
  const { data } = await supabase
    .from("group_members")
    .select("group_id, role, users!inner(id, display_name)")
    .eq("user_id", userId)
    .is("removed_at", null)
    .maybeSingle();
  if (!data) return null;

  const user = data.users as unknown as { id: string; display_name: string };
  return {
    id: user.id,
    displayName: user.display_name,
    role: data.role as Member["role"],
    groupId: data.group_id as string,
    sessionId,
  };
});

export async function requireMember(): Promise<Member> {
  const member = await getCurrentMember();
  if (!member) redirect("/login");
  return member;
}

export async function requireAdmin(): Promise<Member> {
  const member = await requireMember();
  if (member.role !== "admin") redirect("/");
  return member;
}
