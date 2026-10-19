import Link from "next/link";
import { requireCookUser } from "@/lib/auth/session";
import { listMemberProfiles } from "@/lib/members";
import { listRecipes } from "@/lib/cook/queries";
import { PageHeader, Section } from "@/components/page";
import { logoutAction } from "@/app/actions/auth";
import { AvatarForm } from "@/app/(app)/mypage/profile/avatar-form";
import { DisplayNameForm, PinForm } from "@/app/(app)/mypage/profile/forms";

/** CondoCook のマイページ（自分のレシピの数、名前・アイコン・PIN。CondoCook だけの家族もここで変更できる） */
export default async function CookMyPage() {
  const [member, profiles, recipes] = await Promise.all([requireCookUser(), listMemberProfiles(), listRecipes()]);
  const me = profiles.find((p) => p.id === member.id);
  const mine = recipes.filter((r) => r.ownerId === member.id).length;
  return (
    <>
      <PageHeader title="マイ" />
      <Link href="/cook?scope=mine" className="mx-4 mb-4 flex items-center justify-between rounded-xl border border-border bg-surface p-4">
        <span>自分のレシピ</span>
        <span className="text-muted">
          {mine}件 <span aria-hidden>›</span>
        </span>
      </Link>
      {member.role === "admin" && member.apps === "all" && (
        <Link href="/cook/admin" className="mx-4 mb-4 flex items-center justify-between rounded-xl border border-border bg-surface p-4">
          <span>管理（食材の一覧・カテゴリ）</span>
          <span className="text-muted" aria-hidden>
            ›
          </span>
        </Link>
      )}
      <Section title="写真">
        <AvatarForm userId={member.id} name={member.displayName} avatarPath={me?.avatarPath ?? null} />
        <p className="mt-3 text-xs text-muted">グループのメンバーにだけ表示されます。CondoFit と共通です。</p>
      </Section>
      <Section title="表示名">
        <DisplayNameForm current={member.displayName} />
      </Section>
      <Section title="PIN変更">
        <PinForm />
      </Section>
      <Section>
        <form action={logoutAction}>
          <button type="submit" className="w-full rounded-lg border border-border px-4 py-2.5">
            ログアウト
          </button>
        </form>
      </Section>
    </>
  );
}
