import "server-only";
import { randomUUID } from "node:crypto";
import { serverEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  authEmail,
  deriveAuthPassword,
  displayNameKey,
  generateInviteToken,
  hashInviteToken,
  hashPin,
  isValidPin,
  normalizeDisplayName,
  validateDisplayName,
  verifyPin,
} from "@/lib/auth/pin";
import type { Member } from "@/lib/auth/session";

export const MAX_LOGIN_FAILURES = 5;
export const LOCK_MINUTES = 15;

export type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

const ok = <T>(data: T): Result<T> => ({ ok: true, data });
const fail = (error: string): Result<never> => ({ ok: false, error });

const LOGIN_FAILED = "表示名またはPINが違います";

/** ilike 用にワイルドカードをエスケープ（表示名の大文字小文字を区別しない完全一致） */
function ilikeExact(value: string) {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

async function findUserByDisplayName(name: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("users")
    .select("id, display_name, deactivated_at, user_secrets(pin_hash), group_members(removed_at)")
    .ilike("display_name", ilikeExact(name))
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const secrets = data.user_secrets as unknown as { pin_hash: string } | null;
  const memberships = data.group_members as unknown as { removed_at: string | null }[];
  return {
    id: data.id as string,
    active: data.deactivated_at === null && memberships.some((m) => m.removed_at === null),
    pinHash: secrets?.pin_hash ?? null,
  };
}

async function displayNameTaken(name: string, exceptUserId?: string) {
  const admin = createAdminClient();
  let query = admin.from("users").select("id").ilike("display_name", ilikeExact(name));
  if (exceptUserId) query = query.neq("id", exceptUserId);
  const { data, error } = await query.limit(1);
  if (error) throw error;
  return data.length > 0;
}

async function signIn(userId: string, pin: string) {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: authEmail(userId),
    password: deriveAuthPassword(userId, pin, serverEnv.pinPepper),
  });
  return !error;
}

async function setPin(userId: string, pin: string) {
  const admin = createAdminClient();
  const { error: authError } = await admin.auth.admin.updateUserById(userId, {
    password: deriveAuthPassword(userId, pin, serverEnv.pinPepper),
  });
  if (authError) throw authError;
  const { error } = await admin
    .from("user_secrets")
    .upsert({ user_id: userId, pin_hash: hashPin(pin), updated_at: new Date().toISOString() });
  if (error) throw error;
}

// ---------------------------------------------------------------
// ログイン（表示名 + 4桁PIN、5回失敗で15分ロック）
// ---------------------------------------------------------------

export async function login(rawName: string, pin: string): Promise<Result> {
  const name = normalizeDisplayName(rawName);
  if (!name || !isValidPin(pin)) return fail(LOGIN_FAILED);

  const admin = createAdminClient();
  const key = displayNameKey(name);
  const { data: attempt } = await admin
    .from("login_attempts")
    .select("failed_count, locked_until")
    .eq("display_name_key", key)
    .maybeSingle();

  if (attempt?.locked_until && new Date(attempt.locked_until) > new Date()) {
    const minutes = Math.ceil((new Date(attempt.locked_until).getTime() - Date.now()) / 60000);
    return fail(`ログインに続けて失敗したため、一時的にロックしています。${minutes}分後にもう一度お試しください`);
  }

  const user = await findUserByDisplayName(name);
  const valid = user !== null && user.active && user.pinHash !== null && verifyPin(pin, user.pinHash);

  if (!valid) {
    // 存在しない表示名でも同じように数える（表示名の存在を推測させない）
    const failed = (attempt?.failed_count ?? 0) + 1;
    const locked = failed >= MAX_LOGIN_FAILURES;
    await admin.from("login_attempts").upsert({
      display_name_key: key,
      failed_count: locked ? 0 : failed,
      locked_until: locked ? new Date(Date.now() + LOCK_MINUTES * 60000).toISOString() : null,
      updated_at: new Date().toISOString(),
    });
    if (locked) {
      return fail(`ログインに${MAX_LOGIN_FAILURES}回失敗したため、${LOCK_MINUTES}分間ロックしました`);
    }
    return fail(LOGIN_FAILED);
  }

  await admin.from("login_attempts").delete().eq("display_name_key", key);
  if (!(await signIn(user.id, pin))) return fail("ログインできませんでした。管理者に連絡してください");
  return ok(undefined);
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
}

