import { requireCookUser } from "@/lib/auth/session";
import { listMemberProfiles } from "@/lib/members";
import { createClient } from "@/lib/supabase/server";
import { MembersProvider } from "@/components/avatar";
import { Toaster } from "@/components/toaster";

// CondoCook（レシピ共有・食材管理）。CondoFit のタブやメニューは出さない（RECIPE_SPEC.md D25）
export default async function CookLayout({ children }: LayoutProps<"/cook">) {
  await requireCookUser();
  const supabase = await createClient();
  // 家族に入っていなければ「1人の家族」を用意する（D6）
  const [profiles] = await Promise.all([listMemberProfiles(), supabase.rpc("ensure_my_household")]);
  return (
    <MembersProvider profiles={profiles}>
      <div className="mx-auto min-h-full max-w-lg pb-24">
        {children}
        <Toaster />
      </div>
    </MembersProvider>
  );
}
