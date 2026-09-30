import { parseGymLocation } from "@/lib/geo";
import { envStatus } from "@/lib/origin";

// 稼働確認用。設定の有無・状態だけを返す（座標や秘密値そのものは返さない）
const isNumber = (v: string) => Number.isFinite(Number(v));

export function GET() {
  return Response.json({
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    gymConfigured: parseGymLocation(process.env.GYM_LAT, process.env.GYM_LNG) !== null,
    env: {
      GYM_LAT: envStatus(process.env.GYM_LAT, isNumber),
      GYM_LNG: envStatus(process.env.GYM_LNG, isNumber),
      APP_ORIGIN: envStatus(process.env.APP_ORIGIN),
    },
    pushConfigured: Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY),
    cronConfigured: Boolean(process.env.CRON_SECRET),
  });
}
