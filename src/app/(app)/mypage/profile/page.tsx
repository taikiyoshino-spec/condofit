import { requireMember } from "@/lib/auth/session";
import { PageHeader, Section } from "@/components/page";
import { logoutAction } from "@/app/actions/auth";
import { DisplayNameForm, PinForm, WithdrawForm } from "./forms";

export default async function ProfilePage() {
  const member = await requireMember();
  return (
    <>
      <PageHeader title="プロフィール" back="/mypage" />
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
