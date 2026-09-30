import { requireMember } from "@/lib/auth/session";
import { MenuList, PageHeader } from "@/components/page";

export default async function MyPage() {
  const member = await requireMember();
  return (
    <>
      <PageHeader title="マイページ" />
      <p className="px-4 pb-4 text-sm text-muted">{member.displayName} さん</p>
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
