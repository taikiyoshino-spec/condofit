import { requireMember } from "@/lib/auth/session";
import { listMemberProfiles } from "@/lib/members";
import { PageHeader, Section } from "@/components/page";
import { logoutAction } from "@/app/actions/auth";
import { DisplayNameForm, PinForm, WithdrawForm } from "./forms";
import { AvatarForm } from "./avatar-form";

export default async function ProfilePage() {
  const member = await requireMember();
  const me = (await listMemberProfiles()).find((p) => p.id === member.id);
  return (
    <>
      <PageHeader title="プロフィール" back="/mypage" />
      <Section title="写真">
        <AvatarForm userId={member.id} name={member.displayName} avatarPath={me?.avatarPath ?? null} />
        <p className="mt-3 text-xs text-muted">グループのメンバーにだけ表示されます。正方形に切り抜いて小さくしてから保存します。</p>
      </Section>
      <Section title="表示名">
        <DisplayNameForm current={member.displayName} />
      </Section>
      <Section title="PIN変更">
        <PinForm />
      </Section>
      <Section>
        <form action={logoutAction}>
          <button type="submit" className="w-full rounded-lg border border-border px-4 py-2.5">ログアウト</button>
        </form>
      </Section>
      <Section title="退会">
        <WithdrawForm />
      </Section>
    </>
  );
}
