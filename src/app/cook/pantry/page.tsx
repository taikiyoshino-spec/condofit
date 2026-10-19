import Link from "next/link";
import { requireCookUser } from "@/lib/auth/session";
import { listIngredients, listPantry, listPurchases, myStapleIds } from "@/lib/cook/queries";
import { todayJst } from "@/lib/date";
import { PageHeader } from "@/components/page";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { PantryView } from "./pantry-view";

/** 家にある食材（家族で共有。量は持たず「ある／ない」だけ。D8〜D11） */
export default async function PantryPage() {
  const [, pantry, staples, purchases, ingredients] = await Promise.all([
    requireCookUser(),
    listPantry(),
    myStapleIds(),
    listPurchases(),
    listIngredients(),
  ]);
  return (
    <>
      <RealtimeRefresh tables={["pantry_items"]} />
      <PageHeader title="食材" />
      <Link href="/cook/suggest" className="mx-4 mb-4 flex items-center justify-between rounded-xl bg-accent px-4 py-3 font-semibold text-accent-fg">
        <span>今ある食材で作れるレシピ</span>
        <span aria-hidden>›</span>
      </Link>
      <PantryView pantry={pantry} staples={staples} purchases={purchases} ingredients={ingredients} today={todayJst()} />
    </>
  );
}
