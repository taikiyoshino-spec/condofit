import Link from "next/link";
import { requireCookUser } from "@/lib/auth/session";
import { listMemberProfiles } from "@/lib/members";
import { listRecipes, myRecipeMarks } from "@/lib/cook/queries";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Section } from "@/components/page";
import { logoutAction } from "@/app/actions/auth";
import { AvatarForm } from "@/app/(app)/mypage/profile/avatar-form";
import { DisplayNameForm, PinForm } from "@/app/(app)/mypage/profile/forms";
import { PushToggle, SettingToggles } from "@/app/(app)/mypage/settings/notifications/controls";

const NOTIFY_ITEMS = [
  { key: "cook_cooked", label: "作った", hint: "自分のレシピを誰かが作ったとき" },
  { key: "cook_reaction", label: "コメント・お気に入り", hint: "自分のレシピへのコメント・お気に入り、コメントへの返事" },
  { key: "cook_new_recipe", label: "新しいレシピ", hint: "仲間が新しいレシピをグループに公開したとき" },
  { key: "cook_shopping", label: "買い物リスト", hint: "家族が買い物リストに追加したとき（続けて追加したときは5分後にまとめて1回）" },
] as const;

/** CondoCook のマイページ（自分のレシピの数、名前・アイコン・PIN。CondoCook だけの家族もここで変更できる） */
export default async function CookMyPage() {
  const member = await requireCookUser();
  const supabase = await createClient();
  const [profiles, recipes, marks, { data: settings }] = await Promise.all([
    listMemberProfiles(),
    listRecipes(),
    myRecipeMarks(),
    supabase.from("notification_settings").select("cook_cooked, cook_reaction, cook_new_recipe, cook_shopping").eq("user_id", member.id).maybeSingle(),
  ]);
  const me = profiles.find((p) => p.id === member.id);
  const visible = new Set(recipes.map((r) => r.id));
  const lists = [
    { href: "/cook?scope=mine", label: "自分のレシピ", count: recipes.filter((r) => r.ownerId === member.id).length },
    { href: "/cook?list=fav", label: "お気に入り", count: marks.favorites.filter((id) => visible.has(id)).length },
    { href: "/cook?list=want", label: "作りたい", count: marks.wants.filter((id) => visible.has(id)).length },
    { href: "/cook/ranking", label: "ランキング", count: null },
  ];
  return (
    <>
      <PageHeader
        title="マイ"
        action={
          // CondoFit も使える人だけ（CondoCook だけの家族は CondoFit に入れない）
          member.apps === "all" ? (
            <Link href="/" className="rounded-full border border-border px-3 py-1.5 text-sm">
              CondoFit へ <span aria-hidden>›</span>
            </Link>
          ) : null
        }
      />
      <ul className="mx-4 mb-4 divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
        {lists.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="flex items-center justify-between px-4 py-3.5">
              <span>{l.label}</span>
              <span className="text-muted">
                {l.count !== null && `${l.count}件 `}
                <span aria-hidden>›</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {member.role === "admin" && member.apps === "all" && (
        <Link href="/cook/admin" className="mx-4 mb-4 flex items-center justify-between rounded-xl border border-border bg-surface p-4">
          <span>管理（家族・食材の一覧・カテゴリ）</span>
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
      <Section title="通知">
        <PushToggle vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""} />
        <div className="mt-3 border-t border-border pt-1">
          <SettingToggles initial={settings ?? {}} items={[...NOTIFY_ITEMS]} />
        </div>
        <p className="mt-2 text-xs text-muted">プッシュ通知の受け取りは CondoFit と共通です（この端末ごと）。</p>
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
