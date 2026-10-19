import Link from "next/link";
import { requireCookUser } from "@/lib/auth/session";
import { listCategories, listRecipes, myHouseholdMemberIds } from "@/lib/cook/queries";
import { filterRecipes, type Scope } from "@/lib/cook/filter";
import { PageHeader } from "@/components/page";
import { RecipeListItem } from "./recipe-list-item";

const SCOPES: { value: Scope; label: string }[] = [
  { value: "all", label: "みんな" },
  { value: "household", label: "家族" },
  { value: "mine", label: "自分" },
];

/** レシピ一覧（検索・カテゴリ・みんな／家族／自分） */
export default async function CookHomePage({ searchParams }: PageProps<"/cook">) {
  const sp = await searchParams;
  const scope: Scope = sp.scope === "household" || sp.scope === "mine" ? sp.scope : "all";
  const q = typeof sp.q === "string" ? sp.q.slice(0, 50) : "";
  const categoryId = typeof sp.cat === "string" ? sp.cat : null;

  const [member, recipes, categories, householdIds] = await Promise.all([
    requireCookUser(),
    listRecipes(),
    listCategories(),
    myHouseholdMemberIds(),
  ]);
  const shown = filterRecipes(recipes, { scope, q, categoryId, myId: member.id, householdIds });
  const categoryNames = new Map(categories.map((c) => [c.id, c.name]));

  const href = (over: Record<string, string | null>) => {
    const params = new URLSearchParams();
    const merged = { scope: scope === "all" ? null : scope, q: q || null, cat: categoryId, ...over };
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
    const s = params.toString();
    return s ? `/cook?${s}` : "/cook";
  };

  return (
    <>
      <PageHeader title="レシピ" />
      <form action="/cook" className="mx-4 mb-3">
        {scope !== "all" && <input type="hidden" name="scope" value={scope} />}
        {categoryId && <input type="hidden" name="cat" value={categoryId} />}
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="料理名・材料で探す（例：鶏もも 卵）"
          aria-label="レシピを探す"
          className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-base"
        />
      </form>

      <div className="mx-4 mb-2 grid grid-cols-3 rounded-lg border border-border bg-surface p-0.5 text-sm" role="tablist">
        {SCOPES.map((s) => (
          <Link
            key={s.value}
            href={href({ scope: s.value === "all" ? null : s.value })}
            role="tab"
            aria-selected={scope === s.value}
            className={`rounded-md py-1.5 text-center ${scope === s.value ? "bg-accent font-medium text-accent-fg" : "text-muted"}`}
          >
            {s.label}
          </Link>
        ))}
      </div>

      <div className="mb-3 flex gap-1.5 overflow-x-auto px-4 pb-1 text-xs">
        <Link
          href={href({ cat: null })}
          className={`shrink-0 rounded-full border px-3 py-1 ${!categoryId ? "border-accent bg-accent text-accent-fg" : "border-border"}`}
        >
          すべて
        </Link>
        {categories.map((c) => (
          <Link
            key={c.id}
            href={href({ cat: c.id })}
            className={`shrink-0 rounded-full border px-3 py-1 ${categoryId === c.id ? "border-accent bg-accent text-accent-fg" : "border-border"}`}
          >
            {c.name}
          </Link>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="mx-4 rounded-xl border border-border bg-surface p-6 text-center text-sm text-muted">
          {recipes.length === 0 ? (
            <>
              まだレシピがありません。
              <Link href="/cook/new" className="mt-2 block font-medium text-accent">
                最初のレシピを登録する ›
              </Link>
            </>
          ) : (
            "条件に合うレシピがありません"
          )}
        </div>
      ) : (
        <ul className="mx-4 space-y-2">
          {shown.map((r) => (
            <li key={r.id}>
              <RecipeListItem recipe={r} categoryName={r.categoryId ? categoryNames.get(r.categoryId) ?? null : null} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
