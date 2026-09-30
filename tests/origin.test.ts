import { test } from "node:test";
import assert from "node:assert/strict";
import { envStatus, resolveAppOrigin } from "../src/lib/origin.ts";

test("APP_ORIGIN が空文字なら無視して次の候補を使う", () => {
  assert.equal(
    resolveAppOrigin({ appOrigin: "", vercelProductionUrl: "condofit-one.vercel.app", host: "x.vercel.app" }),
    "https://condofit-one.vercel.app",
  );
  assert.equal(resolveAppOrigin({ appOrigin: "  ", host: "condofit-one.vercel.app" }), "https://condofit-one.vercel.app");
});

test("APP_ORIGIN が設定されていれば最優先（末尾スラッシュ除去・スキームなしは https）", () => {
  assert.equal(resolveAppOrigin({ appOrigin: "https://fit.example/", host: "x" }), "https://fit.example");
  assert.equal(resolveAppOrigin({ appOrigin: "fit.example" }), "https://fit.example");
});

test("本番ドメインがなければリクエストのホスト（ローカルは http）", () => {
  assert.equal(resolveAppOrigin({ host: "localhost:3000" }), "http://localhost:3000");
  assert.equal(resolveAppOrigin({ host: "a.example", proto: "https" }), "https://a.example");
  assert.equal(resolveAppOrigin({ host: null }), null);
});

test("環境変数の状態", () => {
  assert.equal(envStatus(undefined), "missing");
  assert.equal(envStatus(""), "empty");
  assert.equal(envStatus("abc", (v) => !Number.isNaN(Number(v))), "invalid");
  assert.equal(envStatus("35.5", (v) => !Number.isNaN(Number(v))), "ok");
});
