import Link from "next/link";
import { requireCookUser } from "@/lib/auth/session";
import { listCategories, listPantry, listRecipes, myStapleIds, recentHouseholdCookIds } from "@/lib/cook/queries";
import { suggestRecipes } from "@/lib/cook/pantry";
import { FEATURES, parseFeatureKeys, recipeFeatures, toggleFeatureKey, type FeatureKey } from "@/lib/cook/filter";
import { todayJst } from "@/lib/date";
import { PageHeader } from "@/components/page";
import { RecipeThumb } from "../recipe-thumb";
import { Owner } from "../owner";

const LIMIT = 50;

/** 今ある食材で作れるレシピ（D17） */
export default async function SuggestPage({ searchParams }: PageProps<"/cook/suggest">) {
  const sp = await searchParams;
  const categoryId = typeof sp.cat === "string" ? sp.cat : null;
  // 特徴（子供向け・包丁不要など）。前の ?kids=1 も受ける
  const features = parseFeatureKeys(sp.f ?? (sp.kids === "1" ? "kids" : undefined));
  const href = (c: string | null, f: string | null) => {
    const params = new URLSearchParams();
    if (c) params.set("cat", c);
    if (f) params.set("f", f);
    const q = params.toString();
    return q ? `/cook/suggest?${q}` : "/cook/suggest";
  };
  const [, recipes, pantry, staples, recentIds, categories] = await Promise.all([
    requireCookUser(),
    listRecipes(),
    listPantry(),
    myStapleIds(),
    recentHouseholdCookIds(),
    listCategories(),
  ]);
  const today = todayJst();
  const suggestions = suggestRecipes(
    recipes.filter((r) => (!categoryId || r.categoryId === categoryId) && hasAll(r, features)),
    { pantry, staples, recentIds, today },
  ).slice(0, LIMIT);

  return (
    <>
      <PageHeader title="今日なに作る？" />
      <div className="mb-3 flex gap-1.5 overflow-x-auto px-4 pb-1 text-xs">
        {FEATURES.map((f) => {
          const on = features.includes(f.key);
          return (
            <Link
              key={f.key}
              href={href(categoryId, toggleFeatureKey(features, f.key))}
              aria-pressed={on}
              className={`shrink-0 rounded-full border px-3 py-1 ${on ? "border-accent bg-accent text-accent-fg" : "border-accent text-accent"}`}
            >
              {f.tag}
            </Link>
          );
        })}
        <Link
          href={href(null, features.length ? features.join(",") : null)}
          className={`shrink-0 rounded-full border px-3 py-1 ${!categoryId ? "border-accent bg-accent text-accent-fg" : "border-border"}`}
        >
          すべて
        </Link>
        {categories.map((c) => (
          <Link
            key={c.id}
            href={href(c.id, features.length ? features.join(",") : null)}
            className={`shrink-0 rounded-full border px-3 py-1 ${categoryId === c.id ? "border-accent bg-accent text-accent-fg" : "border-border"}`}
          >
            {c.name}
          </Link>
        ))}
      </div>

      {pantry.length === 0 ? (
        <div className="mx-4 rounded-xl border border-border bg-surface p-6 text-center text-sm text-muted">
          家にある食材がまだありません。
          <Link href="/cook/pantry" className="mt-2 block font-medium text-accent">
            食材を入れる ›
          </Link>
        </div>
      ) : suggestions.length === 0 ? (
        <p className="mx-4 rounded-xl border border-border bg-surface p-6 text-center text-sm text-muted">
          家にある食材を使うレシピが見つかりませんでした
        </p>
      ) : (
        <ul className="mx-4 space-y-2">
          {suggestions.map(({ recipe, toBuy, expiring, recent }) => (
            <li key={recipe.id}>
              <Link href={`/cook/r/${recipe.id}`} className="flex gap-3 rounded-xl border border-border bg-surface p-2.5">
                <RecipeThumb recipeId={recipe.id} title={recipe.title} thumbPath={recipe.thumbPath} size={64} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{recipe.title}</span>
                  <Owner userId={recipe.ownerId} className="mt-0.5 text-xs text-muted" />
                  <span className="mt-1 block text-xs">
                    {toBuy.length === 0 ? (
                      <span className="font-semibold text-accent">材料は全部ある！</span>
                    ) : (
                      <>
                        <span className="font-semibold">買う物 {toBuy.length}</span>
                        <span className="text-muted">：{toBuy.slice(0, 4).join("、")}{toBuy.length > 4 ? " など" : ""}</span>
                      </>
                    )}
                  </span>
                  {expiring.length > 0 && <span className="block text-xs text-warn">期限が近い {expiring.join("、")} を使う</span>}
                  <span className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted">
                    {recipe.cookedCount > 0 && <span>作った {recipe.cookedCount}</span>}
                    {recipe.favoriteCount > 0 && <span>♥ {recipe.favoriteCount}</span>}
                    {recent && <span>最近作った</span>}
                    {recipeFeatures(recipe).map((f) => (
                      <span key={f.key} className="font-medium text-accent">
                        {f.tag}
                      </span>
                    ))}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="mx-4 mt-3 text-xs text-muted">
        買う物が少ない順に並べています（いつもある調味料・なくても可の材料は数えません）。同じなら期限が近い食材を使うもの、人気のものが先。1週間以内に家族が作ったものは下にしています。
      </p>
    </>
  );
}

/** 選んだ特徴がすべて付いているか */
function hasAll(r: { tags: string[] }, keys: FeatureKey[]) {
  const tags = recipeFeatures(r).map((f) => f.key);
  return keys.every((k) => tags.includes(k));
}
