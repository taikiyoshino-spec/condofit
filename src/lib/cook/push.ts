import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPush } from "@/lib/push";
import { formatNotification } from "@/lib/notifications/format";

type CookType = "cook_cooked" | "cook_comment" | "cook_favorite" | "cook_new_recipe";
const CATEGORY = {
  cook_cooked: "cook_cooked",
  cook_comment: "cook_reaction",
  cook_favorite: "cook_reaction",
  cook_new_recipe: "cook_new_recipe",
} as const;

/**
 * DBトリガーが作ったアプリ内通知と同じ相手・同じ内容でプッシュを送る（CondoFit の予定の通知と同じ作り）。
 * 対象は「この人の操作で、このレシピについて、since 以降に作られた、この種類の通知」
 */
export async function pushCookNotifications(actorId: string, actorName: string, recipeId: string, type: CookType, since: Date) {
  const admin = createAdminClient();
  // サーバーとDBの時計のわずかなずれを見込んで1秒前から
  const from = new Date(since.getTime() - 1000).toISOString();
  const { data } = await admin
    .from("notifications")
    .select("recipient_user_id, payload")
    .eq("actor_user_id", actorId)
    .eq("type", type)
    .eq("payload->>recipe_id", recipeId)
    .gte("created_at", from);
  if (!data?.length) return;
  const f = formatNotification({ id: "", type, actorName, payload: (data[0].payload ?? {}) as Record<string, unknown>, createdAt: "", readAt: null });
  await sendPush(
    [...new Set(data.map((n) => n.recipient_user_id as string))],
    CATEGORY[type],
    { title: f.text, body: f.sub ?? "", url: f.href, tag: `${type}-${recipeId}` },
  );
}
