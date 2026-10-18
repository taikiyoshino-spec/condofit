"use client";

import { useState, useTransition } from "react";
import { importRecipeAction, type ImportDraft } from "@/app/actions/cook-import";
import type { Category, IngredientOption } from "@/lib/cook/queries";
import { RecipeEditor } from "../recipe-editor";

/** 新規登録: レシピサイトのURLから取り込むか、そのまま手入力 */
export function NewRecipe({ categories, ingredients }: { categories: Category[]; ingredients: IngredientOption[] }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [imported, setImported] = useState<{ draft: ImportDraft; usedAi: boolean; at: number } | null>(null);
  const [pending, startTransition] = useTransition();

  const load = () =>
    startTransition(async () => {
      setError(null);
      const r = await importRecipeAction(url);
      if (!r.ok) return setError(r.error);
      setImported({ draft: r.draft, usedAi: r.usedAi, at: Date.now() });
      setUrl("");
    });

  const unmatched = imported?.draft.ingredients.filter((i) => !i.ingredientId).length ?? 0;

  return (
    <>
      <section className="mx-4 mb-4 rounded-xl border border-border bg-surface p-4">
        <h2 className="font-semibold">レシピサイトから取り込む</h2>
        <p className="mt-1 text-xs text-muted">URLを貼ると、料理名・材料・作り方が下に入ります。直してから登録してください（写真は取り込みません。出典は自動で入ります）。</p>
        <div className="mt-2 flex gap-2">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            inputMode="url"
            placeholder="https://"
            aria-label="レシピのURL"
            className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-base"
          />
          <button
            type="button"
            disabled={pending || !url.trim()}
            onClick={load}
            className="shrink-0 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-fg disabled:opacity-50"
          >
            {pending ? "読み込み中…" : "取り込む"}
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
        {imported && (
          <p className="mt-2 text-sm text-accent">
            「{imported.draft.title}」を取り込みました{imported.usedAi ? "（AIで読み取り）" : ""}。
            {unmatched > 0 && <span className="text-muted"> 食材の一覧にない材料が{unmatched}件あります（そのままでも登録できます）。</span>}
          </p>
        )}
      </section>
      <RecipeEditor
        key={imported?.at ?? "manual"}
        mode="new"
        recipe={null}
        imported={imported?.draft ?? null}
        categories={categories}
        ingredients={ingredients}
      />
    </>
  );
}
