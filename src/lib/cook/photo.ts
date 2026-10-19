// レシピの写真の大きさ・URL（サーバー・端末どちらからも使う）

export const PHOTO_FULL_SIDE = 1200;
export const PHOTO_THUMB_SIDE = 240;
export const PHOTO_FULL_MAX_BYTES = 2 * 1024 * 1024;
export const PHOTO_THUMB_MAX_BYTES = 200 * 1024;

/** 写真の配信URL。保存パスのファイル名を v に入れ、写真を変えるとURLも変わる（長くキャッシュできる） */
export function recipePhotoUrl(recipeId: string, path: string, size: "full" | "thumb"): string {
  const v = path.split("/").pop()?.split(".")[0] ?? "";
  return `/api/cook/photo/${recipeId}?size=${size}&v=${v}`;
}

/** 「作った」の写真の配信URL（レシピの写真と同じ作り） */
export function cookPhotoUrl(cookId: string, path: string, size: "full" | "thumb"): string {
  const v = path.split("/").pop()?.split(".")[0] ?? "";
  return `/api/cook/cooked-photo/${cookId}?size=${size}&v=${v}`;
}
