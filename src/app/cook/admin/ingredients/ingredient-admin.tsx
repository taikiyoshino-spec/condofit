"use client";

import { useState, useTransition } from "react";
import { mergeIngredientAction, updateIngredientAction, type IngredientPatch } from "@/app/actions/cook-admin";
import { BottomSheet } from "@/components/bottom-sheet";
import { useProfile } from "@/components/avatar";
import { showToast } from "@/components/toaster";
import { INGREDIENT_CATEGORIES, searchIngredients, type IngredientCategory } from "@/lib/cook/ingredients";
import type { AdminIngredient } from "@/lib/cook/queries";

type Filter = "all" | "added" | "hidden";
const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "すべて" },
  { value: "added", label: "メンバーが追加" },
  { value: "hidden", label: "非表示" },
];
const SHOW_LIMIT = 100;
const input = "w-full rounded-lg border border-border bg-surface px-3 py-2 text-base";

/** 食材マスタの管理。メンバーが追加した食材の確認・修正、重複の統合、非表示（D7） */
export function IngredientAdmin({ ingredients }: { ingredients: AdminIngredient[] }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [category, setCategory] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  const filtered = ingredients.filter(
    (i) =>
      (filter === "all" || (filter === "added" ? i.createdBy !== null : !i.active)) && (!category || i.category === category),
  );
  const shown = q.trim() ? searchIngredients(q, filtered, SHOW_LIMIT) : filtered.slice(0, SHOW_LIMIT);
  const editing = ingredients.find((i) => i.id === editingId) ?? null;

  return (
    <div className="pb-8">
      <div className="mx-4 mb-2 flex gap-2">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="食材名・よみで探す"
          aria-label="食材を探す"
          className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-base"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          aria-label="分類"
          className="rounded-xl border border-border bg-surface px-2 text-sm"
        >
          <option value="">分類</option>
          {INGREDIENT_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <div className="mx-4 mb-3 grid grid-cols-3 rounded-lg border border-border bg-surface p-0.5 text-sm" role="tablist">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            role="tab"
            aria-selected={filter === f.value}
            onClick={() => setFilter(f.value)}
            className={`rounded-md py-1.5 ${filter === f.value ? "bg-accent font-medium text-accent-fg" : "text-muted"}`}
          >
            {f.label}
          </button>
        ))}
      </div>
      <p className="mx-4 mb-2 text-xs text-muted">
        {filtered.length}件{!q.trim() && filtered.length > SHOW_LIMIT && `（先頭の${SHOW_LIMIT}件を表示。探すと絞り込めます）`}
      </p>

      <ul className="mx-4 divide-y divide-border rounded-xl border border-border bg-surface">
        {shown.map((i) => (
          <li key={i.id}>
            <button type="button" onClick={() => setEditingId(i.id)} className={`flex w-full items-baseline gap-2 px-4 py-2.5 text-left ${i.active ? "" : "opacity-60"}`}>
              <span className="flex-1">
                {i.name}
                {i.reading && <span className="ml-2 text-xs text-muted">{i.reading}</span>}
                {!i.active && <span className="ml-2 text-xs text-muted">非表示</span>}
              </span>
              {i.createdBy && <span className="text-xs text-accent">追加</span>}
              <span className="shrink-0 text-xs text-muted">{i.category}</span>
            </button>
          </li>
        ))}
        {shown.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted">見つかりません</li>}
      </ul>

      <BottomSheet open={editing !== null} onClose={() => setEditingId(null)} title="食材を編集">
        {editing && <IngredientForm key={editing.id} ingredient={editing} all={ingredients} onDone={() => setEditingId(null)} />}
      </BottomSheet>
    </div>
  );
}

