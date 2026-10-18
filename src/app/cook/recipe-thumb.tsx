import { colorFor } from "@/lib/avatar";
import { recipePhotoUrl } from "@/lib/cook/photo";

/** レシピのサムネイル（低画質の縮小画像。写真がなければ料理名の頭文字） */
export function RecipeThumb({
  recipeId,
  title,
  thumbPath,
  size,
}: {
  recipeId: string;
  title: string;
  thumbPath: string | null;
  size: number;
}) {
  const style = { width: size, height: size };
  if (thumbPath) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- 認証付きの配信なので next/image の最適化は使わない
      <img
        src={recipePhotoUrl(recipeId, thumbPath, "thumb")}
        alt=""
        loading="lazy"
        style={style}
        className="shrink-0 rounded-lg bg-border object-cover"
      />
    );
  }
  return (
    <span
      aria-hidden
      style={{ ...style, backgroundColor: colorFor(recipeId), fontSize: Math.round(size * 0.4) }}
      className="flex shrink-0 items-center justify-center rounded-lg font-bold text-white"
    >
      {[...title][0] ?? ""}
    </span>
  );
}
