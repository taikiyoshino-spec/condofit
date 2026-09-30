import { requireMember } from "@/lib/auth/session";
import { BottomNav } from "@/components/bottom-nav";
import { Toaster } from "@/components/toaster";
import { AppEffects } from "./app-effects";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const member = await requireMember();
  return (
    <div className="mx-auto min-h-full max-w-lg pb-24">
      {children}
      <Toaster />
      <AppEffects myId={member.id} />
      <BottomNav />
    </div>
  );
}
