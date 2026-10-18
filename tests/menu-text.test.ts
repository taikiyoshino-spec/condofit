import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMenuPrompt, guessType, matchExercise, menuToJson, parseMenuText } from "../src/lib/menus/text.ts";

test("parseMenuText: 説明文と ```json に囲まれた答えから読み取る", () => {
  const text = [
    "こちらが提案です。",
    "```json",
    '{ "name": "胸の日", "items": [',
    '  { "exercise": "チェストプレス", "sets": [{ "weight_kg": 40, "reps": 10 }, { "weight_kg": "42.5", "reps": "８" }] },',
    '  { "exercise": "ランニングマシン", "sets": [{ "duration_min": 20, "distance_km": 3 }] }',
    "] }",
    "```",
    "無理せず続けましょう！",
  ].join("\n");
  const r = parseMenuText(text);
  assert.ok(r.ok);
  assert.equal(r.menu.name, "胸の日");
  assert.deepEqual(r.menu.items[0].sets[1], { weight_kg: 42.5, reps: 8, duration_min: null, distance_km: null });
  assert.equal(r.menu.items[1].sets[0].duration_min, 20);
});

test("parseMenuText: 囲みがなくても、例のJSONより最後の答えを優先", () => {
  assert.ok(parseMenuText('{"name":"A","items":[{"exercise":"x","sets":[]}]}').ok);
  const twoBlocks = '```json\n{"name":"例","items":[{"exercise":"a","sets":[]}]}\n```\n本番:\n```json\n{"name":"本番","items":[{"exercise":"b","sets":[]}]}\n```';
  const r = parseMenuText(twoBlocks);
  assert.ok(r.ok && r.menu.name === "本番");
});

test("parseMenuText: 足りないもの・多すぎるものはエラー", () => {
  assert.equal(parseMenuText("JSONなし").ok, false);
  assert.equal(parseMenuText('{"items":[{"exercise":"x"}]}').ok, false);
  assert.equal(parseMenuText('{"name":"A","items":[]}').ok, false);
  assert.equal(parseMenuText('{"name":"A","items":[{"sets":[]}]}').ok, false);
  const many = JSON.stringify({ name: "A", items: Array.from({ length: 31 }, () => ({ exercise: "x", sets: [] })) });
  assert.equal(parseMenuText(many).ok, false);
});

test("menuToJson → parseMenuText で元に戻る", () => {
  const menu = { name: "背中", items: [{ name: "ラットプル", sets: [{ weight_kg: 30, reps: 12 }] }] };
  const r = parseMenuText(menuToJson(menu));
  assert.ok(r.ok);
  assert.equal(r.menu.items[0].exercise, "ラットプル");
  assert.equal(r.menu.items[0].sets[0].weight_kg, 30);
});

test("matchExercise: 表記ゆれを無視し、マスタを優先", () => {
  const list = [
    { name: "チェストプレス", custom: true },
    { name: "チェスト プレス", custom: false },
    { name: "ＬＡＴプル", custom: false },
  ];
  assert.equal(matchExercise("チェストプレス", list)?.custom, false);
  assert.equal(matchExercise("latプル", list)?.name, "ＬＡＴプル");
  assert.equal(matchExercise("スクワット", list), null);
});

test("guessType / buildMenuPrompt", () => {
  assert.equal(guessType([{ duration_min: 10 }]), "cardio");
  assert.equal(guessType([{ weight_kg: 10, reps: 5 }]), "weight");
  assert.equal(guessType([]), "weight");
  const p = buildMenuPrompt({
    exercises: [{ name: "ベンチプレス", type: "weight", excludesBar: true }, { name: "ランニングマシン", type: "cardio" }],
    current: { name: "胸", items: [{ name: "ベンチプレス", sets: [{ weight_kg: 40, reps: 10 }] }] },
    recent: [{ name: "ベンチプレス", sets: [{ weight_kg: 40, reps: 10 }] }],
  });
  assert.ok(p.includes("これまでの相談内容"));
  assert.ok(p.includes("- ベンチプレス（重量系・重さはバーを除いた値）"));
  assert.ok(p.includes("【今のメニュー】"));
  assert.ok(p.includes("- ベンチプレス: 40kg×10回"));
  assert.ok(parseMenuText(p).ok, "相談文の中の例もそのまま読める形");
});
