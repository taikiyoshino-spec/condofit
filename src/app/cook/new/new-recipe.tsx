"use client";

import { useState, useTransition } from "react";
import { importRecipeAction, importRecipeFromImagesAction, type ImportDraft } from "@/app/actions/cook-import";
import { resizeToJpeg } from "@/lib/client/resize-image";
import type { Category, IngredientOption } from "@/lib/cook/queries";
import { RecipeEditor } from "../recipe-editor";

const MAX_IMAGES = 3;
// 文字が読める大きさに縮小してから送る
const IMAGE_SIDE = 1600;

/** 新規登録: レシピサイトのURL、または写真・スクリーンショットから取り込むか、そのまま手入力 */
export function NewRecipe({
  categories,
  ingredients,
  imageImport,
}: {
  categories: Category[];
  ingredients: IngredientOption[];
  /** 写真から取り込めるか（AIが使えるときだけ） */
  imageImport: boolean;
}) {
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

  const loadImages = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (files.length > MAX_IMAGES) return setError(`写真は${MAX_IMAGES}枚まで選べます`);
    startTransition(async () => {
      setError(null);
      const fd = new FormData();
      try {
        for (const file of Array.from(files)) fd.append("image", await resizeToJpeg(file, IMAGE_SIDE, 0.8), "image.jpg");
      } catch {
        return setError("写真を読み込めませんでした");
      }
      const r = await importRecipeFromImagesAction(fd);
      if (!r.ok) return setError(r.error);
      setImported({ draft: r.draft, usedAi: r.usedAi, at: Date.now() });
    });
  };

  const unmatched = imported?.draft.ingredients.filter((i) => !i.ingredientId).length ?? 0;

  return (
    <>
      <section className="mx-4 mb-4 rounded-xl border border-border bg-surface p-4">
        <h2 className="font-semibold">取り込む</h2>
        <h3 className="mt-2 text-sm font-semibold">レシピサイトのURLから</h3>
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
        {imageImport && (
          <div className="mt-4 border-t border-border pt-3">
            <h3 className="text-sm font-semibold">写真・スクショから取り込む</h3>
            <p className="mt-1 text-xs text-muted">
              料理本・手書きのメモ・アプリの画面などの写真から、AIが料理名・材料・作り方を読み取ります（{MAX_IMAGES}枚まで。続きのページはまとめて選んでください）。写真は Google
              のAI（Gemini）に送られるので、人の顔や個人情報が写らないようにしてください。
            </p>
            <label className={`mt-2 block w-full cursor-pointer rounded-lg border border-accent py-2 text-center text-sm font-medium text-accent ${pending ? "pointer-events-none opacity-50" : ""}`}>
              {pending ? "読み取り中…（少しかかります）" : "写真を選ぶ・撮る"}
              <input
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                disabled={pending}
                onChange={(e) => {
                  loadImages(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
        )}
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
