// チェックイン判定用の距離計算。座標はこの判定にだけ使い、保存・ログ出力しない。

export const CHECK_IN_RADIUS_M = 50;

export type LatLng = { lat: number; lng: number };

export function isValidLatLng(p: unknown): p is LatLng {
  if (typeof p !== "object" || p === null) return false;
  const { lat, lng } = p as Record<string, unknown>;
  return (
    typeof lat === "number" && typeof lng === "number" &&
    Number.isFinite(lat) && Number.isFinite(lng) &&
    Math.abs(lat) <= 90 && Math.abs(lng) <= 180
  );
}

/** 2点間の距離（m、ハーバーサイン式） */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const R = 6371008.8;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function isWithinGym(position: LatLng, gym: LatLng): boolean {
  return distanceMeters(position, gym) <= CHECK_IN_RADIUS_M;
}

/** 環境変数から店舗座標を読む。未設定・不正なら null（チェックイン不可） */
export function parseGymLocation(lat: string | undefined, lng: string | undefined): LatLng | null {
  if (!lat || !lng) return null;
  const p = { lat: Number(lat), lng: Number(lng) };
  return isValidLatLng(p) ? p : null;
}
