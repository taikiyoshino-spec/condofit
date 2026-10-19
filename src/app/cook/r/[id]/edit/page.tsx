import { notFound } from "next/navigation";
import { requireCookUser } from "@/lib/auth/session";
import { getRecipe, listCategories, listIngredients } from "@/lib/cook/queries";
import { PageHeader } from "@/components/page";
import { RecipeEditor } from "../../../recipe-editor";

const UUID_RE = /^[0-9a-f-]{36}$/i;

/** 自分のレシピの編集（他人のレシピは「コピーしてアレンジ」。DB側でも作成者以外は保存できない） */
export default async function EditRecipePage({ params }: PageProps<"/cook/r/[id]/edit">) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const [member, recipe, categories, ingredients] = await Promise.all([
    requireCookUser(),
    getRecipe(id),
    listCategories(),
    listIngredients(),
  ]);
  if (!recipe || recipe.ownerId !== member.id) notFound();
  return (
    <>
      <PageHeader title="レシピを編集" back={`/cook/r/${id}`} />
      <RecipeEditor mode="edit" recipe={recipe} categories={categories} ingredients={ingredients} />
    </>
  );
}
