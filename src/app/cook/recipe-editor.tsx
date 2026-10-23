"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveRecipeAction, type RecipeInput, type Visibility } from "@/app/actions/cook-recipes";
import { removeRecipePhotoAction, uploadRecipePhotoAction } from "@/app/actions/cook-photos";
import { addIngredientAction, type ImportDraft } from "@/app/actions/cook-import";
import { BottomSheet } from "@/components/bottom-sheet";
import { showToast } from "@/components/toaster";
import { resizeToJpeg } from "@/lib/client/resize-image";
import { moveKeyTo } from "@/lib/client/sort";
import { useLongPressSort } from "@/lib/client/use-long-press-sort";
import {
  appendLooseItem,
  editorBlocks,
  groupIntoSection,
  ingredientsToRows,
  insertAfter,
  insertAlternative,
  parseTags,
  removeRow,
  removeSection,
  rowsToIngredients,
  type EditorItem,
  type EditorRow,
} from "@/lib/cook/editor";
import { INGREDIENT_CATEGORIES, cleanIngredientName, matchIngredient, searchIngredients, type IngredientCategory } from "@/lib/cook/ingredients";
import { PHOTO_FULL_SIDE, PHOTO_THUMB_SIDE, recipePhotoUrl } from "@/lib/cook/photo";
import type { Category, IngredientOption, RecipeDetail } from "@/lib/cook/queries";

let nextKey = 1;
const newKey = () => nextKey++;
const DRAFT_KEY = "condocook:draft:new";

const VISIBILITIES: { value: Visibility; label: string; note: string }[] = [
  { value: "group", label: "グループ", note: "仲間全員に見える" },
  { value: "household", label: "家族だけ", note: "同じ家族だけ" },
  { value: "private", label: "自分だけ", note: "下書き・メモに" },
];

type Form = {
  title: string;
  visibility: Visibility;
  servings: string;
  cookMinutes: string;
  categoryId: string;
  tags: string;
  memo: string;
  sourceUrl: string;
  sourceName: string;
  rows: EditorRow[];
  steps: { key: number; body: string }[];
};

const emptyItem = (): EditorItem => ({ key: newKey(), kind: "item", ingredientId: null, name: "", amount: "", optional: false });

function fromRecipe(r: RecipeDetail | null): Form {
  return {
    title: r?.title ?? "",
    visibility: r?.visibility ?? "group",
    servings: r?.servings ? String(r.servings) : "",
    cookMinutes: r?.cookMinutes ? String(r.cookMinutes) : "",
    categoryId: r?.categoryId ?? "",
    tags: r?.tags.join("、") ?? "",
    memo: r?.memo ?? "",
    sourceUrl: r?.sourceUrl ?? "",
    sourceName: r?.sourceName ?? "",
    rows: r ? ingredientsToRows(r.ingredients, newKey) : [emptyItem(), emptyItem(), emptyItem()],
    steps: (r?.steps.length ? r.steps : ["", ""]).map((body) => ({ key: newKey(), body })),
  };
}

/** URLから取り込んだ下書き → 入力欄 */
function fromImport(d: ImportDraft): Form {
  return {
    ...fromRecipe(null),
    title: d.title,
    servings: d.servings ? String(d.servings) : "",
    cookMinutes: d.cookMinutes ? String(d.cookMinutes) : "",
    sourceUrl: d.sourceUrl,
    sourceName: d.sourceName ?? "",
    rows: ingredientsToRows(d.ingredients.map((i) => ({ ...i, optional: false })), newKey),
    steps: (d.steps.length ? d.steps : [""]).map((body) => ({ key: newKey(), body })),
  };
}


function loadDraft(): Form | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const f = JSON.parse(raw) as Form;
    // 行のキーは振り直す（この画面の中でだけ一意であればよい）
    return { ...f, rows: f.rows.map((r) => ({ ...r, key: newKey() })), steps: f.steps.map((s) => ({ ...s, key: newKey() })) };
  } catch {
    return null;
  }
}

