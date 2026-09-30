import { test } from "node:test";
import assert from "node:assert/strict";
import { avatarUrl, colorFor, detectImageType, initialOf } from "../src/lib/avatar.ts";

test("頭文字", () => {
  assert.equal(initialOf("泰基"), "泰");
  assert.equal(initialOf(" taiki"), "T");
  assert.equal(initialOf("👨‍👩‍👧さん"), "👨‍👩‍👧");
  assert.equal(initialOf(""), "?");
});

test("色はユーザーごとに固定", () => {
  assert.equal(colorFor("abc"), colorFor("abc"));
  assert.match(colorFor("xyz"), /^#[0-9a-f]{6}$/);
});

test("画像形式は先頭バイトで判定", () => {
  assert.equal(detectImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), "image/jpeg");
  assert.equal(detectImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), "image/png");
  const webp = new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ");
  assert.equal(detectImageType(webp), "image/webp");
  assert.equal(detectImageType(new TextEncoder().encode("<svg xmlns=")), null);
  assert.equal(detectImageType(new Uint8Array([])), null);
});

test("配信URLは保存先ごとに変わる", () => {
  assert.equal(avatarUrl("u1", null), null);
  assert.equal(avatarUrl("u1", "u1/abc123.jpg"), "/api/avatar/u1?v=abc123");
  assert.notEqual(avatarUrl("u1", "u1/abc123.jpg"), avatarUrl("u1", "u1/def456.jpg"));
});
