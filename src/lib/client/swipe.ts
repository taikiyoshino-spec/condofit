// 左右スワイプの判定（純粋関数）。縦スクロールと区別するため、横方向が十分大きく縦より明確に長いときだけ

export const SWIPE_MIN_PX = 60;
const DIRECTION_RATIO = 1.5;

/** 指の移動量から方向を返す。left = 左へスワイプ（翌日へ）、right = 右へスワイプ（前日へ） */
export function swipeDirection(dx: number, dy: number): "left" | "right" | null {
  if (Math.abs(dx) < SWIPE_MIN_PX) return null;
  if (Math.abs(dx) < Math.abs(dy) * DIRECTION_RATIO) return null;
  return dx < 0 ? "left" : "right";
}
