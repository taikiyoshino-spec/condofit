import { test } from "node:test";
import assert from "node:assert/strict";
import {
  authEmail,
  deriveAuthPassword,
  displayNameKey,
  generateInviteToken,
  hashInviteToken,
  hashPin,
  isValidPin,
  normalizeDisplayName,
  validateDisplayName,
  verifyPin,
} from "../src/lib/auth/pin.ts";

test("PINは4桁の数字のみ", () => {
  assert.ok(isValidPin("0123"));
  for (const bad of ["123", "12345", "12a4", "１２３４", " 1234", ""]) assert.ok(!isValidPin(bad), bad);
});

test("PINハッシュは平文を含まず、ソルトで毎回異なり、照合できる", () => {
  const a = hashPin("1234");
  const b = hashPin("1234");
  assert.notEqual(a, b);
  assert.ok(!a.includes("1234"));
  assert.ok(verifyPin("1234", a));
  assert.ok(!verifyPin("1235", a));
  assert.ok(!verifyPin("1234", "plain$1234"));
});

test("Authパスワードはペッパーとユーザーごとに変わり、6文字以上", () => {
  const p = deriveAuthPassword("u1", "1234", "pepper");
  assert.ok(p.length >= 6);
  assert.equal(p, deriveAuthPassword("u1", "1234", "pepper"));
  assert.notEqual(p, deriveAuthPassword("u2", "1234", "pepper"));
  assert.notEqual(p, deriveAuthPassword("u1", "1234", "other"));
  assert.throws(() => deriveAuthPassword("u1", "1234", ""));
});

test("表示名の正規化・キー・長さ", () => {
  assert.equal(normalizeDisplayName("  たろう "), "たろう");
  assert.equal(displayNameKey(" Taro "), "taro");
  assert.equal(validateDisplayName(""), "表示名を入力してください");
  assert.equal(validateDisplayName("あ".repeat(20)), null);
  assert.ok(validateDisplayName("あ".repeat(21)));
});

test("招待トークンは推測困難で、保存するのはハッシュ", () => {
  const t = generateInviteToken();
  assert.ok(t.length >= 32);
  assert.notEqual(t, generateInviteToken());
  assert.match(hashInviteToken(t), /^[0-9a-f]{64}$/);
  assert.ok(!hashInviteToken(t).includes(t));
});

test("内部メールは実在しないドメイン", () => {
  assert.match(authEmail("abc"), /^abc@.+\.invalid$/);
});
