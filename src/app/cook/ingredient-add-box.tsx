"use client";

import { useState, useTransition } from "react";
import { matchIngredient, searchIngredients } from "@/lib/cook/ingredients";
import type { IngredientOption } from "@/lib/cook/queries";

/**
 * 食材を入れる欄（買い物リスト・食材リスト・いつもある）。あいまいな入力でも候補を出す（「トリ」→ 鶏もも肉・鶏むね肉…）。
 * 候補から選ぶか、名前が食材マスタと一致すれば食材としてつなぐ
 */
export function IngredientAddBox({
  ingredients,
  placeholder,
  withAmount = false,
  requireMaster = false,
  onAdd,
}: {
  ingredients: IngredientOption[];
  placeholder: string;
  withAmount?: boolean;
  /** 食材マスタにあるものだけ（いつもある） */
  requireMaster?: boolean;
  onAdd: (ingredient: IngredientOption | null, name: string, amount: string) => Promise<boolean>;
}) {
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [picked, setPicked] = useState<IngredientOption | null>(null);
  const suggestions = picked ? [] : searchIngredients(name, ingredients, 6);
  const resolved = picked ?? matchIngredient(name, ingredients);

  const add = () =>
    startTransition(async () => {
      if (!(await onAdd(resolved, resolved?.name ?? name.trim(), amount))) return;
      setName("");
      setAmount("");
      setPicked(null);
    });

  return (
    <div className="relative">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim() && (!requireMaster || resolved)) add();
        }}
        className="flex gap-2"
      >
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setPicked(null);
          }}
          placeholder={placeholder}
          aria-label={placeholder}
          maxLength={30}
          className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 py-2.5 text-base"
        />
        {withAmount && (
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="量（なくてもOK）"
            aria-label="量（入れなくてもよい）"
            maxLength={30}
            className="w-28 rounded-xl border border-border bg-surface px-2 py-2.5 text-base placeholder:text-xs"
          />
        )}
        <button
          type="submit"
          disabled={pending || !name.trim() || (requireMaster && !resolved)}
          className="rounded-xl bg-accent px-4 text-sm font-semibold text-accent-fg disabled:opacity-50"
        >
          追加
        </button>
      </form>
      {suggestions.length > 0 && (
        <ul className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-xl border border-border bg-surface shadow-lg">
          {suggestions.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => {
                  setPicked(s);
                  setName(s.name);
                }}
                className="w-full px-3 py-2 text-left text-sm hover:bg-border/40"
              >
                {s.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
