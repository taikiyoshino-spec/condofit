"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireCookUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { detectImageType } from "@/lib/avatar";
import { PHOTO_FULL_MAX_BYTES, PHOTO_THUMB_MAX_BYTES } from "@/lib/cook/photo";
import { pushCookNotifications } from "@/lib/cook/push";

// レシピへの反応（作った・お気に入り・作りたい・コメント。D20）。
// 見える範囲・本人確認・数の更新・通知（アプリ内）は DB 側（RLS・トリガー）で行い、プッシュはレスポンス後に送る

export type ReactionResult = { ok: true } | { ok: false; error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;
const BUCKET = "recipe-photos";
const NOTE_MAX = 200;
const COMMENT_MAX = 500;

const refresh = (recipeId: string) => revalidatePath(`/cook/r/${recipeId}`);

async function readImage(v: FormDataEntryValue | null, maxBytes: number) {
  if (!(v instanceof File) || v.size === 0 || v.size > maxBytes) return null;
  const bytes = new Uint8Array(await v.arrayBuffer());
  const type = detectImageType(bytes);
  return type ? { bytes, type } : null;
}

/** 「作った」を記録する（一言・写真は任意。何度でも） */
export async function recordCookAction(recipeId: string, formData: FormData): Promise<ReactionResult> {
  const member = await requireCookUser();
  if (!UUID_RE.test(recipeId)) return { ok: false, error: "不正なレシピです" };
  const note = String(formData.get("note") ?? "").trim();
  if ([...note].length > NOTE_MAX) return { ok: false, error: `一言は${NOTE_MAX}文字以内で入力してください` };
  const hasPhoto = formData.get("full") instanceof File && (formData.get("full") as File).size > 0;
  const full = hasPhoto ? await readImage(formData.get("full"), PHOTO_FULL_MAX_BYTES) : null;
  const thumb = hasPhoto ? await readImage(formData.get("thumb"), PHOTO_THUMB_MAX_BYTES) : null;
  if (hasPhoto && (!full || !thumb)) return { ok: false, error: "画像を読み込めませんでした" };

  const startedAt = new Date();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("recipe_cooks")
    .insert({ recipe_id: recipeId, user_id: member.id, note: note || null })
    .select("id")
    .single();
  if (error) return { ok: false, error: "記録できませんでした" };

  // 写真はサーバー（service_role）で置く。失敗しても「作った」は残す
  let photoFailed = false;
  if (full && thumb) {
    const admin = createAdminClient();
    const base = `cooks/${data.id}/${randomBytes(8).toString("hex")}`;
    const photoPath = `${base}.${EXT[full.type]}`;
    const thumbPath = `${base}-t.${EXT[thumb.type]}`;
    const up1 = await admin.storage.from(BUCKET).upload(photoPath, full.bytes, { contentType: full.type, upsert: false });
    const up2 = up1.error ? up1 : await admin.storage.from(BUCKET).upload(thumbPath, thumb.bytes, { contentType: thumb.type, upsert: false });
    const saved =
      !up1.error && !up2.error && !(await admin.from("recipe_cooks").update({ photo_path: photoPath, thumb_path: thumbPath }).eq("id", data.id)).error;
    if (!saved) {
      await admin.storage.from(BUCKET).remove([photoPath, thumbPath]);
      photoFailed = true;
    }
  }

  refresh(recipeId);
  revalidatePath("/cook/ranking");
  after(() => pushCookNotifications(member.id, member.displayName, recipeId, "cook_cooked", startedAt));
  return photoFailed ? { ok: false, error: "記録しましたが、写真を保存できませんでした" } : { ok: true };
}

/** 「作った」を消す（本人と管理者。DBのRLSで強制）。写真も消す */
export async function deleteCookAction(cookId: string, recipeId: string): Promise<ReactionResult> {
  await requireCookUser();
  if (!UUID_RE.test(cookId) || !UUID_RE.test(recipeId)) return { ok: false, error: "不正な記録です" };
  const supabase = await createClient();
  const { data, error } = await supabase.from("recipe_cooks").delete().eq("id", cookId).select("photo_path, thumb_path");
  if (error || !data.length) return { ok: false, error: "削除できませんでした" };
  const paths = [data[0].photo_path, data[0].thumb_path].filter((p): p is string => Boolean(p));
  if (paths.length) await createAdminClient().storage.from(BUCKET).remove(paths);
  refresh(recipeId);
  revalidatePath("/cook/ranking");
  return { ok: true };
}

/** お気に入り・作りたいの切り替え */
export async function toggleRecipeMarkAction(recipeId: string, kind: "favorite" | "want", on: boolean): Promise<ReactionResult> {
  const member = await requireCookUser();
  if (!UUID_RE.test(recipeId) || (kind !== "favorite" && kind !== "want")) return { ok: false, error: "不正なレシピです" };
  const table = kind === "favorite" ? "recipe_favorites" : "recipe_wants";
  const startedAt = new Date();
  const supabase = await createClient();
  const { error } = on
    ? await supabase.from(table).upsert({ recipe_id: recipeId, user_id: member.id }, { onConflict: "recipe_id,user_id", ignoreDuplicates: true })
    : await supabase.from(table).delete().eq("recipe_id", recipeId).eq("user_id", member.id);
  if (error) return { ok: false, error: "保存できませんでした" };
  refresh(recipeId);
  if (on && kind === "favorite") after(() => pushCookNotifications(member.id, member.displayName, recipeId, "cook_favorite", startedAt));
  return { ok: true };
}

export async function postRecipeCommentAction(recipeId: string, rawBody: string): Promise<ReactionResult> {
  const member = await requireCookUser();
  if (!UUID_RE.test(recipeId)) return { ok: false, error: "不正なレシピです" };
  const body = String(rawBody ?? "").trim();
  if (!body) return { ok: false, error: "コメントを入力してください" };
  if ([...body].length > COMMENT_MAX) return { ok: false, error: `${COMMENT_MAX}文字以内で入力してください` };
  const startedAt = new Date();
  const supabase = await createClient();
  const { error } = await supabase.from("recipe_comments").insert({ recipe_id: recipeId, user_id: member.id, body });
  if (error) return { ok: false, error: "投稿できませんでした" };
  refresh(recipeId);
  after(() => pushCookNotifications(member.id, member.displayName, recipeId, "cook_comment", startedAt));
  return { ok: true };
}

/** コメントの削除（書いた本人と管理者。DBのRLSで強制） */
export async function deleteRecipeCommentAction(commentId: string, recipeId: string): Promise<ReactionResult> {
  await requireCookUser();
  if (!UUID_RE.test(commentId) || !UUID_RE.test(recipeId)) return { ok: false, error: "不正なコメントです" };
  const supabase = await createClient();
  const { data, error } = await supabase.from("recipe_comments").delete().eq("id", commentId).select("id");
  if (error || !data.length) return { ok: false, error: "削除できませんでした" };
  refresh(recipeId);
  return { ok: true };
}
