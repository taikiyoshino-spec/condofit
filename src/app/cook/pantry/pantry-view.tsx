"use client";

import { useState, useTransition } from "react";
import { addPantryItemsAction, removePantryItemsAction, setStapleAction, updatePantryItemAction } from "@/app/actions/cook-pantry";
import { addShoppingItemsAction } from "@/app/actions/cook-shopping";
import { BottomSheet } from "@/components/bottom-sheet";
import { NeedMark } from "@/components/form";
import { showToast } from "@/components/toaster";
import { INGREDIENT_CATEGORIES } from "@/lib/cook/ingredients";
import { expiryLabel, expiryStatus } from "@/lib/cook/pantry";
import type { IngredientOption, PantryItem, Purchase } from "@/lib/cook/queries";
import { IngredientAddBox } from "../ingredient-add-box";

const PURCHASE_CHIPS = 20;

const categoryOrder = (c: string) => {
  const i = (INGREDIENT_CATEGORIES as readonly string[]).indexOf(c);
  return i < 0 ? INGREDIENT_CATEGORIES.length : i;
};

export function PantryView({
  pantry,
  staples,
  purchases,
  ingredients,
  today,
}: {
  pantry: PantryItem[];
  staples: string[];
  purchases: Purchase[];
  ingredients: IngredientOption[];
  today: string;
}) {
  const [, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [cleaning, setCleaning] = useState(false);
  const editing = pantry.find((p) => p.id === editingId) ?? null;
  const expired = pantry.filter((p) => expiryStatus(p.expiresOn, today) === "expired");

  // 分類ごとに、期限の近い順
  const sections = [...new Set(pantry.map((p) => p.category))]
    .sort((a, b) => categoryOrder(a) - categoryOrder(b))
    .map((category) => ({ category, items: pantry.filter((p) => p.category === category) }));

  // よく買う物のうち、いま家にない物
  const have = new Set(pantry.map((p) => p.ingredientId ?? `name:${p.name}`));
  const chips = purchases.filter((p) => !have.has(p.ingredientId ?? `name:${p.name}`)).slice(0, PURCHASE_CHIPS);

  const add = (items: { ingredientId: string | null; name: string }[]) =>
    addPantryItemsAction(items).then((r) => {
      if (!r.ok) showToast(r.error);
      return r.ok;
    });

  return (
    <div className="pb-8">
      <div className="mx-4 mb-3">
        <IngredientAddBox
          ingredients={ingredients}
          placeholder="家にある食材を追加（例：トリ）"
          onAdd={(ingredient, name) => add([{ ingredientId: ingredient?.id ?? null, name }])}
        />
      </div>

      {chips.length > 0 && (
        <section className="mx-4 mb-4">
          <h2 className="mb-1.5 text-xs font-semibold text-muted">よく買う物から追加</h2>
          <div className="flex flex-wrap gap-1.5">
            {chips.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => startTransition(async () => void (await add([{ ingredientId: p.ingredientId, name: p.name }])))}
                className="rounded-full border border-border bg-surface px-3 py-1 text-sm"
              >
                ＋ {p.name}
              </button>
            ))}
          </div>
        </section>
      )}

      {expired.length > 0 && (
        <button
          type="button"
          onClick={() => setCleaning(true)}
          className="mx-4 mb-4 flex w-[calc(100%-2rem)] items-center justify-between rounded-xl border border-danger px-4 py-2.5 text-sm text-danger"
        >
          <span>期限切れの食材が{expired.length}品あります</span>
          <span className="font-semibold">まとめて消す ›</span>
        </button>
      )}

      {pantry.length === 0 ? (
        <p className="mx-4 rounded-xl border border-border bg-surface p-6 text-center text-sm text-muted">
          家にある食材はまだありません。上の欄から追加するか、買い物リストの「買ったものを食材リストへ」で入ります。
        </p>
      ) : (
        <div className="mx-4 space-y-3">
          {sections.map((s) => (
            <div key={s.category}>
              <h3 className="mb-1 text-xs font-semibold text-accent">{s.category}</h3>
              <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
                {s.items.map((p) => {
                  const status = expiryStatus(p.expiresOn, today);
                  const label = expiryLabel(p.expiresOn, today);
                  return (
                    <li key={p.id}>
                      <button type="button" onClick={() => setEditingId(p.id)} className="flex w-full items-center gap-2 px-3 py-2.5 text-left">
                        <span className="min-w-0 flex-1 truncate">{p.name}</span>
                        {p.storage === "freezer" && <span className="shrink-0 rounded bg-border px-1.5 text-xs text-muted">冷凍</span>}
                        {label && (
                          <span
                            className={`shrink-0 text-xs ${status === "expired" ? "font-semibold text-danger" : status === "soon" ? "font-semibold text-warn" : "text-muted"}`}
                          >
                            {label}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      <Staples staples={staples} ingredients={ingredients} />

      <BottomSheet open={editing !== null} onClose={() => setEditingId(null)} title={editing?.name ?? ""}>
        {editing && <PantryEditor key={editing.id} item={editing} today={today} onDone={() => setEditingId(null)} />}
      </BottomSheet>
      <BottomSheet open={cleaning} onClose={() => setCleaning(false)} title="期限切れの食材を消す">
        {cleaning && <ExpiredCleaner items={expired} onDone={() => setCleaning(false)} />}
      </BottomSheet>
    </div>
  );
}

function PantryEditor({ item, today, onDone }: { item: PantryItem; today: string; onDone: () => void }) {
  const [pending, startTransition] = useTransition();
  const [storage, setStorage] = useState(item.storage);
  const [expires, setExpires] = useState(item.expiresOn ?? "");
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, message: string) =>
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) return showToast(r.error ?? "保存できませんでした");
      showToast(message);
      onDone();
    });
  // 日付を変えなければ null（冷蔵／冷凍を変えたときは DB が目安を計算し直す）
  const save = () =>
    run(() => updatePantryItemAction(item.id, storage, expires && expires !== (item.expiresOn ?? "") ? expires : null), "保存しました");

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        {Number(item.boughtOn.slice(5, 7))}/{Number(item.boughtOn.slice(8, 10))}に買った
        {item.expiresOn && `・${expiryLabel(item.expiresOn, today)}`}
      </p>
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-border/60 p-1" role="radiogroup" aria-label="保存のしかた">
        {(["fridge", "freezer"] as const).map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={storage === s}
            onClick={() => setStorage(s)}
            className={`rounded-md py-2 text-sm ${storage === s ? "bg-surface font-semibold shadow-sm" : "text-muted"}`}
          >
            {s === "fridge" ? "冷蔵・常温" : "冷凍"}
          </button>
        ))}
      </div>
      <label className="block space-y-1">
        <span className="text-sm font-medium">
          期限の目安
          <NeedMark need="optional" />
        </span>
        <input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-base" />
        <span className="block text-xs text-muted">冷蔵・冷凍を切り替えると、買った日から目安を計算し直します</span>
      </label>
      <button type="button" disabled={pending} onClick={save} className="w-full rounded-lg bg-accent py-3 text-sm font-semibold text-accent-fg disabled:opacity-50">
        保存する
      </button>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            run(
              () => addShoppingItemsAction([{ ingredientId: item.ingredientId, name: item.name, amount: "", recipeId: null }]),
              "買い物リストに入れました",
            )
          }
          className="rounded-lg border border-border py-2.5 text-sm"
        >
          買い物リストに入れる
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => removePantryItemsAction([item.id]), `${item.name}を「ない」にしました`)}
          className="rounded-lg border border-danger py-2.5 text-sm text-danger"
        >
          ない（消す）
        </button>
      </div>
    </div>
  );
}

