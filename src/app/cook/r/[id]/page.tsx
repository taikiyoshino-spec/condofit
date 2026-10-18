import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCookUser } from "@/lib/auth/session";
import { getRecipe, listCategories, myHouseholdSize } from "@/lib/cook/queries";
import { PageHeader } from "@/components/page";
import { Owner } from "../../owner";
import { IngredientList } from "./ingredient-list";
import { DeleteRecipeButton } from "./delete-button";

const UUID_RE = /^[0-9a-f-]{36}$/i;
const VISIBILITY_LABEL = { group: "グループに公開", household: "家族だけに公開", private: "自分だけ" } as const;

export default async function RecipePage({ params }: PageProps<"/cook/r/[id]">) {
  const member = await requireCookUser();
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const [recipe, categories, householdSize] = await Promise.all([getRecipe(id), listCategories(), myHouseholdSize()]);
  if (!recipe) notFound();
  const category = categories.find((c) => c.id === recipe.categoryId)?.name;
  const isOwner = recipe.ownerId === member.id;

  return (
    <article className="pb-8">
      <PageHeader title="レシピ" back="/cook" />
      {recipe.photoPath && (
        // eslint-disable-next-line @next/next/no-img-element -- 認証付きの配信なので next/image の最適化は使わない
        <img
          src={`/api/cook/photo/${recipe.id}?size=full&v=${recipe.photoPath.split("/").pop()?.split(".")[0] ?? ""}`}
          alt=""
          className="mb-3 aspect-[4/3] w-full bg-border object-cover"
        />
      )}
      <header className="mx-4 mb-4">
        <h1 className="text-2xl font-bold leading-tight">{recipe.title}</h1>
        <Owner userId={recipe.ownerId} size={22} className="mt-2 text-sm" />
        <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted">
          {category && <span>{category}</span>}
          {recipe.cookMinutes && <span>{recipe.cookMinutes}分</span>}
          {recipe.visibility !== "group" && <span className="text-warn">{VISIBILITY_LABEL[recipe.visibility]}</span>}
          {recipe.tags.map((t) => (
            <span key={t}>#{t}</span>
          ))}
        </p>
        {recipe.copiedFrom && (
          <p className="mt-1 text-xs text-muted">
            <Link href={`/cook/r/${recipe.copiedFrom.id}`} className="underline">
              {recipe.copiedFrom.title}
            </Link>
            をアレンジ
          </p>
        )}
        {recipe.sourceUrl && (
          <p className="mt-1 text-xs text-muted">
            出典：
            <a href={recipe.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="underline">
              {recipe.sourceName || new URL(recipe.sourceUrl).hostname}
            </a>
          </p>
        )}
      </header>

      <IngredientList ingredients={recipe.ingredients} servings={recipe.servings} initialServings={recipe.servings ? householdSize : null} />

      <section className="mx-4 mb-4">
        <h2 className="mb-2 text-lg font-semibold">作り方</h2>
        <ol className="space-y-3">
          {recipe.steps.map((s, i) => (
            <li key={i} className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-accent-fg">
                {i + 1}
              </span>
              <p className="flex-1 whitespace-pre-wrap pt-0.5 leading-relaxed">{s}</p>
            </li>
          ))}
        </ol>
      </section>

      {recipe.memo && (
        <section className="mx-4 mb-4 rounded-xl border border-border bg-surface p-4">
          <h2 className="mb-1 text-sm font-semibold">メモ・コツ</h2>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{recipe.memo}</p>
        </section>
      )}

      {(isOwner || member.role === "admin") && (
        <div className="mx-4 mt-6">
          <DeleteRecipeButton recipeId={recipe.id} title={recipe.title} />
        </div>
      )}
    </article>
  );
}
