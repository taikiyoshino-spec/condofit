"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { addShoppingItemsAction } from "@/app/actions/cook-shopping";
import { BottomSheet } from "@/components/bottom-sheet";
import { showToast } from "@/components/toaster";
import { scaleAmount } from "@/lib/cook/amount";
import type { RecipeIngredient } from "@/lib/cook/queries";

export type ShoppingHints = { inPantry: string[]; staples: string[]; inList: string[] };

/**
 * 材料一覧。「− N人分 ＋」で分量を換算して表示する（保存はしない。D18）。
 * レシピに何人分がないときは換算しない。選んだ人数は「作る」に引き継ぐ
 */
export function IngredientList({
  recipeId,
  ingredients,
  servings,
  initialServings,
  hints,
}: {
  recipeId: string;
  ingredients: RecipeIngredient[];
  servings: number | null;
  initialServings: number | null;
  hints: ShoppingHints;
}) {
  const [people, setPeople] = useState(initialServings ?? servings ?? 1);
  const [shopping, setShopping] = useState(false);
  const factor = servings ? people / servings : 1;

  // 「タレ」などのまとまりごとに並べる（まとまりのない材料が先）
  const groups: { section: string | null; items: RecipeIngredient[] }[] = [];
  for (const ing of ingredients) {
    const last = groups[groups.length - 1];
    if (last && last.section === ing.section) last.items.push(ing);
    else groups.push({ section: ing.section, items: [ing] });
  }

  return (
    <section className="mx-4 mb-5 rounded-xl border border-border bg-surface p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-lg font-semibold">材料</h2>
        {servings ? (
          <div className="flex items-center gap-1 text-sm" role="group" aria-label="何人分">
            <button
              type="button"
              aria-label="1人分減らす"
              disabled={people <= 1}
              onClick={() => setPeople((p) => Math.max(1, p - 1))}
              className="h-8 w-8 rounded-full border border-border disabled:opacity-30"
            >
              −
            </button>
            <span className="w-14 text-center font-medium">{people}人分</span>
            <button
              type="button"
              aria-label="1人分増やす"
              disabled={people >= 20}
              onClick={() => setPeople((p) => Math.min(20, p + 1))}
              className="h-8 w-8 rounded-full border border-border disabled:opacity-30"
            >
              ＋
            </button>
          </div>
        ) : null}
      </div>
      {servings && people !== servings && <p className="mb-2 text-xs text-muted">元のレシピは{servings}人分。分量を換算しています（目安）</p>}
      {groups.map((g, gi) => (
        <div key={gi} className={gi > 0 ? "mt-3" : ""}>
          {g.section && <h3 className="mb-1 text-sm font-semibold text-accent">{g.section}</h3>}
          <ul className="divide-y divide-border">
            {g.items.map((ing, i) => (
              <li key={i} className="flex items-baseline justify-between gap-3 py-2">
                <span>
                  {ing.name}
                  {ing.optional && <span className="ml-1 text-xs text-muted">（なくても可）</span>}
                </span>
                <span className="shrink-0 text-right font-medium">{scaleAmount(ing.amount, factor)}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <button type="button" onClick={() => setShopping(true)} className="mt-3 w-full rounded-lg border border-accent py-2 text-sm font-medium text-accent">
        買い物リストに入れる{servings ? `（${people}人分）` : ""}
      </button>
      <BottomSheet open={shopping} onClose={() => setShopping(false)} title="買い物リストに入れる">
        {shopping && (
          <ShoppingPicker recipeId={recipeId} ingredients={ingredients} factor={factor} hints={hints} onDone={() => setShopping(false)} />
        )}
      </BottomSheet>
      <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10 mx-auto max-w-lg px-4 pb-2">
        <Link
          href={`/cook/r/${recipeId}/cook${servings ? `?n=${people}` : ""}`}
          className="block w-full rounded-xl bg-accent py-3 text-center font-semibold text-accent-fg shadow-lg"
        >
          作る{servings ? `（${people}人分）` : ""}
        </Link>
      </div>
    </section>
  );
}

/** 買う材料を選ぶ。家にある・いつもある・もうリストにある材料は最初からチェックを外す */
function ShoppingPicker({
  recipeId,
  ingredients,
  factor,
  hints,
  onDone,
}: {
  recipeId: string;
  ingredients: RecipeIngredient[];
  factor: number;
  hints: ShoppingHints;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const note = (ing: RecipeIngredient) => {
    if (!ing.ingredientId) return null;
    if (hints.inList.includes(ing.ingredientId)) return "リストにある";
    if (hints.inPantry.includes(ing.ingredientId)) return "家にある";
    if (hints.staples.includes(ing.ingredientId)) return "いつもある";
    return null;
  };
  const [selected, setSelected] = useState(() => new Set(ingredients.flatMap((ing, i) => (note(ing) || ing.optional ? [] : [i]))));

  const add = () =>
    startTransition(async () => {
      const items = ingredients
        .filter((_, i) => selected.has(i))
        .map((ing) => ({ ingredientId: ing.ingredientId, name: ing.name, amount: scaleAmount(ing.amount, factor), recipeId }));
      const r = await addShoppingItemsAction(items);
      if (!r.ok) return showToast(r.error);
      showToast(r.count ? `${r.count}品を買い物リストに入れました` : "もう買い物リストに入っています");
      onDone();
    });

  return (
    <div className="space-y-3">
      <ul className="divide-y divide-border">
        {ingredients.map((ing, i) => {
          const n = note(ing);
          return (
            <li key={i}>
              <label className="flex items-center gap-3 py-2.5">
                <input
                  type="checkbox"
                  checked={selected.has(i)}
                  onChange={(e) =>
                    setSelected((s) => {
                      const next = new Set(s);
                      if (e.target.checked) next.add(i);
                      else next.delete(i);
                      return next;
                    })
                  }
                  className="h-5 w-5 shrink-0 accent-[var(--accent)]"
                />
                <span className="min-w-0 flex-1">
                  {ing.name}
                  {n && <span className="ml-2 text-xs text-muted">{n}</span>}
                  {ing.optional && <span className="ml-2 text-xs text-muted">なくても可</span>}
                </span>
                <span className="shrink-0 text-sm text-muted">{scaleAmount(ing.amount, factor)}</span>
              </label>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        disabled={pending || selected.size === 0}
        onClick={add}
        className="w-full rounded-lg bg-accent py-3 text-sm font-semibold text-accent-fg disabled:opacity-50"
      >
        {pending ? "入れています…" : `${selected.size}品を入れる`}
      </button>
    </div>
  );
}
