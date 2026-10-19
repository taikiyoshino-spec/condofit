import { requireCookAdmin } from "@/lib/auth/session";
import { listAllCategories } from "@/lib/cook/queries";
import { PageHeader } from "@/components/page";
import { CategoryEditor } from "./category-editor";

export default async function CookAdminCategoriesPage() {
  const [, categories] = await Promise.all([requireCookAdmin(), listAllCategories()]);
  return (
    <>
      <PageHeader title="レシピのカテゴリ" back="/cook/admin" />
      <p className="px-4 pb-3 text-xs text-muted">
        使わなくなったカテゴリは「非表示」にします。登録の画面と一覧の絞り込みに出なくなりますが、登録済みのレシピはそのまま残ります。
      </p>
      <CategoryEditor categories={categories} />
    </>
  );
}
