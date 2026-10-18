import { notFound } from "next/navigation";
import { requireCookUser } from "@/lib/auth/session";
import { getRecipe, myHouseholdSize } from "@/lib/cook/queries";
import { CookMode } from "./cook-mode";

const UUID_RE = /^[0-9a-f-]{36}$/i;

/** 作るモード。?n=人数 で分量を換算（レシピ画面で選んだ人数を引き継ぐ） */
export default async function CookModePage({ params, searchParams }: PageProps<"/cook/r/[id]/cook">) {
  await requireCookUser();
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const [recipe, householdSize] = await Promise.all([getRecipe(id), myHouseholdSize()]);
  if (!recipe) notFound();
  const n = Number((await searchParams).n);
  const people = recipe.servings ? (Number.isInteger(n) && n >= 1 && n <= 20 ? n : householdSize) : null;
  const factor = recipe.servings && people ? people / recipe.servings : 1;
  return (
    <CookMode
      recipeId={recipe.id}
      title={recipe.title}
      ingredients={recipe.ingredients}
      steps={recipe.steps}
      factor={factor}
      people={people}
    />
  );
}
