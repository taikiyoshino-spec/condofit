"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin, requireMember } from "@/lib/auth/session";
import * as auth from "@/lib/auth/service";

export type FormState = { error?: string; message?: string; inviteUrl?: string } | undefined;

const str = (formData: FormData, key: string) => String(formData.get(key) ?? "");

export async function loginAction(_: FormState, formData: FormData): Promise<FormState> {
  const result = await auth.login(str(formData, "display_name"), str(formData, "pin"));
  if (!result.ok) return { error: result.error };
  redirect("/");
}

export async function joinAction(_: FormState, formData: FormData): Promise<FormState> {
  const result = await auth.join(
    str(formData, "token"),
    str(formData, "display_name"),
    str(formData, "pin"),
    str(formData, "pin_confirm"),
  );
  if (!result.ok) return { error: result.error };
  redirect("/");
}

export async function logoutAction() {
  await auth.logout();
  redirect("/login");
}

export async function changeDisplayNameAction(_: FormState, formData: FormData): Promise<FormState> {
  const member = await requireMember();
  const result = await auth.changeDisplayName(member, str(formData, "display_name"));
  if (!result.ok) return { error: result.error };
  revalidatePath("/", "layout");
  return { message: "表示名を変更しました" };
}

export async function changePinAction(_: FormState, formData: FormData): Promise<FormState> {
  const member = await requireMember();
  const result = await auth.changePin(
    member,
    str(formData, "current_pin"),
    str(formData, "new_pin"),
    str(formData, "new_pin_confirm"),
  );
  if (!result.ok) return { error: result.error };
  return { message: "PINを変更しました" };
}

export async function withdrawAction(_: FormState, formData: FormData): Promise<FormState> {
  const member = await requireMember();
  if (str(formData, "confirm") !== "yes") return { error: "確認にチェックしてください" };
  const result = await auth.deactivateMember(member, member.id);
  if (!result.ok) return { error: result.error };
  await auth.logout();
  redirect("/login");
}

// ---- 管理者 ----

export async function issueInviteAction(): Promise<FormState> {
  const admin = await requireAdmin();
  const result = await auth.issueInvite(admin);
  if (!result.ok) return { error: result.error };
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  const origin = process.env.APP_ORIGIN ?? `${proto}://${host}`;
  revalidatePath("/admin");
  return { inviteUrl: `${origin}/join/${result.data}`, message: "新しい招待URLを発行しました。旧URLは無効です" };
}

export async function resetPinAction(_: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const result = await auth.resetMemberPin(admin, str(formData, "user_id"), str(formData, "pin"), str(formData, "pin_confirm"));
  if (!result.ok) return { error: result.error };
  return { message: "PINを再設定しました" };
}

export async function setRoleAction(_: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const role = str(formData, "role") === "admin" ? "admin" : "member";
  const result = await auth.setMemberRole(admin, str(formData, "user_id"), role);
  if (!result.ok) return { error: result.error };
  revalidatePath("/admin");
  return { message: role === "admin" ? "管理者にしました" : "メンバーにしました" };
}

export async function deactivateAction(_: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const userId = str(formData, "user_id");
  if (userId === admin.id) return { error: "自分自身はマイページから退会してください" };
  const result = await auth.deactivateMember(admin, userId);
  if (!result.ok) return { error: result.error };
  revalidatePath("/admin");
  return { message: "利用停止にしました" };
}
