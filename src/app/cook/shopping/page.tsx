import { requireCookUser } from "@/lib/auth/session";
import { listIngredients, listShoppingItems } from "@/lib/cook/queries";
import { PageHeader } from "@/components/page";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { ShoppingList } from "./shopping-list";

/** 家族で共有する買い物リスト（D19） */
export default async function ShoppingPage() {
  const [, items, ingredients] = await Promise.all([requireCookUser(), listShoppingItems(), listIngredients()]);
  return (
    <>
      <RealtimeRefresh tables={["shopping_items"]} />
      <PageHeader title="買い物リスト" />
      <ShoppingList items={items} ingredients={ingredients} />
    </>
  );
}
