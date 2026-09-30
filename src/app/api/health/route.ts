import { parseGymLocation } from "@/lib/geo";

// 稼働確認用。設定の有無だけを返す（座標や秘密値そのものは返さない）
export function GET() {
  return Response.json({
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    gymConfigured: parseGymLocation(process.env.GYM_LAT, process.env.GYM_LNG) !== null,
    pushConfigured: Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY),
    cronConfigured: Boolean(process.env.CRON_SECRET),
  });
}
