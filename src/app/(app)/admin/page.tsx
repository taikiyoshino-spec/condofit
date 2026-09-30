import { requireAdmin } from "@/lib/auth/session";
import { hasActiveInvite, listMembers } from "@/lib/auth/service";
import { PageHeader, Section } from "@/components/page";
import { InviteForm, MemberActions } from "./forms";

export default async function AdminPage() {
  const admin = await requireAdmin();
  const [invite, members] = await Promise.all([hasActiveInvite(admin), listMembers(admin)]);
  const adminCount = members.filter((m) => m.role === "admin").length;

  return (
    <>
      <PageHeader title="管理者メニュー" back="/mypage/settings" />
      <Section title="招待URL">
        <p className="mb-3 text-sm text-muted">
          {invite
            ? `有効な招待URLがあります（${new Date(invite.createdAt).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })} 発行）。URLは発行時にしか表示できません。`
            : "有効な招待URLはありません。"}
          新しく発行すると、以前のURLは使えなくなります。
        </p>
        <InviteForm />
      </Section>
      <Section title={`メンバー（${members.length}人）`}>
        <ul className="divide-y divide-border">
          {members.map((m) => (
            <li key={m.userId} className="py-3">
              <div className="flex items-center justify-between">
                <span className="font-medium">
                  {m.displayName}
                  {m.userId === admin.id && <span className="ml-1 text-xs text-muted">（自分）</span>}
                </span>
                <span className="text-xs text-muted">{m.role === "admin" ? "管理者" : "メンバー"}</span>
              </div>
              <MemberActions
                userId={m.userId}
                displayName={m.displayName}
                role={m.role}
                isSelf={m.userId === admin.id}
                isLastAdmin={m.role === "admin" && adminCount <= 1}
              />
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}
