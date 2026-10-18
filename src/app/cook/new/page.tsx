import { requireCookUser } from "@/lib/auth/session";
import { getRecipe, listCategories, listIngredients } from "@/lib/cook/queries";
import { PageHeader } from "@/components/page";
import { RecipeEditor } from "../recipe-editor";
import { NewRecipe } from "./new-recipe";

const UUID_RE = /^[0-9a-f-]{36}$/i;

/** レシピの登録（URLから取り込み・手入力）。?copy=<id> で見えるレシピをコピーしてアレンジ */
export default async function NewRecipePage({ searchParams }: PageProps<"/cook/new">) {
  await requireCookUser();
  const { copy } = await searchParams;
  const [categories, ingredients, copyFrom] = await Promise.all([
    listCategories(),
    listIngredients(),
    typeof copy === "string" && UUID_RE.test(copy) ? getRecipe(copy) : Promise.resolve(null),
  ]);
  return (
    <>
      <PageHeader title={copyFrom ? "コピーしてアレンジ" : "レシピを登録"} back={copyFrom ? `/cook/r/${copyFrom.id}` : undefined} />
      {copyFrom ? (
        <RecipeEditor mode="new" recipe={null} copyFrom={copyFrom} categories={categories} ingredients={ingredients} />
      ) : (
        <NewRecipe categories={categories} ingredients={ingredients} />
      )}
    </>
  );
}
