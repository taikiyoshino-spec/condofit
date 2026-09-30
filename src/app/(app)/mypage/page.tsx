import Link from "next/link";
import { requireMember } from "@/lib/auth/session";
import { MenuList, PageHeader } from "@/components/page";
import { Avatar } from "@/components/avatar";

export default async function MyPage() {
  const member = await requireMember();
  return (
    <>
      <PageHeader title="マイページ" />
      <Link href="/mypage/profile" className="mx-4 mb-4 flex items-center gap-3 rounded-xl border border-border bg-surface p-4">
        <Avatar userId={member.id} name={member.displayName} size={56} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-lg font-semibold">{member.displayName}</span>
          <span className="block text-xs text-muted">写真・表示名・PINを変更</span>
        </span>
        <span className="text-muted" aria-hidden>›</span>
      </Link>
      <MenuList
        items={[
          { href: "/mypage/profile", label: "プロフィール" },
          { href: "/mypage/activity", label: "個人活動" },
          { href: "/mypage/settings", label: "設定" },
        ]}
      />
    </>
  );
}
