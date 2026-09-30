"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { AVATAR_MAX_BYTES, detectImageType } from "@/lib/avatar";

export type AvatarResult = { ok: true; avatarPath: string | null } | { ok: false; error: string };

const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;

/** 自分のプロフィール画像を登録・変更する（端末側で256pxに縮小済みの画像を受け取る） */
export async function uploadAvatarAction(formData: FormData): Promise<AvatarResult> {
  const member = await requireMember();
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "画像を選んでください" };
  if (file.size > AVATAR_MAX_BYTES) return { ok: false, error: "画像が大きすぎます" };

  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = detectImageType(bytes);
  if (!type) return { ok: false, error: "JPEG・PNG・WebPの画像を選んでください" };

  const admin = createAdminClient();
  const { data: current } = await admin.from("users").select("avatar_path").eq("id", member.id).single();
  const path = `${member.id}/${randomBytes(8).toString("hex")}.${EXT[type]}`;

  const { error: uploadError } = await admin.storage.from("avatars").upload(path, bytes, { contentType: type, upsert: false });
  if (uploadError) return { ok: false, error: "アップロードに失敗しました" };

  const { error } = await admin.from("users").update({ avatar_path: path }).eq("id", member.id);
  if (error) {
    await admin.storage.from("avatars").remove([path]);
    return { ok: false, error: "保存に失敗しました" };
  }
  if (current?.avatar_path) await admin.storage.from("avatars").remove([current.avatar_path as string]);

  revalidatePath("/", "layout");
  return { ok: true, avatarPath: path };
}

export async function removeAvatarAction(): Promise<AvatarResult> {
  const member = await requireMember();
  const admin = createAdminClient();
  const { data: current } = await admin.from("users").select("avatar_path").eq("id", member.id).single();
  const { error } = await admin.from("users").update({ avatar_path: null }).eq("id", member.id);
  if (error) return { ok: false, error: "削除に失敗しました" };
  if (current?.avatar_path) await admin.storage.from("avatars").remove([current.avatar_path as string]);
  revalidatePath("/", "layout");
  return { ok: true, avatarPath: null };
}
