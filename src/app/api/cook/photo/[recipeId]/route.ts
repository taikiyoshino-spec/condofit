import type { NextRequest } from "next/server";
import { getCurrentMember } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { recipePhotoUrl } from "@/lib/cook/photo";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// レシピの写真の配信。そのレシピが見える人（公開範囲は RLS で判定）にだけ返す（バケットは非公開）
export async function GET(request: NextRequest, ctx: RouteContext<"/api/cook/photo/[recipeId]">) {
  const { recipeId } = await ctx.params;
  if (!UUID_RE.test(recipeId)) return new Response("not found", { status: 404 });
  if (!(await getCurrentMember())) return new Response("unauthorized", { status: 401 });
  const size = request.nextUrl.searchParams.get("size") === "thumb" ? "thumb" : "full";

  // 本人の権限で読む（見えないレシピは取れない）
  const supabase = await createClient();
  const { data: recipe } = await supabase.from("recipes").select("photo_path, thumb_path").eq("id", recipeId).maybeSingle();
  const path = (size === "thumb" ? recipe?.thumb_path : recipe?.photo_path) as string | null | undefined;
  if (!path) return new Response("not found", { status: 404 });

  const { data: file, error } = await createAdminClient().storage.from("recipe-photos").download(path);
  if (error || !file) return new Response("not found", { status: 404 });

  // URLの v が今の写真と一致するときだけ長期キャッシュ（写真を変えるとURLが変わる）
  const current = recipePhotoUrl(recipeId, path, size);
  const requested = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  const cache = current === requested ? "private, max-age=31536000, immutable" : "private, no-cache";
  return new Response(file, {
    headers: { "Content-Type": file.type || "image/jpeg", "Cache-Control": cache, "X-Content-Type-Options": "nosniff" },
  });
}
