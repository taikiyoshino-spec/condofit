"use client";

import { useState } from "react";
import { scaleAmount } from "@/lib/cook/amount";
import type { RecipeIngredient } from "@/lib/cook/queries";

/**
 * 材料一覧。「− N人分 ＋」で分量を換算して表示する（保存はしない。D18）。
 * レシピに何人分がないときは換算しない
 */
export function IngredientList({
  ingredients,
  servings,
  initialServings,
}: {
  ingredients: RecipeIngredient[];
  servings: number | null;
  initialServings: number | null;
}) {
  const [people, setPeople] = useState(initialServings ?? servings ?? 1);
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
    </section>
  );
}
