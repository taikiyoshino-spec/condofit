import { test } from "node:test";
import assert from "node:assert/strict";
import { isCookPath, safeNextPath } from "../src/lib/auth/next-path.ts";

test("safeNextPath: 自サイト内のパスだけ許可", () => {
  assert.equal(safeNextPath("/cook"), "/cook");
  assert.equal(safeNextPath("/cook/r/abc?x=1"), "/cook/r/abc?x=1");
  assert.equal(safeNextPath("/records"), "/records");
  for (const bad of ["", "cook", "https://evil.example", "//evil.example", "/\\evil.example", "/login", "/login?next=/cook", "/a\nb", null, undefined, 1]) {
    assert.equal(safeNextPath(bad), null, String(bad));
  }
});

test("isCookPath", () => {
  assert.ok(isCookPath("/cook"));
  assert.ok(isCookPath("/cook/r/1"));
  assert.ok(!isCookPath("/cookies"));
  assert.ok(!isCookPath("/"));
});
