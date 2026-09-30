// 初回セットアップ: グループ（未作成なら）と最初の管理者を作成する。
// 使い方: npm run admin:create -- <表示名> <4桁PIN> [グループ名]
//        npm run admin:create -- --member <表示名> <4桁PIN>   （一般メンバーを作成。通常は招待URLから参加してもらう）
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import {
  authEmail,
  deriveAuthPassword,
  hashPin,
  isValidPin,
  normalizeDisplayName,
  validateDisplayName,
} from "../src/lib/auth/pin.ts";

function env(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`環境変数 ${name} が設定されていません（.env.local を確認してください）`);
    process.exit(1);
  }
  return value;
}

const args = process.argv.slice(2);
const asMember = args[0] === "--member";
if (asMember) args.shift();
const role = asMember ? "member" : "admin";
const [rawName, pin, groupName = "CondoFit"] = args;
if (!rawName || !pin) {
  console.error("使い方: npm run admin:create -- [--member] <表示名> <4桁PIN> [グループ名]");
  process.exit(1);
}
const displayName = normalizeDisplayName(rawName);
const nameError = validateDisplayName(displayName);
if (nameError) {
  console.error(nameError);
  process.exit(1);
}
if (!isValidPin(pin)) {
  console.error("PINは4桁の数字にしてください");
  process.exit(1);
}

const supabase = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});
const pepper = env("PIN_PEPPER");

async function main() {
  const { data: groups, error: groupsError } = await supabase.from("groups").select("id, name").limit(2);
  if (groupsError) throw groupsError;
  if (groups.length > 1) throw new Error("グループが複数あります。このスクリプトは単一グループ前提です");

  let groupId = groups[0]?.id as string | undefined;
  if (!groupId && asMember) throw new Error("グループがありません。先に管理者を作成してください");
  if (!groupId) {
    const { data, error } = await supabase.from("groups").insert({ name: groupName }).select("id").single();
    if (error) throw error;
    groupId = data.id as string;
    console.log(`グループ「${groupName}」を作成しました`);
  }

  const userId = randomUUID();
  const { error: authError } = await supabase.auth.admin.createUser({
    id: userId,
    email: authEmail(userId),
    password: deriveAuthPassword(userId, pin, pepper),
    email_confirm: true,
  });
  if (authError) throw authError;

  const steps = [
    () => supabase.from("users").insert({ id: userId, display_name: displayName }),
    () => supabase.from("user_secrets").insert({ user_id: userId, pin_hash: hashPin(pin) }),
    () => supabase.from("group_members").insert({ group_id: groupId, user_id: userId, role }),
  ];
  for (const step of steps) {
    const { error } = await step();
    if (error) {
      await supabase.from("group_members").delete().eq("user_id", userId);
      await supabase.from("user_secrets").delete().eq("user_id", userId);
      await supabase.from("users").delete().eq("id", userId);
      await supabase.auth.admin.deleteUser(userId);
      throw error;
    }
  }
  console.log(`${asMember ? "メンバー" : "管理者"}「${displayName}」を作成しました。表示名とPINでログインできます`);
}

main().catch((e) => {
  console.error("失敗しました:", e.message ?? e);
  process.exit(1);
});
