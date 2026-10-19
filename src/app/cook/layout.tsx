import type { Metadata, Viewport } from "next";
import { requireCookUser } from "@/lib/auth/session";
import { listMemberProfiles } from "@/lib/members";
import { createClient } from "@/lib/supabase/server";
import { MembersProvider } from "@/components/avatar";
import { Toaster } from "@/components/toaster";
import { CookNav } from "./cook-nav";
import { CookEffects } from "./cook-effects";

// CondoCook（レシピ共有・食材管理）。CondoFit のタブやメニューは出さない（RECIPE_SPEC.md D25）
export const metadata: Metadata = {
  title: { default: "CondoCook", template: "%s | CondoCook" },
  description: "仲間のレシピで、今日なに作る？",
  manifest: "/cook/manifest.webmanifest",
  appleWebApp: { capable: true, title: "CondoCook", statusBarStyle: "default" },
  icons: { icon: "/icons/cook-192.png", apple: "/icons/cook-apple-touch-icon.png" },
};

export const viewport: Viewport = { themeColor: "#b9501a" };

export default async function CookLayout({ children }: LayoutProps<"/cook">) {
  await requireCookUser();
  const supabase = await createClient();
  // 家族に入っていなければ「1人の家族」を用意する（D6）
  const [profiles] = await Promise.all([listMemberProfiles(), supabase.rpc("ensure_my_household")]);
  return (
    <MembersProvider profiles={profiles}>
      <div className="theme-cook mx-auto min-h-full max-w-lg pb-24">
        {children}
        <Toaster />
        <CookNav />
        <CookEffects />
      </div>
    </MembersProvider>
  );
}
