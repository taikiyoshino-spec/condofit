// ブラウザの位置情報を取得する。結果はサーバーでの判定に渡すだけで、保持しない。
import type { LatLng } from "@/lib/geo";

export class GeolocationError extends Error {
  constructor(public reason: "unsupported" | "denied" | "unavailable" | "timeout") {
    super(reason);
  }
}

export function getPosition(options: { fresh: boolean }): Promise<LatLng> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) return reject(new GeolocationError("unsupported"));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      (e) =>
        reject(
          new GeolocationError(
            e.code === e.PERMISSION_DENIED ? "denied" : e.code === e.TIMEOUT ? "timeout" : "unavailable",
          ),
        ),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: options.fresh ? 0 : 30000 },
    );
  });
}

export function geolocationMessage(e: unknown): string {
  const reason = e instanceof GeolocationError ? e.reason : "unavailable";
  return {
    unsupported: "この端末では位置情報を使えません",
    denied: "位置情報の利用を許可してください（ブラウザ・端末の設定）",
    timeout: "位置情報を取得できませんでした。もう一度お試しください",
    unavailable: "位置情報を取得できませんでした。GPSがONか確認してください",
  }[reason];
}
