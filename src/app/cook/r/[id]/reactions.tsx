"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deleteCookAction,
  deleteRecipeCommentAction,
  postRecipeCommentAction,
  recordCookAction,
  toggleRecipeMarkAction,
} from "@/app/actions/cook-reactions";
import { BottomSheet } from "@/components/bottom-sheet";
import { showToast } from "@/components/toaster";
import { RelativeTime } from "@/app/(app)/relative-time";
import { resizeToJpeg } from "@/lib/client/resize-image";
import { PHOTO_FULL_SIDE, PHOTO_THUMB_SIDE, cookPhotoUrl } from "@/lib/cook/photo";
import type { CookLog, RecipeComment } from "@/lib/cook/queries";
import { Owner } from "../../owner";

const NOTE_MAX = 200;
const COMMENT_MAX = 500;

/**
 * 反応のボタン（作った・お気に入り・作りたい）。D20
 * 作るモードの最後から ?cooked=1 で来たときは「作った」の入力をすぐ開く
 */
export function ReactionBar({
  recipeId,
  favorite,
  want,
  favoriteCount,
  cookedCount,
  openCooked,
}: {
  recipeId: string;
  favorite: boolean;
  want: boolean;
  favoriteCount: number;
  cookedCount: number;
  openCooked: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [cookOpen, setCookOpen] = useState(openCooked);

  const toggle = (kind: "favorite" | "want", on: boolean) =>
    startTransition(async () => {
      const r = await toggleRecipeMarkAction(recipeId, kind, on);
      if (!r.ok) return showToast(r.error);
      showToast(kind === "favorite" ? (on ? "お気に入りに入れました" : "お気に入りから外しました") : on ? "「作りたい」に入れました" : "「作りたい」から外しました");
      router.refresh();
    });

  const chip = "flex flex-1 flex-col items-center gap-0.5 rounded-xl border py-2 text-xs disabled:opacity-50";
  return (
    <>
      <div className="mx-4 mb-5 flex gap-2">
        <button type="button" onClick={() => setCookOpen(true)} className={`${chip} border-accent bg-accent text-accent-fg`}>
          <span className="text-base font-semibold">作った！</span>
          <span>{cookedCount > 0 ? `みんなで${cookedCount}回` : "記録する"}</span>
        </button>
        <button
          type="button"
          disabled={pending}
          aria-pressed={favorite}
          onClick={() => toggle("favorite", !favorite)}
          className={`${chip} ${favorite ? "border-accent text-accent" : "border-border"}`}
        >
          <span className="text-base" aria-hidden>
            {favorite ? "♥" : "♡"}
          </span>
          <span>お気に入り{favoriteCount > 0 ? ` ${favoriteCount}` : ""}</span>
        </button>
        <button
          type="button"
          disabled={pending}
          aria-pressed={want}
          onClick={() => toggle("want", !want)}
          className={`${chip} ${want ? "border-accent text-accent" : "border-border"}`}
        >
          <span className="text-base" aria-hidden>
            {want ? "★" : "☆"}
          </span>
          <span>作りたい</span>
        </button>
      </div>
      <BottomSheet open={cookOpen} onClose={() => setCookOpen(false)} title="作った！を記録">
        {cookOpen && <CookForm recipeId={recipeId} onDone={() => setCookOpen(false)} />}
      </BottomSheet>
    </>
  );
}

function CookForm({ recipeId, onDone }: { recipeId: string; onDone: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<{ full: Blob; thumb: Blob; preview: string } | null>(null);
  useEffect(() => () => void (photo && URL.revokeObjectURL(photo.preview)), [photo]);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    try {
      const [full, thumb] = await Promise.all([resizeToJpeg(file, PHOTO_FULL_SIDE, 0.82), resizeToJpeg(file, PHOTO_THUMB_SIDE, 0.6)]);
      setPhoto({ full, thumb, preview: URL.createObjectURL(full) });
    } catch {
      showToast("写真を読み込めませんでした");
    }
  };

  const save = () =>
    startTransition(async () => {
      const fd = new FormData();
      fd.set("note", note);
      if (photo) {
        fd.set("full", photo.full, "full.jpg");
        fd.set("thumb", photo.thumb, "thumb.jpg");
      }
      const r = await recordCookAction(recipeId, fd);
      if (!r.ok) showToast(r.error);
      else showToast("「作った」を記録しました");
      // 写真だけ失敗した場合も記録はできているので閉じる
      if (r.ok || r.error.startsWith("記録しました")) {
        onDone();
        router.replace(`/cook/r/${recipeId}`, { scroll: false });
        router.refresh();
      }
    });

  const length = [...note.trim()].length;
  return (
    <div className="space-y-3">
      <label className="block space-y-1">
        <span className="text-sm font-medium">ひとこと（任意）</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="例：しょうゆを少し減らしたらちょうどよかった"
          className="w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-base"
        />
        <span className={`block text-right text-xs ${length > NOTE_MAX ? "text-danger" : "text-muted"}`}>
          {length}/{NOTE_MAX}
        </span>
      </label>
      <div className="flex items-center gap-3">
        {photo && (
          // eslint-disable-next-line @next/next/no-img-element -- 端末内のプレビュー
          <img src={photo.preview} alt="" className="h-16 w-16 rounded-lg object-cover" />
        )}
        <label className="cursor-pointer rounded-lg border border-border px-3 py-2 text-sm">
          {photo ? "写真を変える" : "写真を付ける（任意）"}
          <input type="file" accept="image/*" className="sr-only" onChange={(e) => void pick(e.target.files?.[0])} />
        </label>
        {photo && (
          <button type="button" onClick={() => setPhoto(null)} className="text-sm text-muted">
            外す
          </button>
        )}
      </div>
      <p className="text-xs text-muted">レシピが見える人に「みんなの作った」として表示され、作成者に通知されます。</p>
      <button
        type="button"
        disabled={pending || length > NOTE_MAX}
        onClick={save}
        className="w-full rounded-lg bg-accent py-3 text-sm font-semibold text-accent-fg disabled:opacity-50"
      >
        {pending ? "記録中…" : "記録する"}
      </button>
    </div>
  );
}

/** みんなの作った（新しい順。削除は本人と管理者） */
export function CookLogs({ recipeId, cooks, myId, isAdmin }: { recipeId: string; cooks: CookLog[]; myId: string; isAdmin: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState<string | null>(null);
  if (cooks.length === 0) return null;

  const remove = (id: string) =>
    startTransition(async () => {
      const r = await deleteCookAction(id, recipeId);
      setConfirming(null);
      if (!r.ok) return showToast(r.error);
      showToast("記録を削除しました");
      router.refresh();
    });

  return (
    <section className="mx-4 mb-4 rounded-xl border border-border bg-surface p-4" aria-label="みんなの作った">
      <h2 className="mb-3 font-semibold">
        みんなの作った<span className="ml-1 text-sm font-normal text-muted">（{cooks.length}）</span>
      </h2>
      <ul className="space-y-3">
        {cooks.map((c) => (
          <li key={c.id} className="flex gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-sm">
                <Owner userId={c.userId} size={24} className="font-medium" />
                <RelativeTime iso={c.cookedAt} className="shrink-0 text-xs text-muted" />
                {(c.userId === myId || isAdmin) &&
                  (confirming === c.id ? (
                    <span className="ml-auto flex shrink-0 gap-2 text-xs">
                      <button type="button" onClick={() => setConfirming(null)} className="text-muted">
                        やめる
                      </button>
                      <button type="button" disabled={pending} onClick={() => remove(c.id)} className="font-semibold text-danger">
                        削除する
                      </button>
                    </span>
                  ) : (
                    <button type="button" onClick={() => setConfirming(c.id)} className="ml-auto shrink-0 text-xs text-muted">
                      削除
                    </button>
                  ))}
              </div>
              {c.note && <p className="mt-1 whitespace-pre-wrap break-words pl-8 text-sm">{c.note}</p>}
            </div>
            {c.thumbPath && c.photoPath && (
              <a href={cookPhotoUrl(c.id, c.photoPath, "full")} target="_blank" rel="noopener" className="shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element -- 認証付きの配信なので next/image の最適化は使わない */}
                <img src={cookPhotoUrl(c.id, c.thumbPath, "thumb")} alt="作った料理の写真" loading="lazy" className="h-16 w-16 rounded-lg bg-border object-cover" />
              </a>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** コメント（質問や感想。削除は本人と管理者） */
export function RecipeComments({
  recipeId,
  comments,
  myId,
  isAdmin,
}: {
  recipeId: string;
  comments: RecipeComment[];
  myId: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const length = [...body.trim()].length;

  const post = () =>
    startTransition(async () => {
      const r = await postRecipeCommentAction(recipeId, body);
      if (!r.ok) return showToast(r.error);
      setBody("");
      router.refresh();
    });

  const remove = (id: string) =>
    startTransition(async () => {
      const r = await deleteRecipeCommentAction(id, recipeId);
      setConfirming(null);
      if (!r.ok) return showToast(r.error);
      showToast("コメントを削除しました");
      router.refresh();
    });

  return (
    <section id="comments" className="mx-4 mb-4 scroll-mt-4 rounded-xl border border-border bg-surface p-4" aria-label="コメント">
      <h2 className="mb-3 font-semibold">
        コメント{comments.length > 0 && <span className="ml-1 text-sm font-normal text-muted">（{comments.length}）</span>}
      </h2>
      {comments.length === 0 ? (
        <p className="mb-3 text-sm text-muted">質問や感想をどうぞ。</p>
      ) : (
        <ul className="mb-4 space-y-3">
          {comments.map((c) => (
            <li key={c.id}>
              <div className="flex items-center gap-2 text-sm">
                <Owner userId={c.userId} size={24} className="font-medium" />
                <RelativeTime iso={c.createdAt} className="shrink-0 text-xs text-muted" />
                {(c.userId === myId || isAdmin) &&
                  (confirming === c.id ? (
                    <span className="ml-auto flex shrink-0 gap-2 text-xs">
                      <button type="button" onClick={() => setConfirming(null)} className="text-muted">
                        やめる
                      </button>
                      <button type="button" disabled={pending} onClick={() => remove(c.id)} className="font-semibold text-danger">
                        削除する
                      </button>
                    </span>
                  ) : (
                    <button type="button" onClick={() => setConfirming(c.id)} className="ml-auto shrink-0 text-xs text-muted">
                      削除
                    </button>
                  ))}
              </div>
              <p className="mt-1 whitespace-pre-wrap break-words pl-8 text-sm">{c.body}</p>
            </li>
          ))}
        </ul>
      )}
      <div className="space-y-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
          aria-label="コメント"
          placeholder="例：玉ねぎは何個くらい？"
          className="w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-base outline-none focus:border-accent"
        />
        <div className="flex items-center justify-between">
          <span className={`text-xs ${length > COMMENT_MAX ? "text-danger" : "text-muted"}`}>
            {length}/{COMMENT_MAX}
          </span>
          <button
            type="button"
            onClick={post}
            disabled={pending || length === 0 || length > COMMENT_MAX}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg disabled:opacity-40"
          >
            {pending ? "送信中…" : "コメントする"}
          </button>
        </div>
        <p className="text-xs text-muted">作成者と、このレシピにコメントした人に通知されます。</p>
      </div>
    </section>
  );
}
