import { requireCookAdmin } from "@/lib/auth/session";
import { MenuList, PageHeader } from "@/components/page";

/** CondoCook の管理（管理者のみ）。メンバーの管理は CondoFit の管理画面で行う */
export default async function CookAdminPage() {
  await requireCookAdmin();
  return (
    <>
      <PageHeader title="管理" back="/cook/me" />
      <MenuList
        items={[
          { href: "/cook/admin/households", label: "家族" },
          { href: "/cook/admin/ingredients", label: "食材の一覧" },
          { href: "/cook/admin/categories", label: "レシピのカテゴリ" },
        ]}
      />
    </>
  );
}
