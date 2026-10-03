import { test } from "node:test";
import assert from "node:assert/strict";
import { formatNotification, type NotificationRow } from "../src/lib/notifications/format.ts";
import { formatActivity } from "../src/lib/home/activity.ts";

const n = (type: string, payload: Record<string, unknown>, actorName: string | null = "A"): NotificationRow => ({
  id: "1", type, payload, actorName, createdAt: "", readAt: null,
});
const sid = "00000000-0000-0000-0000-000000000001";

test("予定変更の通知は「9/28 夕 → 夜」形式", () => {
  const f = formatNotification(n("schedule_update", {
    schedule_id: sid, old_date: "2026-09-28", old_time_slot: "evening", new_date: "2026-09-28", new_time_slot: "night",
  }));
  assert.equal(f.text, "Aさんが予定を変更しました");
  assert.equal(f.sub, "9/28 夕 → 夜");
  assert.equal(f.href, `/schedule/s/${sid}`);
});

test("予定変更で日付も変わった場合は日付も出す", () => {
  const f = formatNotification(n("schedule_update", {
    old_date: "2026-09-28", old_time_slot: "evening", new_date: "2026-09-29", new_time_slot: "night",
  }));
  assert.equal(f.sub, "9/28 夕 → 9/29 夜");
});

test("予定削除の通知は「9/28 夜の予定」", () => {
  const f = formatNotification(n("schedule_delete", { date: "2026-09-28", time_slot: "night" }));
  assert.equal(f.text, "Aさんが予定を削除しました");
  assert.equal(f.sub, "9/28 夜の予定");
});

test("参加・キャンセル・チェックイン・位置確認停止", () => {
  assert.equal(formatNotification(n("schedule_join", { intention: "maybe", date: "2026-09-28", time_slot: "noon" })).text,
    "Aさんが予定に「行けたら行く」で参加しました");
  assert.equal(formatNotification(n("schedule_cancel", {})).text, "Aさんが予定の参加をキャンセルしました");
  assert.equal(formatNotification(n("check_in", {})).text, "AさんがFitにチェックインしました");
  assert.match(formatNotification(n("location_stale", {}, null)).text, /まだFitにいますか/);
});

test("最近の活動の文言（詳細は出さない）", () => {
  const base = { displayName: "C", occurredAt: "" };
  assert.equal(formatActivity({ ...base, kind: "visited", detail: { exercise_count: 0 } }), "CさんがFitに行きました");
  assert.equal(formatActivity({ ...base, kind: "visited", detail: { exercise_count: 1, first_exercise_name: "ベンチプレス" } }),
    "Cさんがベンチプレスを記録しました");
  assert.equal(formatActivity({ ...base, kind: "visited", detail: { exercise_count: 3, first_exercise_name: "ベンチプレス" } }),
    "Cさんがベンチプレスほか2種目を記録しました");
  assert.equal(formatActivity({ ...base, kind: "schedule_created", detail: { date: "2026-09-29", time_slot: "night" } }),
    "Cさんが9/29夜の予定を作成しました");
});

test("実績コメントの通知は「10/3の実績にコメントしました」とひとこと、その日の画面へ", () => {
  const f = formatNotification(n("day_comment", { date: "2026-10-03", excerpt: "夕方は空いてた！" }));
  assert.equal(f.text, "Aさんが10/3の実績にコメントしました");
  assert.equal(f.sub, "夕方は空いてた！");
  assert.equal(f.href, "/schedule/2026-10-03");
});
