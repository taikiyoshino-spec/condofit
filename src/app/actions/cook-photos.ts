"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireCookUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { detectImageType } from "@/lib/avatar";
import { PHOTO_FULL_MAX_BYTES, PHOTO_THUMB_MAX_BYTES } from "@/lib/cook/photo";

// レシピの写真（自分で撮った完成写真）。端末側で縮小済みの表示用とサムネイルの2枚を受け取る

export type PhotoResult = { ok: true } | { ok: false; error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;
const BUCKET = "recipe-photos";

/** 自分のレシピか（写真を変えられるのは作成者だけ）。今の写真のパスも返す */
async function ownRecipe(recipeId: string, userId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("recipes")
    .select("photo_path, thumb_path")
    .eq("id", recipeId)
    .eq("owner_user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  return data as { photo_path: string | null; thumb_path: string | null } | null;
}

async function readImage(v: FormDataEntryValue | null, maxBytes: number) {
  if (!(v instanceof File) || v.size === 0 || v.size > maxBytes) return null;
  const bytes = new Uint8Array(await v.arrayBuffer());
  const type = detectImageType(bytes);
  return type ? { bytes, type } : null;
}

export async function uploadRecipePhotoAction(recipeId: string, formData: FormData): Promise<PhotoResult> {
  const member = await requireCookUser();
  if (!UUID_RE.test(recipeId)) return { ok: false, error: "不正なレシピです" };
  const current = await ownRecipe(recipeId, member.id);
  if (!current) return { ok: false, error: "自分のレシピだけ写真を変えられます" };

  const full = await readImage(formData.get("full"), PHOTO_FULL_MAX_BYTES);
  const thumb = await readImage(formData.get("thumb"), PHOTO_THUMB_MAX_BYTES);
  if (!full || !thumb) return { ok: false, error: "画像を読み込めませんでした" };

  const admin = createAdminClient();
  const base = `${recipeId}/${randomBytes(8).toString("hex")}`;
  const photoPath = `${base}.${EXT[full.type]}`;
  const thumbPath = `${base}-t.${EXT[thumb.type]}`;
  const up1 = await admin.storage.from(BUCKET).upload(photoPath, full.bytes, { contentType: full.type, upsert: false });
  const up2 = up1.error ? up1 : await admin.storage.from(BUCKET).upload(thumbPath, thumb.bytes, { contentType: thumb.type, upsert: false });
  if (up1.error || up2.error) {
    await admin.storage.from(BUCKET).remove([photoPath, thumbPath]);
    return { ok: false, error: "写真のアップロードに失敗しました" };
  }
  const { error } = await admin.from("recipes").update({ photo_path: photoPath, thumb_path: thumbPath }).eq("id", recipeId);
  if (error) {
    await admin.storage.from(BUCKET).remove([photoPath, thumbPath]);
    return { ok: false, error: "写真を保存できませんでした" };
  }
  const old = [current.photo_path, current.thumb_path].filter((p): p is string => Boolean(p));
  if (old.length) await admin.storage.from(BUCKET).remove(old);
  revalidatePath("/cook", "layout");
  return { ok: true };
}

export async function removeRecipePhotoAction(recipeId: string): Promise<PhotoResult> {
  const member = await requireCookUser();
  if (!UUID_RE.test(recipeId)) return { ok: false, error: "不正なレシピです" };
  const current = await ownRecipe(recipeId, member.id);
  if (!current) return { ok: false, error: "自分のレシピだけ写真を変えられます" };
  const admin = createAdminClient();
  const { error } = await admin.from("recipes").update({ photo_path: null, thumb_path: null }).eq("id", recipeId);
  if (error) return { ok: false, error: "写真を削除できませんでした" };
  const old = [current.photo_path, current.thumb_path].filter((p): p is string => Boolean(p));
  if (old.length) await admin.storage.from(BUCKET).remove(old);
  revalidatePath("/cook", "layout");
  return { ok: true };
}