/** 期限切れをまとめて消す。初期値は全部チェック、消さないものは外す（D11） */
function ExpiredCleaner({ items, onDone }: { items: PantryItem[]; onDone: () => void }) {
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState(() => new Set(items.map((i) => i.id)));
  const remove = () =>
    startTransition(async () => {
      const r = await removePantryItemsAction([...selected]);
      if (!r.ok) return showToast(r.error);
      showToast(`${r.count ?? 0}品を消しました`);
      onDone();
    });
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">まだ使えるものはチェックを外してください。期限は目安です。</p>
      <ul className="divide-y divide-border">
        {items.map((p) => (
          <li key={p.id}>
            <label className="flex items-center gap-3 py-2.5">
              <input
                type="checkbox"
                checked={selected.has(p.id)}
                onChange={(e) =>
                  setSelected((s) => {
                    const next = new Set(s);
                    if (e.target.checked) next.add(p.id);
                    else next.delete(p.id);
                    return next;
                  })
                }
                className="h-5 w-5 shrink-0 accent-[var(--accent)]"
              />
              <span className="flex-1">{p.name}</span>
              {p.expiresOn && (
                <span className="text-xs text-danger">
                  {Number(p.expiresOn.slice(5, 7))}/{Number(p.expiresOn.slice(8, 10))}まで
                </span>
              )}
            </label>
          </li>
        ))}
      </ul>
      <button
        type="button"
        disabled={pending || selected.size === 0}
        onClick={remove}
        className="w-full rounded-lg bg-danger py-3 text-sm font-semibold text-white disabled:opacity-50"
      >
        {pending ? "消しています…" : `${selected.size}品を消す`}
      </button>
    </div>
  );
}

/** いつもある（調味料など）。在庫の出し入れはせず、切らしたら買い物リストに入れるだけ（D9） */
function Staples({ staples, ingredients }: { staples: string[]; ingredients: IngredientOption[] }) {
  const [pending, startTransition] = useTransition();
  const byId = new Map(ingredients.map((i) => [i.id, i]));
  const list = staples.map((id) => byId.get(id)).filter((i): i is IngredientOption => Boolean(i));
  const candidates = ingredients.filter((i) => !staples.includes(i.id));
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, message: string) =>
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) return showToast(r.error ?? "保存できませんでした");
      showToast(message);
    });

  return (
    <details className="mx-4 mt-6 rounded-xl border border-border bg-surface">
      <summary className="cursor-pointer px-4 py-3 font-semibold">
        いつもある<span className="ml-1 text-sm font-normal text-muted">（{list.length}）</span>
      </summary>
      <div className="px-4 pb-4">
        <p className="mb-3 text-xs text-muted">
          調味料など、いつも家にあるもの。レシピの提案や買い物リストで「ある」として扱います。切らしたときは「買う」で買い物リストに入れてください。
        </p>
        <div className="mb-3">
          <IngredientAddBox
            ingredients={candidates}
            placeholder="いつもあるに追加"
            requireMaster
            onAdd={async (ingredient) => {
              if (!ingredient) return false;
              const r = await setStapleAction(ingredient.id, true);
              if (!r.ok) showToast(r.error);
              return r.ok;
            }}
          />
        </div>
        <ul className="divide-y divide-border">
          {list.map((i) => (
            <li key={i.id} className="flex items-center gap-2 py-2">
              <span className="flex-1">{i.name}</span>
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => addShoppingItemsAction([{ ingredientId: i.id, name: i.name, amount: "", recipeId: null }]), `${i.name}を買い物リストに入れました`)}
                className="rounded-full border border-border px-3 py-1 text-xs"
              >
                買う
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => setStapleAction(i.id, false), `${i.name}をいつもあるから外しました`)}
                className="px-2 py-1 text-xs text-muted"
              >
                外す
              </button>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
