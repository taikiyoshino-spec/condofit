"use client";

import { useOptimistic, useTransition } from "react";
import {
  addShoppingItemsAction,
  deleteShoppingItemsAction,
  moveBoughtToPantryAction,
  setShoppingBoughtAction,
} from "@/app/actions/cook-shopping";
import { showToast } from "@/components/toaster";
import { groupShoppingItems, type ShoppingGroup, type ShoppingItem } from "@/lib/cook/shopping";
import type { IngredientOption } from "@/lib/cook/queries";
import { IngredientAddBox } from "../ingredient-add-box";

type Change = { type: "bought"; ids: string[]; bought: boolean } | { type: "delete"; ids: string[] };

export function ShoppingList({ items, ingredients }: { items: ShoppingItem[]; ingredients: IngredientOption[] }) {
  const [, startTransition] = useTransition();
  const [movePending, startMove] = useTransition();
  // 押した直後に画面へ反映する（保存はあとから）
  const [shown, apply] = useOptimistic(items, (list, c: Change) =>
    c.type === "delete" ? list.filter((i) => !c.ids.includes(i.id)) : list.map((i) => (c.ids.includes(i.id) ? { ...i, bought: c.bought } : i)),
  );
  const { pending, bought } = groupShoppingItems(shown);

  const setBought = (g: ShoppingGroup, value: boolean) =>
    startTransition(async () => {
      apply({ type: "bought", ids: g.ids, bought: value });
      const r = await setShoppingBoughtAction(g.ids, value);
      if (!r.ok) showToast(r.error);
    });
  const remove = (g: ShoppingGroup) =>
    startTransition(async () => {
      apply({ type: "delete", ids: g.ids });
      const r = await deleteShoppingItemsAction(g.ids);
      if (!r.ok) showToast(r.error);
    });
  const moveToPantry = () =>
    startMove(async () => {
      const r = await moveBoughtToPantryAction();
      if (!r.ok) return showToast(r.error);
      showToast(`${r.count ?? 0}品を食材リストに入れました`);
    });

  return (
    <div className="pb-8">
      <div className="mx-4 mb-4">
        <IngredientAddBox
          ingredients={ingredients}
          placeholder="買う物を追加（例：トリ）"
          withAmount
          onAdd={async (ingredient, name, amount) => {
            const r = await addShoppingItemsAction([{ ingredientId: ingredient?.id ?? null, name, amount, recipeId: null }]);
            if (!r.ok) showToast(r.error);
            return r.ok;
          }}
        />
      </div>

      {pending.length === 0 && bought.length === 0 ? (
        <p className="mx-4 rounded-xl border border-border bg-surface p-6 text-center text-sm text-muted">
          買う物はありません。レシピの「買い物リストに入れる」か、上の欄から追加できます。
        </p>
      ) : (
        <>
          {pending.length > 0 && <GroupList groups={pending} onToggle={(g) => setBought(g, true)} onRemove={remove} />}
          {pending.length === 0 && <p className="mx-4 mb-4 text-center text-sm text-muted">全部買いました！</p>}

          {bought.length > 0 && (
            <section className="mt-6">
              <div className="mx-4 mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-muted">買ったもの（{bought.length}）</h2>
              </div>
              <GroupList groups={bought} checked onToggle={(g) => setBought(g, false)} onRemove={remove} />
              <div className="mx-4 mt-3">
                <button
                  type="button"
                  disabled={movePending}
                  onClick={moveToPantry}
                  className="w-full rounded-xl bg-accent py-3 font-semibold text-accent-fg disabled:opacity-50"
                >
                  {movePending ? "入れています…" : `買ったものを食材リストへ（${bought.length}品）`}
                </button>
                <p className="mt-1.5 text-xs text-muted">家にある食材として記録し、買い物リストから消します。</p>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function GroupList({
  groups,
  checked = false,
  onToggle,
  onRemove,
}: {
  groups: ShoppingGroup[];
  checked?: boolean;
  onToggle: (g: ShoppingGroup) => void;
  onRemove: (g: ShoppingGroup) => void;
}) {
  // 売り場の分類ごとに見出しを付ける
  const sections: { category: string; groups: ShoppingGroup[] }[] = [];
  for (const g of groups) {
    const last = sections[sections.length - 1];
    if (last && last.category === g.category) last.groups.push(g);
    else sections.push({ category: g.category, groups: [g] });
  }
  return (
    <div className="mx-4 space-y-3">
      {sections.map((s) => (
        <div key={s.category}>
          {!checked && <h3 className="mb-1 text-xs font-semibold text-accent">{s.category}</h3>}
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
            {s.groups.map((g) => (
              <li key={g.key} className="flex items-center gap-3 px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggle(g)}
                  aria-label={checked ? `${g.name}を買っていないに戻す` : `${g.name}を買った`}
                  className="h-6 w-6 shrink-0 accent-[var(--accent)]"
                />
                <span className={`min-w-0 flex-1 ${checked ? "text-muted line-through" : ""}`}>
                  <span className="block">{g.name}</span>
                  {g.sources.length > 0 && <span className="block text-xs text-muted">{g.sources.join("・")}</span>}
                </span>
                <button type="button" onClick={() => onRemove(g)} aria-label={`${g.name}をリストから消す`} className="shrink-0 px-1 text-lg text-muted">
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
