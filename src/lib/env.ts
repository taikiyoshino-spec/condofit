import "server-only";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`環境変数 ${name} が設定されていません`);
  return value;
}

export const serverEnv = {
  get supabaseUrl() {
    return required("NEXT_PUBLIC_SUPABASE_URL");
  },
  get supabaseAnonKey() {
    return required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  },
  get serviceRoleKey() {
    return required("SUPABASE_SERVICE_ROLE_KEY");
  },
  get pinPepper() {
    return required("PIN_PEPPER");
  },
};
