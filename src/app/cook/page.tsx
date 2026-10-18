import { requireCookUser } from "@/lib/auth/session";
import { logoutAction } from "@/app/actions/auth";

// 1a の実装途中の仮ページ（一覧・登録などは順に作る。docs/CONDOCOOK_1A_DESIGN.md 8章）
export default async function CookHomePage() {
  const member = await requireCookUser();
  return (
    <main className="px-4 py-12">
      <h1 className="text-2xl font-bold">CondoCook</h1>
      <p className="mt-2 text-sm text-muted">{member.displayName}さん、準備中です。もうしばらくお待ちください。</p>
      <form action={logoutAction} className="mt-8">
        <button type="submit" className="text-sm text-muted underline">
          ログアウト
        </button>
      </form>
    </main>
  );
}
