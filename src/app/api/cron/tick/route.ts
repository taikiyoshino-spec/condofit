import { timingSafeEqual } from "node:crypto";
import { autoCheckOutStaleCheckIns, notifyStaleCheckIns, purgeExpiredNotifications } from "@/lib/checkin/service";

// Supabase pg_cron（pg_net）から毎分呼ばれる。15分確認通知・1時間で自動チェックアウト・期限切れ通知の削除。
function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function POST(request: Request) {
  if (!authorized(request)) return new Response("unauthorized", { status: 401 });
  const stale = await notifyStaleCheckIns();
  const autoCheckedOut = await autoCheckOutStaleCheckIns();
  const purged = await purgeExpiredNotifications();
  return Response.json({ stale, autoCheckedOut, purged });
}
