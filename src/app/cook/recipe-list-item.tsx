import Link from "next/link";
import type { RecipeSummary } from "@/lib/cook/queries";
import { RecipeThumb } from "./recipe-thumb";
import { Owner } from "./owner";
import { recipeFeatures } from "@/lib/cook/filter";

const VISIBILITY_LABEL = { group: null, household: "家族だけ", private: "自分だけ" } as const;

export function RecipeListItem({ recipe, categoryName }: { recipe: RecipeSummary; categoryName: string | null }) {
  const badge = VISIBILITY_LABEL[recipe.visibility];
  return (
    <Link href={`/cook/r/${recipe.id}`} className="flex items-center gap-3 rounded-xl border border-border bg-surface p-2.5">
      <RecipeThumb recipeId={recipe.id} title={recipe.title} thumbPath={recipe.thumbPath} size={64} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{recipe.title}</span>
        <Owner userId={recipe.ownerId} className="mt-0.5 text-xs text-muted" />
        <span className="mt-1 flex flex-wrap gap-x-2 text-xs text-muted">
          {recipeFeatures(recipe).map((f) => (
            <span key={f.key} className="font-medium text-accent">
              {f.tag}
            </span>
          ))}
          {categoryName && <span>{categoryName}</span>}
          {recipe.cookMinutes && <span>{recipe.cookMinutes}分</span>}
          {recipe.cookedCount > 0 && <span>作った {recipe.cookedCount}</span>}
          {recipe.favoriteCount > 0 && <span>♥ {recipe.favoriteCount}</span>}
          {badge && <span className="text-warn">{badge}</span>}
        </span>
      </span>
    </Link>
  );
}
