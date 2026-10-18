import { test } from "node:test";
import assert from "node:assert/strict";
import { adjustCount, blocksToExercises, entryToRow, menuToBlocks, menuWeightIncreases, planProgress, type Block } from "../src/lib/records/plan.ts";

const block = (exerciseId: string, rows: Block["rows"]): Block => ({ key: 1, exerciseId, name: exerciseId, type: "weight", rows });

test("保存するのは「できた」行だけ。できた行のない種目は記録しない", () => {
  const blocks = [
    block("a", [
      entryToRow({ weight_kg: 50, reps: 10 }, "done", true),
      entryToRow({ weight_kg: 55, reps: 8 }, "planned", true),
      entryToRow({ weight_kg: 60, reps: 5 }, "skipped", true),
    ]),
    block("b", [entryToRow({ weight_kg: 20, reps: 10 }, "planned", true)]),
    block("c", [entryToRow({})]), // 手で追加した数値なしの行は「やった」として残す
  ];
  assert.deepEqual(blocksToExercises(blocks), [
    { exerciseId: "a", entries: [{ weight_kg: 50, reps: 10, duration_min: null, distance_km: null }] },
    { exerciseId: "c", entries: [{ weight_kg: null, reps: null, duration_min: null, distance_km: null }] },
  ]);
});

test("進み具合はメニュー由来のセットだけ数え、やらなかった分も済みにする", () => {
  const blocks = [
    block("a", [entryToRow({}, "done", true), entryToRow({}, "skipped", true), entryToRow({}, "planned", true)]),
    block("c", [entryToRow({})]),
  ];
  assert.deepEqual(planProgress(blocks), { finished: 2, total: 3 });
});

test("回数の増減は0〜999", () => {
  assert.equal(adjustCount("10", -1), "9");
  assert.equal(adjustCount("0", -1), "0");
  assert.equal(adjustCount("", 1), "1");
  assert.equal(adjustCount("999", 1), "999");
});

test("メニュー → 全セット予定の入力ブロック（セットなしの種目は空の予定1行）", () => {
  let k = 0;
  const blocks = menuToBlocks(
    [
      { exerciseId: "a", name: "A", type: "weight", sets: [{ weight_kg: 40, reps: 10 }, { weight_kg: 45, reps: 8 }] },
      { exerciseId: "b", name: "B", type: "cardio", sets: [] },
    ],
    () => ++k,
  );
  assert.equal(blocks.length, 2);
  assert.deepEqual(blocks[0].rows.map((r) => [r.weight, r.reps, r.status, r.fromPlan]), [["40", "10", "planned", true], ["45", "8", "planned", true]]);
  assert.equal(blocks[1].rows.length, 1);
  assert.equal(blocks[1].rows[0].status, "planned");
});

test("メニューより重い重量でできたセットだけを、メニューの位置付きで返す", () => {
  let k = 0;
  const blocks = menuToBlocks(
    [
      { exerciseId: "a", name: "A", type: "weight", sets: [{ weight_kg: 40, reps: 10 }, { weight_kg: 45, reps: 8 }, { reps: 10 }] },
      { exerciseId: "b", name: "B", type: "cardio", sets: [{ duration_min: 20 }] },
    ],
    () => ++k,
  );
  assert.deepEqual(blocks[0].rows.map((r) => r.planRef), [{ item: 0, set: 0 }, { item: 0, set: 1 }, { item: 0, set: 2 }]);
  const done = (b: Block, j: number, weight: string) => (b.rows[j] = { ...b.rows[j], weight, status: "done" });
  done(blocks[0], 0, "42.5"); // 増えた
  done(blocks[0], 1, "45"); // 同じ
  done(blocks[0], 2, "20"); // 予定に重量なし → 対象外
  blocks[1].rows[0] = { ...blocks[1].rows[0], status: "done" };
  // まだ予定のまま・やらなかった・手入力の行は対象外
  blocks[0].rows.push({ ...entryToRow({ weight_kg: 100, reps: 1 }), fromPlan: false });
  assert.deepEqual(menuWeightIncreases(blocks), [{ item: 0, set: 0, exerciseId: "a", name: "A", from: 40, to: 42.5 }]);
  blocks[0].rows[0] = { ...blocks[0].rows[0], status: "skipped" };
  assert.deepEqual(menuWeightIncreases(blocks), []);
});
