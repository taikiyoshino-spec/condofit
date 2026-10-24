import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGeneratePrompt, buildTodayPrompt, cleanMenuRequest, cleanTodayRequest } from "../src/lib/menus/generate.ts";

test("メニュー作成の依頼: 目的・時間は決まった中から、部位はマスタの部位だけ、希望は200文字まで", () => {
  const parts = ["胸", "脚"];
  assert.deepEqual(cleanMenuRequest({ goal: "筋力アップ", minutes: 60, parts: ["胸", "胸", "首"], note: " マシンだけ " }, parts), {
    goal: "筋力アップ",
    minutes: 60,
    parts: ["胸"],
    note: "マシンだけ",
  });
  assert.equal(cleanMenuRequest({ goal: "なんでも", minutes: 60 }, parts), null);
  assert.equal(cleanMenuRequest({ goal: "健康維持", minutes: 50 }, parts), null);
  assert.equal(cleanMenuRequest({ goal: "健康維持", minutes: 30, note: "あ".repeat(300) }, parts)!.note.length, 200);
});

test("メニュー作成の依頼文: 希望・最近の記録・使える種目が入る", () => {
  const p = buildGeneratePrompt({
    request: { goal: "引き締め・ダイエット", minutes: 45, parts: ["脚"], note: "最後に走りたい" },
    exercises: [
      { name: "スクワット", type: "weight", part: "脚", excludesBar: true },
      { name: "ランニングマシン", type: "cardio", part: "有酸素", excludesBar: false },
    ],
    recent: [{ name: "スクワット", sets: [{ weight_kg: 40, reps: 10 }] }],
  });
  assert.match(p, /目的: 引き締め・ダイエット/);
  assert.match(p, /時間: 45分/);
  assert.match(p, /重点的に鍛えたい部位: 脚/);
  assert.match(p, /そのほか: 最後に走りたい/);
  assert.match(p, /- スクワット: 40kg×10回/);
  assert.match(p, /- スクワット（脚・重量系・重さはバーを除いた値）/);
  assert.match(p, /- ランニングマシン（有酸素）/, "部位名と種類が同じなら重ねない");
});

test("今日のメニューの依頼: 調子・部位・時間。部位がなければおまかせで、最近やっていない部位を中心に", () => {
  assert.equal(cleanTodayRequest({ condition: "元気", minutes: 60 }, ["胸"]), null);
  const req = cleanTodayRequest({ condition: "疲れぎみ", minutes: 30, parts: [] }, ["胸"])!;
  const p = buildTodayPrompt({
    request: req,
    exercises: [{ name: "チェストプレス", type: "weight", part: "胸", excludesBar: false }],
    recent: [{ name: "チェストプレス", sets: [{ weight_kg: 40, reps: 10 }] }],
    parts: [
      { name: "胸", sets: 12, daysAgo: 2 },
      { name: "脚", sets: 0, daysAgo: null },
    ],
  });
  assert.match(p, /今日のメニューの案を3つ/, "1回の問い合わせで案をいくつか");
  assert.match(p, /調子: 疲れぎみ（.*軽め/);
  assert.match(p, /やりたい部位: おまかせ/);
  assert.match(p, /- 胸: 12セット・最後は2日前/);
  assert.match(p, /- 脚: 0セット・4週間やっていない/);
  assert.match(p, /- チェストプレス（胸・重量系）/);
});
