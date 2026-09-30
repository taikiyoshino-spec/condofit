import { requireMember } from "@/lib/auth/session";
import { MenuList, PageHeader, Section } from "@/components/page";
import { logoutAction } from "@/app/actions/auth";

export default async function SettingsPage() {
  const member = await requireMember();
  const items = [
    { href: "/mypage/settings/notifications", label: "通知設定" },
    { href: "/mypage/settings/legal", label: "利用規約 / プライバシー" },
  ];
  if (member.role === "admin") items.push({ href: "/admin", label: "管理者メニュー" });
  return (
    <>
      <PageHeader title="設定" back="/mypage" />
      <MenuList items={items} />
      <Section title="アプリ情報">
        <p className="text-sm text-muted">CondoFit v{process.env.npm_package_version ?? "0.1.0"}</p>
      </Section>
      <Section>
        <form action={logoutAction}>
          <button type="submit" className="w-full rounded-lg border border-border px-4 py-2.5">ログアウト</button>
        </form>
      </Section>
    </>
  );
}
