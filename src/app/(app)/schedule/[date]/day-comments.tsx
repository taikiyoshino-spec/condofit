"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteDayCommentAction, postDayCommentAction } from "@/app/actions/comments";
import { MemberName } from "@/components/avatar";
import { showToast } from "@/components/toaster";
import { RelativeTime } from "@/app/(app)/relative-time";
import type { DayComment } from "@/lib/schedule/queries";

const MAX_LENGTH = 500;

/** その日の実績コメント欄（誰でも書ける・削除は本人と管理者） */
export function DayComments({
  date,
  comments,
  myId,
  isAdmin,
}: {
  date: string;
  comments: DayComment[];
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
      const result = await postDayCommentAction(date, body);
      if (!result.ok) return showToast(result.error);
      setBody("");
      router.refresh();
    });

  const remove = (id: string) =>
    startTransition(async () => {
      const result = await deleteDayCommentAction(id, date);
      setConfirming(null);
      if (!result.ok) return showToast(result.error);
      showToast("コメントを削除しました");
      router.refresh();
    });

  return (
    <section className="mx-4 mb-4 rounded-xl border border-border bg-surface p-4" aria-label="コメント">
      <h2 className="mb-3 font-semibold">
        コメント{comments.length > 0 && <span className="ml-1 text-sm font-normal text-muted">（{comments.length}）</span>}
      </h2>

      {comments.length === 0 ? (
        <p className="mb-3 text-sm text-muted">まだコメントはありません。今日のひとことをどうぞ。</p>
      ) : (
        <ul className="mb-4 space-y-3">
          {comments.map((c) => (
            <li key={c.id}>
              <div className="flex items-center gap-2 text-sm">
                <MemberName userId={c.userId} name={c.displayName} size={24} className="font-medium" />
                <RelativeTime iso={c.createdAt} className="text-xs text-muted" />
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
        <label className="sr-only" htmlFor={`comment-${date}`}>
          コメント
        </label>
        <textarea
          id={`comment-${date}`}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
          maxLength={MAX_LENGTH * 2}
          placeholder="例：夕方は空いてた！"
          className="w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-base outline-none focus:border-accent"
        />
        <div className="flex items-center justify-between">
          <span className={`text-xs ${length > MAX_LENGTH ? "text-danger" : "text-muted"}`}>
            {length}/{MAX_LENGTH}
          </span>
          <button
            type="button"
            onClick={post}
            disabled={pending || length === 0 || length > MAX_LENGTH}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg disabled:opacity-40"
          >
            {pending ? "送信中…" : "コメントする"}
          </button>
        </div>
        <p className="text-xs text-muted">メンバー全員が見られます。この日にFitに行った人とコメントした人に通知されます。</p>
      </div>
    </section>
  );
}
