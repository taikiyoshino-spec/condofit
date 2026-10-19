import { requireCookAdmin } from "@/lib/auth/session";
import { listHouseholdsForAdmin } from "@/lib/cook/queries";
import { PageHeader } from "@/components/page";
import { HouseholdEditor } from "./household-editor";

export default async function CookAdminHouseholdsPage() {
  const [, data] = await Promise.all([requireCookAdmin(), listHouseholdsForAdmin()]);
  return (
    <>
      <PageHeader title="家族" back="/cook/admin" />
      <p className="px-4 pb-3 text-xs text-muted">
        同じ家族のメンバーは、買い物リスト・食材リスト・いつもあるを共有し、「家族だけ」のレシピが見えます。CondoCook を開くと1人ずつの家族ができるので、一緒に暮らすメンバーを同じ家族に移してください。移したことで空になった家族は、買い物リストや食材リストを移した先にまとめてから消します。
      </p>
      <HouseholdEditor households={data.households} noHousehold={data.noHousehold} />
    </>
  );
}
