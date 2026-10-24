import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGeneratePrompt, cleanMenuRequest } from "../src/lib/menus/generate.ts";

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
