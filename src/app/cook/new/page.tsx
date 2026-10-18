import { requireCookUser } from "@/lib/auth/session";
import { PageHeader, Section } from "@/components/page";

// 1a の実装途中の仮ページ（登録画面は次の段階で作る。docs/CONDOCOOK_1A_DESIGN.md 8章）
export default async function NewRecipePage() {
  await requireCookUser();
  return (
    <>
      <PageHeader title="レシピを登録" />
      <Section>
        <p className="text-sm text-muted">レシピの登録画面は準備中です。もうしばらくお待ちください。</p>
      </Section>
    </>
  );
}
