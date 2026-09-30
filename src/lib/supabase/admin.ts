import "server-only";
import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env";

/**
 * service_role クライアント（RLSをバイパス）。
 * 認証・50m判定など、サーバー側で権限確認を済ませた処理からのみ使う。
 */
export function createAdminClient() {
  return createClient(serverEnv.supabaseUrl, serverEnv.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
