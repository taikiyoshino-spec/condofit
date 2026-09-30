"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { removeAvatarAction, uploadAvatarAction } from "@/app/actions/avatar";
import { Avatar } from "@/components/avatar";
import { showToast } from "@/components/toaster";
import { avatarUrl } from "@/lib/avatar";
import { resizeToSquareJpeg } from "@/lib/client/resize-image";

export function AvatarForm({ userId, name, avatarPath }: { userId: string; name: string; avatarPath: string | null }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [path, setPath] = useState(avatarPath);
  const [preview, setPreview] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const onFile = (file: File | undefined) => {
    if (!file) return;
    startTransition(async () => {
      try {
        const blob = await resizeToSquareJpeg(file);
        const localUrl = URL.createObjectURL(blob);
        setPreview(localUrl);
        const form = new FormData();
        form.append("file", blob, "avatar.jpg");
        const result = await uploadAvatarAction(form);
        if (!result.ok) {
          setPreview(null);
          return showToast(result.error);
        }
        setPath(result.avatarPath);
        showToast("写真を登録しました");
        router.refresh();
      } catch {
        setPreview(null);
        showToast("この画像は読み込めませんでした。別の写真を選んでください");
      } finally {
        if (inputRef.current) inputRef.current.value = "";
      }
    });
  };

  const remove = () =>
    startTransition(async () => {
      const result = await removeAvatarAction();
      if (!result.ok) return showToast(result.error);
      setPath(null);
      setPreview(null);
      showToast("写真を削除しました");
      router.refresh();
    });

  return (
    <div className="flex items-center gap-4">
      <Avatar userId={userId} name={name} size={72} src={preview ?? avatarUrl(userId, path)} />
      <div className="flex flex-1 flex-col gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => onFile(e.target.files?.[0])}
        />
        <button
          type="button"
          disabled={pending}
          onClick={() => inputRef.current?.click()}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg disabled:opacity-50"
        >
          {pending ? "処理中…" : path ? "写真を変更" : "写真を登録"}
        </button>
        {path && (
          <button type="button" disabled={pending} onClick={remove} className="text-sm text-muted">
            写真を削除
          </button>
        )}
      </div>
    </div>
  );
}
