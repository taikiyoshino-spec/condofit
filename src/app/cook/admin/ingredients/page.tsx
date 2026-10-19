import { requireCookAdmin } from "@/lib/auth/session";
import { listAllIngredients } from "@/lib/cook/queries";
import { PageHeader } from "@/components/page";
import { IngredientAdmin } from "./ingredient-admin";

export default async function CookAdminIngredientsPage() {
  const [, ingredients] = await Promise.all([requireCookAdmin(), listAllIngredients()]);
  return (
    <>
      <PageHeader title="食材の一覧" back="/cook/admin" />
      <IngredientAdmin ingredients={ingredients} />
    </>
  );
}
