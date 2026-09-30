import { requireMember } from "@/lib/auth/session";
import { BottomNav } from "@/components/bottom-nav";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  await requireMember();
  return (
    <div className="mx-auto min-h-full max-w-lg pb-24">
      {children}
      <BottomNav />
    </div>
  );
}
