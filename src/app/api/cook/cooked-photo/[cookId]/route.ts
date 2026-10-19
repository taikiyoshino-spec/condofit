import type { NextRequest } from "next/server";
import { getCurrentMember } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { cookPhotoUrl } from "@/lib/cook/photo";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 「作った」の写真の配信。そのレシピが見える人（RLS で判定）にだけ返す（バケットは非公開）
export async function GET(request: NextRequest, ctx: RouteContext<"/api/cook/cooked-photo/[cookId]">) {
  const { cookId } = await ctx.params;
  if (!UUID_RE.test(cookId)) return new Response("not found", { status: 404 });
  if (!(await getCurrentMember())) return new Response("unauthorized", { status: 401 });
  const size = request.nextUrl.searchParams.get("size") === "thumb" ? "thumb" : "full";

  const supabase = await createClient();
  const { data: cook } = await supabase.from("recipe_cooks").select("photo_path, thumb_path").eq("id", cookId).maybeSingle();
  const path = (size === "thumb" ? cook?.thumb_path : cook?.photo_path) as string | null | undefined;
  if (!path) return new Response("not found", { status: 404 });

  const { data: file, error } = await createAdminClient().storage.from("recipe-photos").download(path);
  if (error || !file) return new Response("not found", { status: 404 });

  const current = cookPhotoUrl(cookId, path, size);
  const requested = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  const cache = current === requested ? "private, max-age=31536000, immutable" : "private, no-cache";
  return new Response(file, {
    headers: { "Content-Type": file.type || "image/jpeg", "Cache-Control": cache, "X-Content-Type-Options": "nosniff" },
  });
}