// ---------------------------------------------------------------
// 招待URLからの参加
// ---------------------------------------------------------------

export async function findActiveInvite(token: string) {
  if (!token) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("invite_tokens")
    .select("id, group_id, groups(name)")
    .eq("token_hash", hashInviteToken(token))
    .eq("active", true)
    .maybeSingle();
  if (!data) return null;
  const group = data.groups as unknown as { name: string } | null;
  return { groupId: data.group_id as string, groupName: group?.name ?? "" };
}

export async function join(token: string, rawName: string, pin: string, pinConfirm: string): Promise<Result> {
  const invite = await findActiveInvite(token);
  if (!invite) return fail("この招待URLは無効です。管理者に新しいURLをもらってください");

  const name = normalizeDisplayName(rawName);
  const nameError = validateDisplayName(name);
  if (nameError) return fail(nameError);
  if (!isValidPin(pin)) return fail("PINは4桁の数字にしてください");
  if (pin !== pinConfirm) return fail("確認用PINが一致しません");
  if (await displayNameTaken(name)) return fail("その表示名はすでに使われています");

  const admin = createAdminClient();
  const userId = randomUUID();
  const { error: authError } = await admin.auth.admin.createUser({
    id: userId,
    email: authEmail(userId),
    password: deriveAuthPassword(userId, pin, serverEnv.pinPepper),
    email_confirm: true,
  });
  if (authError) return fail("参加処理に失敗しました。もう一度お試しください");

  const cleanup = async () => {
    await admin.from("group_members").delete().eq("user_id", userId);
    await admin.from("user_secrets").delete().eq("user_id", userId);
    await admin.from("notification_settings").delete().eq("user_id", userId);
    await admin.from("users").delete().eq("id", userId);
    await admin.auth.admin.deleteUser(userId);
  };

  const { error: userError } = await admin.from("users").insert({ id: userId, display_name: name });
  if (userError) {
    await cleanup();
    return fail(userError.code === "23505" ? "その表示名はすでに使われています" : "参加処理に失敗しました");
  }
  const { error: secretError } = await admin.from("user_secrets").insert({ user_id: userId, pin_hash: hashPin(pin) });
  const { error: memberError } = secretError
    ? { error: secretError }
    : await admin.from("group_members").insert({ group_id: invite.groupId, user_id: userId, role: "member" });
  if (memberError) {
    await cleanup();
    return fail("参加処理に失敗しました");
  }

  if (!(await signIn(userId, pin))) return fail("参加しましたが、ログインに失敗しました。ログイン画面からお試しください");
  return ok(undefined);
}

// ---------------------------------------------------------------
// プロフィール
// ---------------------------------------------------------------

export async function changeDisplayName(member: Member, rawName: string): Promise<Result> {
  const name = normalizeDisplayName(rawName);
  const nameError = validateDisplayName(name);
  if (nameError) return fail(nameError);
  if (name === member.displayName) return ok(undefined);
  if (await displayNameTaken(name, member.id)) return fail("その表示名はすでに使われています");

  // 本人の更新はRLS経由（本人以外は更新できない）
  const supabase = await createClient();
  const { error } = await supabase.from("users").update({ display_name: name }).eq("id", member.id);
  if (error) return fail(error.code === "23505" ? "その表示名はすでに使われています" : "変更に失敗しました");
  return ok(undefined);
}

export async function changePin(member: Member, currentPin: string, newPin: string, confirm: string): Promise<Result> {
  if (!isValidPin(newPin)) return fail("新しいPINは4桁の数字にしてください");
  if (newPin !== confirm) return fail("確認用PINが一致しません");

  const admin = createAdminClient();
  const { data } = await admin.from("user_secrets").select("pin_hash").eq("user_id", member.id).maybeSingle();
  if (!data || !verifyPin(currentPin, data.pin_hash)) return fail("現在のPINが違います");

  await setPin(member.id, newPin);
  return ok(undefined);
}

// ---------------------------------------------------------------
// 管理者機能（呼び出し前に requireAdmin() で確認済みであること）
// ---------------------------------------------------------------

