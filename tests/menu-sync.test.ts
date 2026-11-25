import { test } from "node:test";
import assert from "node:assert/strict";
import { applyValueChanges, valueChanges } from "../src/lib/menus/sync.ts";

import type { Entry } from "../src/lib/records/format.ts";

const w = (weight_kg: number | null, reps: number | null = 10): Partial<Entry> => ({ weight_kg, reps });
const c = (duration_min: number, load: number | null): Partial<Entry> => ({ duration_min, load });

test("valueChanges: 重さ・負荷を変えたところだけ。回数・時間の変更や、空欄からの入力は出さない", () => {
  const before = [
    { exerciseId: "chest", sets: [w(40), w(40), w(50)] },
    { exerciseId: "bike", sets: [c(20, 8)] },
  ];
  const after = [
    { exerciseId: "chest", sets: [w(45, 8), w(45), w(50, 12)] },
    { exerciseId: "bike", sets: [c(30, 10)] },
  ];
  assert.deepEqual(valueChanges(before, after), [
    { exerciseId: "chest", field: "weight_kg", from: 40, to: 45 },
    { exerciseId: "bike", field: "load", from: 8, to: 10 },
  ]);
  assert.deepEqual(valueChanges([{ exerciseId: "a", sets: [w(null)] }], [{ exerciseId: "a", sets: [w(30)] }]), []);
  assert.deepEqual(valueChanges([{ exerciseId: "a", sets: [w(30)] }], [{ exerciseId: "a", sets: [w(30, 5)] }]), []);
});

test("valueChanges: 並べ替えても同じ種目どうしで比べ、同じ値を別々の値に変えたときは出さない", () => {
  const before = [
    { exerciseId: "a", sets: [w(20)] },
    { exerciseId: "b", sets: [w(40), w(40)] },
  ];
  const after = [
    { exerciseId: "b", sets: [w(45), w(50)] },
    { exerciseId: "a", sets: [w(25)] },
  ];
  assert.deepEqual(valueChanges(before, after), [{ exerciseId: "a", field: "weight_kg", from: 20, to: 25 }]);
  assert.deepEqual(valueChanges([], [{ exerciseId: "a", sets: [w(25)] }]), [], "新しく足した種目は比べない");
});

test("applyValueChanges: 同じ種目で変える前と同じ値のセットだけ変え、変えたセットの数を返す", () => {
  const items = [
    { exerciseId: "chest", name: "チェストプレス", sets: [w(40), w(40), w(50)] },
    { exerciseId: "leg", name: "レッグプレス", sets: [w(40)] },
    { exerciseId: "bike", name: "バイク", sets: [c(20, 8), c(10, 5)] },
  ];
  const changes = [
    { exerciseId: "chest", field: "weight_kg" as const, from: 40, to: 45 },
    { exerciseId: "chest", field: "weight_kg" as const, from: 45, to: 50 },
    { exerciseId: "bike", field: "load" as const, from: 8, to: 10 },
  ];
  const r = applyValueChanges(items, changes);
  assert.deepEqual(r.items[0].sets.map((s) => s.weight_kg), [45, 45, 50], "続けて変えない（40→45→50 にしない）");
  assert.equal(r.items[0].name, "チェストプレス");
  assert.deepEqual(r.items[1].sets, [w(40)], "ほかの種目には触らない");
  assert.deepEqual(r.items[2].sets.map((s) => s.load), [10, 5]);
  assert.deepEqual(r.applied, [
    { exerciseId: "chest", field: "weight_kg", from: 40, to: 45, count: 2 },
    { exerciseId: "bike", field: "load", from: 8, to: 10, count: 1 },
  ]);
  assert.deepEqual(applyValueChanges([{ exerciseId: "x", sets: [w(40)] }], changes).applied, []);
});
