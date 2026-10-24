import { test } from "node:test";
import assert from "node:assert/strict";
import { quotaDayEnd, quotaDayStart, summarizeUsage } from "../src/lib/ai/usage.ts";

test("無料枠の「今日」は太平洋時間の0時から（夏時間は日本時間16時、冬は17時）", () => {
  // 夏時間（PDT, UTC-7）: 10/24 12:00 JST = 10/23 20:00 PDT → 10/23 0:00 PDT = 10/23 07:00Z
  assert.equal(quotaDayStart(new Date("2026-10-24T03:00:00Z")).toISOString(), "2026-10-23T07:00:00.000Z");
  assert.equal(quotaDayEnd(new Date("2026-10-24T03:00:00Z")).toISOString(), "2026-10-24T07:00:00.000Z");
  // 冬時間（PST, UTC-8）
  assert.equal(quotaDayStart(new Date("2026-12-01T09:00:00Z")).toISOString(), "2026-12-01T08:00:00.000Z");
  // 夏時間が終わる日（11/1）をまたぐ
  assert.equal(quotaDayEnd(new Date("2026-11-01T06:00:00Z")).toISOString(), "2026-11-01T07:00:00.000Z");
  assert.equal(quotaDayEnd(new Date("2026-11-01T08:00:00Z")).toISOString(), "2026-11-02T08:00:00.000Z");
});

test("利用状況の集計: 今日の合計・機能ごと・日ごと", () => {
  const rows = [
    { createdAt: "2026-10-24T08:00:00Z", feature: "fit_menu", ok: true, reason: null, totalTokens: 1000 },
    { createdAt: "2026-10-24T07:30:00Z", feature: "cook_match", ok: false, reason: "quota", totalTokens: null },
    { createdAt: "2026-10-24T06:59:00Z", feature: "fit_menu", ok: true, reason: null, totalTokens: 500 }, // 前の日の枠
  ];
  const s = summarizeUsage(rows, new Date("2026-10-24T09:00:00Z"));
  assert.deepEqual(s.today, { requests: 2, failed: 1, quotaErrors: 1, tokens: 1000 });
  assert.deepEqual(s.byFeature.map((f) => [f.label, f.requests]), [["メニュー作成", 1], ["材料の当てはめ", 1]]);
  assert.deepEqual(s.byDay.map((d) => [d.date, d.requests, d.tokens]), [["2026-10-24", 3, 1500]]);
});
