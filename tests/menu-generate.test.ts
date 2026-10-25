import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGeneratePrompt, buildTodayPrompt, cleanMenuRequest, cleanTodayRequest, completeWeightSets, fitToTime, roundWeight } from "../src/lib/menus/generate.ts";

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

test("今日のメニューの依頼: 強さ・部位・時間。部位がなければおまかせで、最近やっていない部位を中心に", () => {
  assert.equal(cleanTodayRequest({ condition: "元気", minutes: 60 }, ["胸"]), null);
  const req = cleanTodayRequest({ condition: "前回をこえる", minutes: 30, parts: [] }, ["胸"])!;
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
  assert.match(p, /強さ: 前回をこえる（.*5kg上げる/);
  assert.match(p, /部位や種目の選び方は強さに関係なく/, "強さで、最近やっていない部位が外れないように");
  assert.match(p, /やりたい部位: おまかせ/);
  assert.match(p, /- 胸: 12セット・最後は2日前/);
  assert.match(p, /- 脚: 0セット・4週間やっていない/);
  assert.match(p, /- チェストプレス（胸・重量系）/);
  assert.match(p, /有酸素は1種目10〜30分、筋トレは1種目5〜10分.*合計が30分に収まる/);
  assert.match(p, /reason は、その組み合わせを選んだ理由を端的に/);
});

test("時間に合わせる: 有酸素は10〜30分、筋トレは1種目5〜10分。合計が超えたら後ろから外す", () => {
  const w = (minutes: number | null, sets = 3) => ({ type: "weight" as const, minutes, sets: Array.from({ length: sets }, () => ({ weight_kg: 40, reps: 10 })) });
  const c = (duration: number | null, minutes: number | null = null) => ({ type: "cardio" as const, minutes, sets: [{ duration_min: duration }] });
  assert.deepEqual(fitToTime([w(3), w(15), w(null, 4)], 60).map((x) => x.minutes), [5, 10, 8], "筋トレは5〜10分。なければセット数×2分");
  const cardio = fitToTime([c(45), c(5), c(null, 20)], 90);
  assert.deepEqual(cardio.map((x) => x.minutes), [30, 10, 20], "有酸素は10〜30分");
  assert.deepEqual(cardio.map((x) => x.sets[0].duration_min), [30, 10, 20], "記録する時間も合わせる");
  assert.deepEqual(fitToTime([w(10), w(10), c(20)], 15).map((x) => x.minutes), [10, 10], "15分なら20分まで（5分の超過は許す）");
  assert.equal(fitToTime([c(30)], 15).length, 1, "1つは残す");
});

test("今日の有酸素: しない・する・多めに。選ばなければおまかせ。アプリでも守る", () => {
  assert.equal(cleanTodayRequest({ condition: "いつもどおり", minutes: 60 }, [])!.cardio, "おまかせ");
  assert.equal(cleanTodayRequest({ condition: "いつもどおり", minutes: 60, cardio: "毎日" }, [])!.cardio, "おまかせ");
  const req = cleanTodayRequest({ condition: "いつもどおり", minutes: 60, cardio: "多めに" }, [])!;
  assert.match(buildTodayPrompt({ request: req, exercises: [], recent: [], parts: [] }), /有酸素: 多めに（.*半分くらい/);

  const w = (minutes: number) => ({ type: "weight" as const, minutes, sets: [{ weight_kg: 40, reps: 10 }] });
  const c = (duration: number) => ({ type: "cardio" as const, minutes: duration, sets: [{ duration_min: duration }] });
  assert.deepEqual(fitToTime([w(10), c(20), w(10)], 60, "しない").map((x) => x.type), ["weight", "weight"], "しないなら有酸素を外す");
  assert.deepEqual(fitToTime([w(10), w(10), c(20)], 30, "する").map((x) => x.type), ["weight", "cardio"], "時間が超えたら筋トレから外す");
  assert.deepEqual(fitToTime([w(10), w(10), c(20)], 30).map((x) => x.type), ["weight", "weight"], "おまかせなら後ろから");
});

test("重量系のセットは「重さ×回数」にそろえる: 省かれた重さ・回数は前回の記録で、回数がなければ10回", () => {
  const last = [
    { weight_kg: 40, reps: 12, duration_min: null, distance_km: null },
    { weight_kg: 45, reps: 8, duration_min: null, distance_km: null },
  ];
  assert.deepEqual(completeWeightSets([{ reps: 10 }, { reps: 10 }, { reps: 10 }], last), [
    { weight_kg: 40, reps: 10 },
    { weight_kg: 45, reps: 10 },
    { weight_kg: 45, reps: 10 },
  ]);
  assert.deepEqual(completeWeightSets([{ weight_kg: 30 }, { weight_kg: 40 }], last), [
    { weight_kg: 30, reps: 12 },
    { weight_kg: 40, reps: 8 },
  ]);
  assert.deepEqual(completeWeightSets([{ weight_kg: 30 }, { reps: 15 }], undefined), [{ weight_kg: 30, reps: 10 }, { reps: 15 }], "前回がなければ重さは空のまま");
});

test("AIのメニューの重さは5kg単位（いちばん近い値、最低5kg）。前回の記録で補った重さも", () => {
  assert.deepEqual([roundWeight(42.5), roundWeight(41), roundWeight(43), roundWeight(1), roundWeight(60)], [45, 40, 45, 5, 60]);
  const last = [{ weight_kg: 32.5, reps: 10, duration_min: null, distance_km: null }];
  assert.deepEqual(completeWeightSets([{ weight_kg: 22, reps: 12 }, { reps: 8 }], last), [
    { weight_kg: 20, reps: 12 },
    { weight_kg: 35, reps: 8 },
  ]);
});
