import { test } from "node:test";
import assert from "node:assert/strict";
import { adjustCount, blocksToExercises, entryToRow, menuToBlocks, planProgress, type Block } from "../src/lib/records/plan.ts";

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
