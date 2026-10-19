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

/**
 * 買い物リストの通知（D23④）。最後の追加から5分たったまとまりの通知を DB で作り、同じ相手にプッシュを送る。
 * 毎分の定期処理から呼ぶ。送ったまとまりの数を返す
 */
export async function flushShoppingNotifications(): Promise<number> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("flush_shopping_notifications");
  if (error || !data?.length) return 0;
  const rows = data as { recipient_user_id: string; actor_user_id: string; payload: Record<string, unknown> }[];
  const { data: actors } = await admin.from("users").select("id, display_name").in("id", [...new Set(rows.map((r) => r.actor_user_id))]);
  const names = new Map((actors ?? []).map((u) => [u.id as string, u.display_name as string]));

  // 同じ人の同じまとまりごとに送る
  const batches = new Map<string, { actorId: string; payload: Record<string, unknown>; recipients: string[] }>();
  for (const r of rows) {
    const key = `${r.actor_user_id}:${JSON.stringify(r.payload)}`;
    const b = batches.get(key) ?? { actorId: r.actor_user_id, payload: r.payload, recipients: [] };
    b.recipients.push(r.recipient_user_id);
    batches.set(key, b);
  }
  for (const b of batches.values()) {
    const f = formatNotification({ id: "", type: "cook_shopping", actorName: names.get(b.actorId) ?? null, payload: b.payload, createdAt: "", readAt: null });
    await sendPush(b.recipients, "cook_shopping", { title: f.text, body: f.sub ?? "", url: f.href, tag: "cook-shopping" });
  }
  return batches.size;
}
