import { requireMember } from "@/lib/auth/session";
import { listMemberProfiles } from "@/lib/members";
import { BottomNav } from "@/components/bottom-nav";
import { Toaster } from "@/components/toaster";
import { MembersProvider } from "@/components/avatar";
import { AppEffects } from "./app-effects";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const [member, profiles] = await Promise.all([requireMember(), listMemberProfiles()]);
  const me = profiles.find((p) => p.id === member.id);
  return (
    <MembersProvider profiles={profiles}>
      <div className="mx-auto min-h-full max-w-lg pb-24">
        {children}
        <Toaster />
        <AppEffects myId={member.id} myName={member.displayName} myAvatarPath={me?.avatarPath ?? null} />
        <BottomNav />
      </div>
    </MembersProvider>
  );
}
