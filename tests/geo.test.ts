import { test } from "node:test";
import assert from "node:assert/strict";
import { distanceMeters, isValidLatLng, isWithinGym, parseGymLocation } from "../src/lib/geo.ts";

// 座標は判定ロジック確認用の任意の値（店舗の実座標ではない）
const gym = { lat: 35.5, lng: 139.6 };
const northBy = (m: number) => ({ lat: gym.lat + m / 111195, lng: gym.lng });

test("距離計算（緯度方向）", () => {
  assert.ok(Math.abs(distanceMeters(gym, northBy(100)) - 100) < 0.5);
  assert.equal(distanceMeters(gym, gym), 0);
});

test("50m以内ならOK、50m超は不可", () => {
  assert.ok(isWithinGym(gym, gym));
  assert.ok(isWithinGym(northBy(49), gym));
  assert.ok(!isWithinGym(northBy(51), gym));
});

test("不正な座標を弾く", () => {
  assert.ok(isValidLatLng({ lat: 35, lng: 139 }));
  for (const bad of [null, {}, { lat: "35", lng: 139 }, { lat: NaN, lng: 1 }, { lat: 91, lng: 0 }, { lat: 0, lng: 181 }]) {
    assert.ok(!isValidLatLng(bad), JSON.stringify(bad));
  }
});

test("店舗座標が未設定・不正ならnull（チェックイン不可）", () => {
  assert.equal(parseGymLocation(undefined, undefined), null);
  assert.equal(parseGymLocation("", "139"), null);
  assert.equal(parseGymLocation("abc", "139"), null);
  assert.deepEqual(parseGymLocation("35.5", "139.6"), gym);
});
