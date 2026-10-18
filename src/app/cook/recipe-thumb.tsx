import { colorFor } from "@/lib/avatar";

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
    // 一覧用の小さな画像（パスが変われば URL も変わるので長くキャッシュできる）
    const v = thumbPath.split("/").pop()?.split(".")[0] ?? "";
    return (
      // eslint-disable-next-line @next/next/no-img-element -- 認証付きの配信なので next/image の最適化は使わない
      <img
        src={`/api/cook/photo/${recipeId}?size=thumb&v=${v}`}
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
