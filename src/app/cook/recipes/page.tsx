import Link from "next/link";
import { requireCookUser } from "@/lib/auth/session";
import { listCategories, listRecipes, myHouseholdMemberIds, myRecipeMarks } from "@/lib/cook/queries";
import { filterRecipes, type Scope } from "@/lib/cook/filter";
import { PageHeader } from "@/components/page";
import { RecipeListItem } from "../recipe-list-item";
import { NotificationBell } from "@/app/(app)/notification-bell";

const SCOPES: { value: Scope; label: string }[] = [
  { value: "all", label: "みんな" },
  { value: "household", label: "家族" },
  { value: "mine", label: "自分" },
];
const MARKS = { fav: "お気に入り", want: "作りたい" } as const;

/** レシピ一覧（検索・カテゴリ・みんな／家族／自分） */
export default async function CookHomePage({ searchParams }: PageProps<"/cook/recipes">) {
  const sp = await searchParams;
  const scope: Scope = sp.scope === "household" || sp.scope === "mine" ? sp.scope : "all";
  const q = typeof sp.q === "string" ? sp.q.slice(0, 50) : "";
  const categoryId = typeof sp.cat === "string" ? sp.cat : null;
  const kids = sp.kids === "1";
  const mark = sp.list === "fav" || sp.list === "want" ? sp.list : null;

  const [member, recipes, categories, householdIds, marks] = await Promise.all([
    requireCookUser(),
    listRecipes(),
    listCategories(),
    myHouseholdMemberIds(),
    myRecipeMarks(),
  ]);
  const onlyIds = mark === "fav" ? marks.favorites : mark === "want" ? marks.wants : undefined;
  const shown = filterRecipes(recipes, { scope, q, categoryId, myId: member.id, householdIds, onlyIds, kids });
  const categoryNames = new Map(categories.map((c) => [c.id, c.name]));

  const href = (over: Record<string, string | null>) => {
    const params = new URLSearchParams();
    const merged = { scope: scope === "all" ? null : scope, q: q || null, cat: categoryId, list: mark, kids: kids ? "1" : null, ...over };
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
    const s = params.toString();
    return s ? `/cook/recipes?${s}` : "/cook/recipes";
  };

  return (
    <>
      <PageHeader title={mark ? MARKS[mark] : "レシピ"} back={mark ? "/cook/me" : undefined} action={<HeaderActions myId={member.id} />} />
      <form action="/cook/recipes" className="mx-4 mb-3">
        {scope !== "all" && <input type="hidden" name="scope" value={scope} />}
        {categoryId && <input type="hidden" name="cat" value={categoryId} />}
        {mark && <input type="hidden" name="list" value={mark} />}
        {kids && <input type="hidden" name="kids" value="1" />}
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
          href={href({ kids: kids ? null : "1" })}
          aria-pressed={kids}
          className={`shrink-0 rounded-full border px-3 py-1 ${kids ? "border-accent bg-accent text-accent-fg" : "border-accent text-accent"}`}
        >
          子供向け
        </Link>
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
          ) : mark && onlyIds?.length === 0 ? (
            mark === "fav" ? "お気に入りはまだありません。レシピの「♡ お気に入り」で入れられます" : "「作りたい」はまだありません。レシピの「☆ 作りたい」で入れられます"
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

/** レシピ画面の上: ランキング・登録・通知 */
function HeaderActions({ myId }: { myId: string }) {
  const icon = "h-6 w-6";
  return (
    <div className="flex items-center">
      <Link href="/cook/ranking" aria-label="ランキング" className="rounded-full p-2">
        <svg viewBox="0 0 24 24" className={icon} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8M10 17h4" />
        </svg>
      </Link>
      <NotificationBell myId={myId} scope="cook" />
      <Link href="/cook/new" aria-label="レシピを登録" className="ml-1 flex h-9 w-9 items-center justify-center rounded-full bg-accent text-accent-fg">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden>
          <path d="M12 5v14M5 12h14" />
        </svg>
      </Link>
    </div>
  );
}
