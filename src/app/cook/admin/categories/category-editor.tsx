"use client";

import { useState, useTransition } from "react";
import { addCategoryAction, moveCategoryAction, updateCategoryAction, type AdminResult } from "@/app/actions/cook-admin";
import { showToast } from "@/components/toaster";
import type { AdminCategory } from "@/lib/cook/queries";

function useRun() {
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<AdminResult>, success?: string, after?: () => void) =>
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) return showToast(r.error);
      if (success) showToast(success);
      after?.();
    });
  return { pending, run };
}

export function CategoryEditor({ categories }: { categories: AdminCategory[] }) {
  const { pending, run } = useRun();
  const [newName, setNewName] = useState("");

  return (
    <div className="space-y-4 pb-8">
      <ul className="mx-4 divide-y divide-border rounded-xl border border-border bg-surface">
        {categories.map((c, i) => (
          <CategoryRow key={c.id} category={c} isFirst={i === 0} isLast={i === categories.length - 1} />
        ))}
      </ul>

      <section className="mx-4 rounded-xl border border-dashed border-border p-4">
        <h2 className="mb-2 text-sm font-semibold">カテゴリを追加</h2>
        <div className="flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="例：お弁当"
            maxLength={20}
            aria-label="カテゴリ名"
            className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2"
          />
          <button
            type="button"
            disabled={pending || !newName.trim()}
            onClick={() => run(() => addCategoryAction(newName), "カテゴリを追加しました", () => setNewName(""))}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg disabled:opacity-50"
          >
            追加
          </button>
        </div>
      </section>
    </div>
  );
}

function CategoryRow({ category, isFirst, isLast }: { category: AdminCategory; isFirst: boolean; isLast: boolean }) {
  const { pending, run } = useRun();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(category.name);

  return (
    <li className={`px-4 py-3 ${category.active ? "" : "opacity-60"}`}>
      <div className="flex items-center gap-1">
        {renaming ? (
          <>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={20}
              aria-label="カテゴリ名"
              className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 py-1"
            />
            <SmallButton
              disabled={pending}
              onClick={() => run(() => updateCategoryAction(category.id, { name }), "名前を変更しました", () => setRenaming(false))}
            >
              保存
            </SmallButton>
          </>
        ) : (
          <span className="flex-1">
            {category.name}
            {!category.active && <span className="ml-2 text-xs text-muted">非表示</span>}
          </span>
        )}
        <SmallButton aria-label="上へ" disabled={pending || isFirst} onClick={() => run(() => moveCategoryAction(category.id, -1))}>
          ↑
        </SmallButton>
        <SmallButton aria-label="下へ" disabled={pending || isLast} onClick={() => run(() => moveCategoryAction(category.id, 1))}>
          ↓
        </SmallButton>
      </div>
      <div className="mt-1 flex gap-3 text-xs">
        <button
          type="button"
          className="text-accent"
          onClick={() => {
            setName(category.name);
            setRenaming((v) => !v);
          }}
        >
          {renaming ? "やめる" : "名前を変更"}
        </button>
        <button
          type="button"
          className="text-muted"
          disabled={pending}
          onClick={() =>
            run(() => updateCategoryAction(category.id, { active: !category.active }), category.active ? "非表示にしました" : "表示に戻しました")
          }
        >
          {category.active ? "非表示にする" : "表示に戻す"}
        </button>
      </div>
    </li>
  );
}

function SmallButton(props: React.ComponentProps<"button">) {
  return <button type="button" {...props} className="rounded px-2 py-1 text-xs text-muted disabled:opacity-30" />;
}
