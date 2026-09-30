import type { NextRequest } from "next/server";
import { getCurrentMember } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { avatarUrl } from "@/lib/avatar";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// プロフィール画像の配信。グループのメンバーにだけ返す（バケットは非公開）
export async function GET(request: NextRequest, ctx: RouteContext<"/api/avatar/[userId]">) {
  const { userId } = await ctx.params;
  if (!UUID_RE.test(userId)) return new Response("not found", { status: 404 });
  if (!(await getCurrentMember())) return new Response("unauthorized", { status: 401 });

  const admin = createAdminClient();
  const { data: user } = await admin.from("users").select("avatar_path").eq("id", userId).maybeSingle();
  const path = user?.avatar_path as string | null | undefined;
  if (!path) return new Response("not found", { status: 404 });

  const { data: file, error } = await admin.storage.from("avatars").download(path);
  if (error || !file) return new Response("not found", { status: 404 });

  // URLの v が現在の画像と一致するときだけ長期キャッシュ（画像を変えるとURLが変わる）
  const current = avatarUrl(userId, path);
  const requested = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  const cache = current === requested ? "private, max-age=31536000, immutable" : "private, no-cache";

  return new Response(file, {
    headers: {
      "Content-Type": file.type || "image/jpeg",
      "Cache-Control": cache,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