/**
 * レシピの登録・編集（手入力）。
 * - mode=edit: 自分のレシピを編集 / mode=new: 新規（copyFrom があればコピーしてアレンジ、imported があればURLから取り込んだ下書き）
 * - 新規の入力は端末に下書きとして残す（アプリを閉じても消えない）
 */
export function RecipeEditor({
  mode,
  recipe,
  copyFrom,
  imported,
  categories,
  ingredients: initialIngredients,
}: {
  mode: "new" | "edit";
  recipe: RecipeDetail | null;
  copyFrom?: RecipeDetail | null;
  imported?: ImportDraft | null;
  categories: Category[];
  ingredients: IngredientOption[];
}) {
  const router = useRouter();
  const [form, setForm] = useState<Form>(() => {
    if (copyFrom) return { ...fromRecipe(copyFrom), title: `${copyFrom.title}（アレンジ）`.slice(0, 60), visibility: "group" };
    if (imported) return fromImport(imported);
    return fromRecipe(recipe);
  });
  // 食材マスタ（この画面で追加した食材も含める）
  const [ingredients, setIngredients] = useState(initialIngredients);
  const [adding, setAdding] = useState<{ rowKey: number; name: string; reading: string; category: IngredientCategory } | null>(null);
  const [addingPending, startAdding] = useTransition();
  const [draftRestored, setDraftRestored] = useState(false);
  const [photo, setPhoto] = useState<{ full: Blob; thumb: Blob; preview: string } | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [focusedRow, setFocusedRow] = useState<number | null>(null);
  // 材料を選んで見出しにまとめる（URLから取り込んだあと、タレなどの材料をまとめたいとき）
  const [grouping, setGrouping] = useState<{ keys: Set<number>; target: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const useDraft = mode === "new" && !copyFrom;

  // 新規: 前回の下書きがあれば続きから（URLから取り込んだときは取り込んだ内容を使う）
  useEffect(() => {
    if (!useDraft || imported) return;
    const t = setTimeout(() => {
      const draft = loadDraft();
      if (draft && (draft.title || draft.rows.some((r) => r.name) || draft.steps.some((s) => s.body))) {
        setForm(draft);
        setDraftRestored(true);
      }
    }, 0);
    return () => clearTimeout(t);
  }, [useDraft, imported]);

  // 新規: 入力のたびに下書きを保存（写真は保存しない）
  useEffect(() => {
    if (!useDraft) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(form));
      } catch {
        // 保存できなくても入力は続けられる
      }
    }, 500);
    return () => clearTimeout(t);
  }, [form, useDraft]);

  useEffect(() => () => void (photo && URL.revokeObjectURL(photo.preview)), [photo]);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));
  // 「または」にできるのは、すぐ上が材料の行のとき（見出しの直後・最初の行はできない）
  const canAlt = (i: number) => i > 0 && form.rows[i - 1].kind === "item";
  // 材料の1行（r は行、i は form.rows の位置）
  const itemRow = (r: EditorItem, i: number) => (
    <li
      key={r.key}
      ref={rowSort.register(r.key)}
      className={`rounded-lg border p-2 ${canAlt(i) && r.orPrevious ? "-mt-1 ml-6" : ""} ${rowSort.dragging === r.key ? "relative z-10 border-accent bg-surface shadow-lg ring-2 ring-accent" : "border-border"}`}
    >
      {canAlt(i) && r.orPrevious && <p className="mb-1 text-xs font-semibold text-accent">または</p>}
      <div className="flex items-center gap-1">
        {grouping ? (
          <input
            type="checkbox"
            checked={grouping.keys.has(r.key)}
            onChange={(e) =>
              setGrouping((g) => {
                if (!g) return g;
                const keys = new Set(g.keys);
                if (e.target.checked) keys.add(r.key);
                else keys.delete(r.key);
                return { ...g, keys };
              })
            }
            aria-label={`${r.name || "材料"}を選ぶ`}
            className="mx-1 h-5 w-5 shrink-0 accent-[var(--accent)]"
          />
        ) : (
          <DragHandle label={`${r.name || "材料"}を並べ替え`} {...rowSort.handleProps(r.key)} />
        )}
        <div className="relative min-w-0 flex-[3]">
          <input
            value={r.name}
            onChange={(e) => setRow(r.key, { name: e.target.value, ingredientId: null })}
            onFocus={() => setFocusedRow(r.key)}
            onBlur={() => setTimeout(() => setFocusedRow((k) => (k === r.key ? null : k)), 150)}
            maxLength={60}
            placeholder={canAlt(i) && r.orPrevious ? "代わりの材料（例：カット野菜）" : "材料（例：とりもも）"}
            aria-label="材料名"
            className="w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-base"
          />
          {r.ingredientId && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-accent" title="食材とつながっています">✓</span>}
        </div>
        <input
          value={r.amount}
          onChange={(e) => setRow(r.key, { amount: e.target.value })}
          maxLength={30}
          placeholder="分量"
          aria-label="分量"
          className="min-w-0 flex-[2] rounded-lg border border-border bg-surface px-2 py-1.5 text-base"
        />
      </div>
      {focusedRow === r.key && r.name.trim() && !r.ingredientId && (
        <ul className="mt-1 flex flex-wrap gap-1" aria-label="食材の候補">
          {suggestions.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setRow(r.key, { name: s.name, ingredientId: s.id });
                  setFocusedRow(null);
                }}
                className="rounded-full border border-accent px-2.5 py-1 text-xs text-accent"
              >
                {s.name}
              </button>
            </li>
          ))}
          {!matchIngredient(r.name, ingredients) && (
            <li>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setAdding({ rowKey: r.key, name: cleanIngredientName(r.name) || r.name.trim(), reading: "", category: "その他" });
                  setFocusedRow(null);
                }}
                className="rounded-full border border-dashed border-border px-2.5 py-1 text-xs text-muted"
              >
                ＋ 食材の一覧に追加
              </button>
            </li>
          )}
        </ul>
      )}
      <div className="mt-1 flex items-center justify-between">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <label className="flex items-center gap-1.5 text-xs text-muted">
            <input type="checkbox" checked={r.optional} onChange={(e) => setRow(r.key, { optional: e.target.checked })} />
            なくても可
          </label>
          <button
            type="button"
            onClick={() => set("rows", insertAlternative(form.rows, r.key, emptyItem()))}
            className="rounded-full border border-accent px-2 py-0.5 text-xs text-accent"
          >
            ＋ または
          </button>
        </div>
        <DeleteButton onDelete={() => set("rows", removeRow(form.rows, r.key))} />
      </div>
    </li>
  );
  const setRow = (key: number, patch: Partial<EditorItem> | { name: string }) =>
    setForm((f) => ({ ...f, rows: f.rows.map((r) => (r.key === key ? ({ ...r, ...patch } as EditorRow) : r)) }));
  // 長押しで持ち上げて並べ替える（材料は見出しの枠の中・外へも動かせる）
  const rowSort = useLongPressSort((from, to, after) => setForm((f) => ({ ...f, rows: moveKeyTo(f.rows, from, to, after) })));
  const stepSort = useLongPressSort((from, to, after) => setForm((f) => ({ ...f, steps: moveKeyTo(f.steps, from, to, after) })));

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return;
    try {
      const [full, thumb] = await Promise.all([resizeToJpeg(file, PHOTO_FULL_SIDE, 0.82), resizeToJpeg(file, PHOTO_THUMB_SIDE, 0.6)]);
      setPhoto({ full, thumb, preview: URL.createObjectURL(full) });
      setRemovePhoto(false);
    } catch {
      showToast("写真を読み込めませんでした");
    }
  };

  const clearDraft = () => {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      // 何もしない
    }
  };

  const save = () =>
    startTransition(async () => {
      setError(null);
      // 食材マスタに名前が一致する材料は自動でつなぐ（候補から選ばなかった場合も）
      const rows = form.rows.map((r) =>
        r.kind === "item" && !r.ingredientId && r.name.trim() ? { ...r, ingredientId: matchIngredient(r.name, ingredients)?.id ?? null } : r,
      );
      const input: RecipeInput = {
        title: form.title,
        visibility: form.visibility,
        servings: form.servings ? Number(form.servings) : null,
        cookMinutes: form.cookMinutes ? Number(form.cookMinutes) : null,
        categoryId: form.categoryId || null,
        tags: parseTags(form.tags),
        memo: form.memo,
        sourceUrl: form.sourceUrl,
        sourceName: form.sourceName,
        copiedFrom: copyFrom?.id ?? null,
        ingredients: rowsToIngredients(rows).map((i) => ({ ...i, section: i.section ?? "" })),
        steps: form.steps.map((s) => s.body),
      };
      const result = await saveRecipeAction(mode === "edit" && recipe ? recipe.id : null, input);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (photo) {
        const fd = new FormData();
        fd.set("full", photo.full, "full.jpg");
        fd.set("thumb", photo.thumb, "thumb.jpg");
        const r = await uploadRecipePhotoAction(result.id, fd);
        if (!r.ok) showToast(`レシピは保存しました。${r.error}`);
      } else if (removePhoto && recipe?.photoPath) {
        await removeRecipePhotoAction(result.id);
      }
      if (useDraft) clearDraft();
      showToast(mode === "edit" ? "レシピを保存しました" : "レシピを登録しました");
      router.push(`/cook/r/${result.id}`);
      router.refresh();
    });

  const currentPhoto = photo?.preview ?? (!removePhoto && recipe?.photoPath ? recipePhotoUrl(recipe.id, recipe.photoPath, "full") : null);
  const suggestions = useMemo(() => {
    const row = form.rows.find((r) => r.key === focusedRow);
    if (!row || row.kind !== "item" || !row.name.trim() || row.ingredientId) return [];
    return searchIngredients(row.name, ingredients, 6);
  }, [focusedRow, form.rows, ingredients]);

  const input = "w-full rounded-lg border border-border bg-surface px-3 py-2 text-base";

  return (
    <div className="space-y-4 pb-40">
      {draftRestored && (
        <div className="mx-4 flex items-center justify-between rounded-lg border border-border bg-surface px-3 py-2 text-sm">
          <span className="text-muted">前回の入力の続きです</span>
          <button
            type="button"
            onClick={() => {
              clearDraft();
              setForm(fromRecipe(null));
              setDraftRestored(false);
            }}
            className="text-accent"
          >
            最初から
          </button>
        </div>
      )}
      {copyFrom && <p className="mx-4 text-sm text-muted">「{copyFrom.title}」をコピーしました。自分用に直して登録してください（元のレシピは変わりません）。</p>}

      <section className="mx-4 space-y-3 rounded-xl border border-border bg-surface p-4">
        <label className="block space-y-1">
          <span className="text-sm font-medium">料理名</span>
          <input value={form.title} onChange={(e) => set("title", e.target.value)} maxLength={60} className={input} placeholder="例：親子丼" />
        </label>

        <div className="space-y-1">
          <span className="text-sm font-medium">完成写真（自分で撮ったもの）</span>
          {currentPhoto ? (
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- 端末内のプレビュー・認証付きの配信 */}
              <img src={currentPhoto} alt="" className="aspect-[4/3] w-full rounded-lg bg-border object-cover" />
              <div className="mt-1 flex gap-3 text-sm">
                <button type="button" onClick={() => fileRef.current?.click()} className="text-accent">
                  写真を変える
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPhoto(null);
                    setRemovePhoto(true);
                  }}
                  className="text-muted"
                >
                  写真を外す
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex aspect-[4/3] w-full items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted"
            >
              ＋ 写真を選ぶ（なくても登録できます）
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => void pickPhoto(e.target.files?.[0])} />
        </div>

        <div className="space-y-1">
          <span className="text-sm font-medium">公開範囲</span>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="公開範囲">
            {VISIBILITIES.map((v) => (
              <button
                key={v.value}
                type="button"
                role="radio"
                aria-checked={form.visibility === v.value}
                onClick={() => set("visibility", v.value)}
                className={`rounded-lg px-1 py-2 text-sm ${form.visibility === v.value ? "border-2 border-accent font-medium" : "border border-border"}`}
              >
                {v.label}
                <span className="block text-[10px] font-normal text-muted">{v.note}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <label className="block space-y-1">
            <span className="text-sm font-medium">何人分</span>
            <input value={form.servings} onChange={(e) => set("servings", e.target.value.replace(/\D/g, ""))} inputMode="numeric" className={input} placeholder="2" />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium">時間（分）</span>
            <input value={form.cookMinutes} onChange={(e) => set("cookMinutes", e.target.value.replace(/\D/g, ""))} inputMode="numeric" className={input} placeholder="20" />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium">カテゴリ</span>
            <select value={form.categoryId} onChange={(e) => set("categoryId", e.target.value)} className={`${input} px-2`}>
              <option value="">—</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="block space-y-1">
          <span className="text-sm font-medium">タグ（「、」区切り）</span>
          <input value={form.tags} onChange={(e) => set("tags", e.target.value)} className={input} placeholder="例：簡単、作り置き" />
        </label>
      </section>

      <section className="mx-4 rounded-xl border border-border bg-surface p-4">
        <h2 className="mb-1 font-semibold">材料</h2>
        <p className="mb-2 text-xs text-muted">分量は「200g」「大さじ2」「少々」のように。何人分を入れると、見る人の人数に合わせて換算されます。</p>
        <div className="space-y-3">
          {editorBlocks(form.rows).map((b) =>
            b.heading ? (
              <div key={b.heading.key} className="rounded-xl border-2 border-accent/40 bg-accent/5 p-2">
                <div className="mb-2 flex items-center gap-1">
                  <span className="shrink-0 rounded bg-accent px-1.5 py-0.5 text-[10px] font-bold text-accent-fg">見出し</span>
                  <input
                    value={b.heading.name}
                    onChange={(e) => setRow(b.heading!.key, { name: e.target.value })}
                    maxLength={20}
                    placeholder="例：タレ、下味、トッピング"
                    aria-label="見出しの名前"
                    className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 py-1.5 text-base font-semibold"
                  />
                  <button
                    type="button"
                    onClick={() => set("rows", removeSection(form.rows, b.heading!.key))}
                    className="shrink-0 px-1.5 py-1 text-xs text-muted"
                  >
                    見出しを外す
                  </button>
                </div>
                <ul className="space-y-2">{b.items.map(({ row, index }) => itemRow(row, index))}</ul>
                <button
                  type="button"
                  onClick={() => set("rows", insertAfter(form.rows, b.lastIndex, emptyItem()))}
                  className="mt-2 text-sm text-accent"
                >
                  ＋ 「{b.heading.name.trim() || "見出し"}」に材料
                </button>
              </div>
            ) : (
              <ul key={`loose-${b.lastIndex}`} className="space-y-2">
                {b.items.map(({ row, index }) => itemRow(row, index))}
              </ul>
            ),
          )}
        </div>
        <div className="mt-3 flex gap-4 text-sm">
          <button type="button" onClick={() => set("rows", appendLooseItem(form.rows, emptyItem(), newKey))} className="text-accent">
            ＋ 材料
          </button>
          <button
            type="button"
            onClick={() => set("rows", [...form.rows, { key: newKey(), kind: "heading", name: "", isSection: true }, emptyItem()])}
            className="text-accent"
          >
            ＋ 見出し（タレなど）
          </button>
          {!grouping && (
            <button type="button" onClick={() => setGrouping({ keys: new Set(), target: "new", name: "" })} className="text-accent">
              まとめる
            </button>
          )}
        </div>
        <p className="mt-1 text-xs text-muted">
          「＋ 材料」は見出しの外（いちばん下）に足します。「まとめる」で、選んだ材料をタレなどの見出しにまとめられます。
        </p>
        {grouping && (
          <div className="sticky bottom-[calc(8rem+env(safe-area-inset-bottom))] z-10 mt-3 space-y-2 rounded-xl border-2 border-accent bg-surface p-3 shadow-lg">
            <p className="text-sm font-semibold">
              まとめる材料にチェックを付けてください（{grouping.keys.size}個）
            </p>
            <div className="flex gap-2">
              {editorBlocks(form.rows).some((b) => b.heading) && (
                <select
                  value={grouping.target}
                  onChange={(e) => setGrouping({ ...grouping, target: e.target.value })}
                  aria-label="まとめる先"
                  className="rounded-lg border border-border bg-surface px-2 text-sm"
                >
                  <option value="new">新しい見出し</option>
                  {editorBlocks(form.rows).flatMap((b) =>
                    b.heading ? [<option key={b.heading.key} value={String(b.heading.key)}>{b.heading.name.trim() || "（名前なし）"}</option>] : [],
                  )}
                </select>
              )}
              {grouping.target === "new" && (
                <input
                  value={grouping.name}
                  onChange={(e) => setGrouping({ ...grouping, name: e.target.value })}
                  maxLength={20}
                  placeholder="見出しの名前（例：タレ）"
                  aria-label="新しい見出しの名前"
                  className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 py-1.5 text-base"
                />
              )}
            </div>
            <div className="flex justify-end gap-3 text-sm">
              <button type="button" onClick={() => setGrouping(null)} className="text-muted">
                やめる
              </button>
              <button
                type="button"
                disabled={grouping.keys.size === 0 || (grouping.target === "new" && !grouping.name.trim())}
                onClick={() => {
                  const target = grouping.target === "new" ? grouping.name : Number(grouping.target);
                  setForm((f) => ({ ...f, rows: groupIntoSection(f.rows, [...grouping.keys], target, newKey) }));
                  setGrouping(null);
                }}
                className="rounded-lg bg-accent px-4 py-1.5 font-semibold text-accent-fg disabled:opacity-40"
              >
                まとめる
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="mx-4 rounded-xl border border-border bg-surface p-4">
        <h2 className="mb-2 font-semibold">作り方</h2>
        <ol className="space-y-2">
          {form.steps.map((s, i) => (
            <li
              key={s.key}
              ref={stepSort.register(s.key)}
              className={`flex gap-2 rounded-lg ${stepSort.dragging === s.key ? "relative z-10 bg-surface shadow-lg ring-2 ring-accent" : ""}`}
            >
              <div className="flex shrink-0 flex-col items-center">
                <span className="mt-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-fg">{i + 1}</span>
                <DragHandle label={`手順${i + 1}を並べ替え`} {...stepSort.handleProps(s.key)} />
              </div>
              <div className="min-w-0 flex-1">
                <textarea
                  value={s.body}
                  onChange={(e) => set("steps", form.steps.map((x) => (x.key === s.key ? { ...x, body: e.target.value } : x)))}
                  rows={2}
                  maxLength={500}
                  aria-label={`手順${i + 1}`}
                  placeholder={i === 0 ? "例：鶏肉をひと口大に切る" : ""}
                  className="w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-base"
                />
                <div className="flex justify-end">
                  <DeleteButton onDelete={() => set("steps", form.steps.filter((x) => x.key !== s.key))} />
                </div>
              </div>
            </li>
          ))}
        </ol>
        <button type="button" onClick={() => set("steps", [...form.steps, { key: newKey(), body: "" }])} className="mt-1 text-sm text-accent">
          ＋ 手順
        </button>
        <p className="mt-2 text-xs text-muted">「5分煮る」のように時間を書くと、作るときにタイマーを出せます。</p>
      </section>

      <section className="mx-4 space-y-3 rounded-xl border border-border bg-surface p-4">
        <label className="block space-y-1">
          <span className="text-sm font-medium">メモ・コツ（仲間へのひとことも）</span>
          <textarea value={form.memo} onChange={(e) => set("memo", e.target.value)} rows={3} maxLength={1000} className={input} />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">元のレシピのURL（あれば）</span>
          <input value={form.sourceUrl} onChange={(e) => set("sourceUrl", e.target.value)} inputMode="url" className={input} placeholder="https://" />
        </label>
        {form.sourceUrl && (
          <label className="block space-y-1">
            <span className="text-sm font-medium">サイト名・出典</span>
            <input value={form.sourceName} onChange={(e) => set("sourceName", e.target.value)} maxLength={60} className={input} />
          </label>
        )}
      </section>

      <BottomSheet open={adding !== null} onClose={() => setAdding(null)} title="食材の一覧に追加">
        {adding && (
          <div className="space-y-3">
            <p className="text-xs text-muted">仲間みんなで使う食材の一覧に追加します。あとで食材の管理や買い物リストで使います。</p>
            <label className="block space-y-1">
              <span className="text-sm font-medium">食材名</span>
              <input value={adding.name} onChange={(e) => setAdding({ ...adding, name: e.target.value })} maxLength={30} className={input} />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium">よみ（ひらがな・任意）</span>
              <input value={adding.reading} onChange={(e) => setAdding({ ...adding, reading: e.target.value })} maxLength={60} className={input} placeholder="例：けーる" />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium">分類</span>
              <select value={adding.category} onChange={(e) => setAdding({ ...adding, category: e.target.value as IngredientCategory })} className={`${input} px-2`}>
                {INGREDIENT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={addingPending || !adding.name.trim()}
              onClick={() =>
                startAdding(async () => {
                  const r = await addIngredientAction(adding.name, adding.reading, adding.category);
                  if (!r.ok) return showToast(r.error);
                  setIngredients((list) => (list.some((x) => x.id === r.ingredient.id) ? list : [...list, r.ingredient]));
                  setRow(adding.rowKey, { name: r.ingredient.name, ingredientId: r.ingredient.id });
                  setAdding(null);
                  showToast("食材を追加しました");
                })
              }
              className="w-full rounded-lg bg-accent py-3 text-sm font-semibold text-accent-fg disabled:opacity-50"
            >
              {addingPending ? "追加中…" : "追加する"}
            </button>
          </div>
        )}
      </BottomSheet>

      <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10 mx-auto max-w-lg px-4 pb-2">
        {error && <p className="mb-2 rounded-lg bg-surface px-3 py-2 text-sm text-danger shadow">{error}</p>}
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="w-full rounded-xl bg-accent py-3 font-semibold text-accent-fg shadow-lg disabled:opacity-50"
        >
          {pending ? "保存中…" : mode === "edit" ? "保存する" : "登録する"}
        </button>
      </div>
    </div>
  );
}

function DeleteButton({ onDelete }: { onDelete: () => void }) {
  return (
    <button type="button" aria-label="削除" onClick={onDelete} className="rounded px-2 py-0.5 text-sm text-muted">
      ×
    </button>
  );
}

/** 並べ替えのつまみ（長押しで持ち上げて上下に動かす） */
function DragHandle({ label, ...props }: { label: string } & ReturnType<ReturnType<typeof useLongPressSort>["handleProps"]>) {
  return (
    <button
      type="button"
      aria-label={label}
      title="長押しして上下に動かすと並べ替えられます"
      {...props}
      className="flex h-9 w-6 shrink-0 cursor-grab select-none items-center justify-center text-lg text-muted active:cursor-grabbing"
    >
      ⠿
    </button>
  );
}