function assertAdmin(actor: Member) {
  if (actor.role !== "admin") throw new Error("forbidden");
}

/** 新しい招待URLのトークンを発行し、旧URLを無効化する。平文トークンはこの戻り値でしか得られない */
export async function issueInvite(actor: Member): Promise<Result<string>> {
  assertAdmin(actor);
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { error: invalidateError } = await admin
    .from("invite_tokens")
    .update({ active: false, invalidated_at: now })
    .eq("group_id", actor.groupId)
    .eq("active", true);
  if (invalidateError) return fail("招待URLの発行に失敗しました");

  const token = generateInviteToken();
  const { error } = await admin.from("invite_tokens").insert({
    group_id: actor.groupId,
    token_hash: hashInviteToken(token),
    created_by: actor.id,
  });
  if (error) return fail("招待URLの発行に失敗しました");
  return ok(token);
}

export async function resetMemberPin(actor: Member, targetUserId: string, pin: string, confirm: string): Promise<Result> {
  assertAdmin(actor);
  if (!isValidPin(pin)) return fail("PINは4桁の数字にしてください");
  if (pin !== confirm) return fail("確認用PINが一致しません");

  const admin = createAdminClient();
  const { data: target } = await admin.from("users").select("display_name").eq("id", targetUserId).maybeSingle();
  if (!target) return fail("メンバーが見つかりません");

  await setPin(targetUserId, pin);
  // ロック中でもすぐログインできるよう解除
  await admin.from("login_attempts").delete().eq("display_name_key", displayNameKey(target.display_name));
  return ok(undefined);
}

export async function setMemberRole(actor: Member, targetUserId: string, role: "admin" | "member"): Promise<Result> {
  assertAdmin(actor);
  const admin = createAdminClient();
  const { error } = await admin
    .from("group_members")
    .update({ role })
    .eq("group_id", actor.groupId)
    .eq("user_id", targetUserId)
    .is("removed_at", null);
  if (error) return fail(error.message.includes("last_admin") ? "最後の管理者は降格できません" : "変更に失敗しました");
  return ok(undefined);
}

/** 利用停止（メンバー削除・自主退会）。過去の記録は残す */
export async function deactivateMember(actor: Member, targetUserId: string): Promise<Result> {
  if (actor.id !== targetUserId) assertAdmin(actor);
  const admin = createAdminClient();
  const now = new Date().toISOString();

  const { error: userError } = await admin
    .from("users")
    .update({ deactivated_at: now })
    .eq("id", targetUserId)
    .is("deactivated_at", null);
  if (userError) {
    return fail(userError.message.includes("last_admin") ? "最後の管理者は利用停止できません" : "利用停止に失敗しました");
  }
  await admin.from("group_members").update({ removed_at: now }).eq("user_id", targetUserId).is("removed_at", null);
  await admin.from("push_subscriptions").update({ revoked_at: now }).eq("user_id", targetUserId).is("revoked_at", null);
  // 既存セッションでのAPIアクセスも止める（RLSでも閲覧不可になっている）
  await admin.auth.admin.updateUserById(targetUserId, { ban_duration: "876000h" });
  await admin.from("check_ins").update({ status: "checked_out", checked_out_at: now })
    .eq("user_id", targetUserId).eq("status", "active");
  return ok(undefined);
}

export async function listMembers(actor: Member) {
  assertAdmin(actor);
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("group_members")
    .select("user_id, role, joined_at, users!inner(display_name)")
    .eq("group_id", actor.groupId)
    .is("removed_at", null)
    .order("joined_at");
  if (error) throw error;
  return data.map((m) => ({
    userId: m.user_id as string,
    role: m.role as "admin" | "member",
    joinedAt: m.joined_at as string,
    displayName: (m.users as unknown as { display_name: string }).display_name,
  }));
}

export async function hasActiveInvite(actor: Member) {
  assertAdmin(actor);
  const admin = createAdminClient();
  const { data } = await admin
    .from("invite_tokens")
    .select("created_at")
    .eq("group_id", actor.groupId)
    .eq("active", true)
    .maybeSingle();
  return data ? { createdAt: data.created_at as string } : null;
}