function IngredientForm({ ingredient, all, onDone }: { ingredient: AdminIngredient; all: AdminIngredient[]; onDone: () => void }) {
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState<IngredientPatch>({
    name: ingredient.name,
    reading: ingredient.reading,
    aliases: ingredient.aliases.join("、"),
    category: ingredient.category as IngredientCategory,
    active: ingredient.active,
  });
  const [mergeQuery, setMergeQuery] = useState("");
  const [mergeInto, setMergeInto] = useState<AdminIngredient | null>(null);
  const addedBy = useProfile(ingredient.createdBy);
  const candidates = searchIngredients(
    mergeQuery,
    all.filter((i) => i.id !== ingredient.id && i.active),
    6,
  );

  const save = () =>
    startTransition(async () => {
      const r = await updateIngredientAction(ingredient.id, value);
      if (!r.ok) return showToast(r.error);
      showToast("保存しました");
      onDone();
    });
  const merge = (into: AdminIngredient) =>
    startTransition(async () => {
      const r = await mergeIngredientAction(ingredient.id, into.id);
      if (!r.ok) return showToast(r.error);
      showToast(`「${into.name}」にまとめました`);
      onDone();
    });

  return (
    <div className="space-y-3">
      {ingredient.createdBy && (
        <p className="text-xs text-muted">{addedBy?.displayName ?? "メンバー"}さんがレシピの登録中に追加した食材です。</p>
      )}
      <label className="block space-y-1">
        <span className="text-sm font-medium">食材名</span>
        <input value={value.name} onChange={(e) => setValue({ ...value, name: e.target.value })} maxLength={30} className={input} />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">よみ（ひらがな）</span>
        <input value={value.reading} onChange={(e) => setValue({ ...value, reading: e.target.value })} maxLength={60} className={input} />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">別名（「、」区切り）</span>
        <input
          value={value.aliases}
          onChange={(e) => setValue({ ...value, aliases: e.target.value })}
          placeholder="例：豚ミンチ、豚挽肉"
          className={input}
        />
        <span className="block text-xs text-muted">レシピの材料名がこの名前でも、この食材として扱います</span>
      </label>
      <div className="flex gap-3">
        <label className="block flex-1 space-y-1">
          <span className="text-sm font-medium">分類</span>
          <select
            value={value.category}
            onChange={(e) => setValue({ ...value, category: e.target.value as IngredientCategory })}
            className={`${input} px-2`}
          >
            {INGREDIENT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 pt-6 text-sm">
          <input type="checkbox" checked={!value.active} onChange={(e) => setValue({ ...value, active: !e.target.checked })} className="h-5 w-5" />
          非表示
        </label>
      </div>
      <button
        type="button"
        disabled={pending || !value.name.trim()}
        onClick={save}
        className="w-full rounded-lg bg-accent py-3 text-sm font-semibold text-accent-fg disabled:opacity-50"
      >
        {pending ? "保存中…" : "保存する"}
      </button>

      <details className="rounded-lg border border-border p-3">
        <summary className="text-sm font-medium">同じ食材がほかにもある（まとめる）</summary>
        <p className="mt-2 text-xs text-muted">
          「{ingredient.name}」を選んだ食材にまとめます。「{ingredient.name}」は別名として残り、一覧からは消えます。元に戻せません。
        </p>
        {mergeInto ? (
          <div className="mt-2 space-y-2">
            <p className="text-sm">
              「{ingredient.name}」→「<b>{mergeInto.name}</b>」にまとめます
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setMergeInto(null)} className="flex-1 rounded-lg border border-border py-2 text-sm">
                やめる
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => merge(mergeInto)}
                className="flex-1 rounded-lg bg-danger py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                まとめる
              </button>
            </div>
          </div>
        ) : (
          <>
            <input
              value={mergeQuery}
              onChange={(e) => setMergeQuery(e.target.value)}
              placeholder="まとめる先の食材を探す"
              aria-label="まとめる先の食材"
              className={`${input} mt-2`}
            />
            <ul className="mt-1">
              {candidates.map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => setMergeInto(c)} className="w-full rounded px-2 py-2 text-left text-sm hover:bg-border/40">
                    {c.name}
                    <span className="ml-2 text-xs text-muted">{c.category}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </details>
    </div>
  );
}
