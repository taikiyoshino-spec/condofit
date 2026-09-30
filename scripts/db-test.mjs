// マイグレーションを PGlite 上で流し、RLS・トリガー・通知ルールを検証する。
// Supabase 固有の要素（ロール・auth スキーマ・既定GRANT・Realtime publication）は最小限スタブする。
import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";

const MIGRATIONS = join(import.meta.dirname, "..", "supabase", "migrations");

const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  create publication supabase_realtime;
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  -- pg_cron / pg_net / Vault の代わり（呼び出し内容を記録する）
  create schema cron;
  create table cron.jobs (name text primary key, schedule text, command text);
  create function cron.schedule(job_name text, schedule text, command text) returns bigint language sql as $$
    insert into cron.jobs values (job_name, schedule, command)
      on conflict (name) do update set schedule = excluded.schedule, command = excluded.command;
    select 1::bigint
  $$;
  create schema net;
  create table net.requests (url text, headers jsonb, body jsonb);
  create function net.http_post(url text, headers jsonb, body jsonb) returns bigint language sql as $$
    insert into net.requests values (url, headers, body); select 1::bigint
  $$;
  create schema vault;
  create table vault.decrypted_secrets (name text primary key, decrypted_secret text);
`;

const db = new PGlite();
await db.exec(SUPABASE_STUB);
for (const f of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
  // 拡張機能はスタブ済みのため create extension は読み飛ばす
  const sql = readFileSync(join(MIGRATIONS, f), "utf8").replace(/^create extension .*$/gm, "");
  await db.exec(sql);
}

const ids = {
  A: "00000000-0000-0000-0000-00000000000a",
  B: "00000000-0000-0000-0000-00000000000b",
  C: "00000000-0000-0000-0000-00000000000c",
  D: "00000000-0000-0000-0000-00000000000d", // グループ外
};

async function asSuper(sql, params) {
  await db.exec("reset role; select set_config('request.jwt.claim.sub', '', false);");
  return (await db.query(sql, params)).rows;
}
async function as(user, sql, params) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${ids[user]}', false); set role authenticated;`);
  try {
    return (await db.query(sql, params)).rows;
  } finally {
    await db.exec("reset role;");
  }
}
async function asService(sql, params) {
  await db.exec("reset role; select set_config('request.jwt.claim.sub', '', false); set role service_role;");
  try {
    return (await db.query(sql, params)).rows;
  } finally {
    await db.exec("reset role;");
  }
}
async function rejects(fn, pattern, label) {
  await assert.rejects(fn, pattern, label);
}
async function notifs(user) {
  return asSuper(
    "select type, actor_user_id, payload from notifications where recipient_user_id = $1 order by created_at, id",
    [ids[user]],
  );
}
async function clearNotifs() {
  await asSuper("delete from notifications");
}

let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (e) {
    console.error(`  NG  ${name}\n      ${e.message}`);
    process.exitCode = 1;
  }
}

// ---- セットアップ ----
const [{ id: groupId }] = await asSuper("insert into groups (name) values ('CondoFit') returning id");
for (const [k, name] of [["A", "Aさん"], ["B", "Bさん"], ["C", "Cさん"], ["D", "Dさん"]]) {
  await asSuper("insert into auth.users (id) values ($1)", [ids[k]]);
  await asSuper("insert into users (id, display_name) values ($1, $2)", [ids[k], name]);
  await asSuper("insert into user_secrets (user_id, pin_hash) values ($1, 'hash')", [ids[k]]);
}
for (const [k, role] of [["A", "admin"], ["B", "member"], ["C", "member"]]) {
  await asSuper("insert into group_members (group_id, user_id, role) values ($1, $2, $3)", [groupId, ids[k], role]);
}

console.log("DB tests");

await test("種目マスタ初期データが入っている", async () => {
  const [{ n }] = await asSuper("select count(*)::int n from exercises");
  assert.equal(n, 21);
  const parts = await asSuper("select name from body_parts order by display_order");
  assert.deepEqual(parts.map((p) => p.name), ["胸", "背中", "肩", "腕", "脚", "お腹", "有酸素", "フリーウェイト"]);
});

await test("グループ外は閲覧不可", async () => {
  assert.equal((await as("D", "select * from users")).length, 0);
  assert.equal((await as("D", "select * from exercises")).length, 0);
  assert.equal((await as("C", "select * from users")).length, 4);
});

await test("PINハッシュは利用者から読めない", async () => {
  await rejects(() => as("A", "select * from user_secrets"), /permission denied/);
  await rejects(() => as("A", "select * from login_attempts"), /permission denied/);
});

await test("表示名は本人のみ変更・一意", async () => {
  await as("B", "update users set display_name = 'Bくん' where id = $1", [ids.B]);
  const rows = await as("C", "update users set display_name = 'X' where id = $1 returning id", [ids.B]);
  assert.equal(rows.length, 0);
  await rejects(() => as("B", "update users set display_name = 'aさん' where id = $1", [ids.B]), /duplicate key/);
  await rejects(() => as("B", "update users set deactivated_at = now() where id = $1", [ids.B]), /permission denied/);
  await as("B", "update users set display_name = 'Bさん' where id = $1", [ids.B]);
});

let sid;
await test("予定作成: 作成者は自動で行く！・通知なし", async () => {
  [{ id: sid }] = await as("A", "insert into schedules (date, time_slot) values (jst_today(), 'evening') returning id");
  const ps = await as("B", "select user_id, intention from schedule_participants where schedule_id = $1", [sid]);
  assert.deepEqual(ps, [{ user_id: ids.A, intention: "going" }]);
  const [{ n }] = await asSuper("select count(*)::int n from notifications");
  assert.equal(n, 0);
});

await test("過去日には予定を作成できない", async () => {
  await rejects(
    () => as("A", "insert into schedules (date, time_slot) values (jst_today() - 1, 'night')"),
    /past_date/,
  );
});

await test("他人名義で予定を作成できない", async () => {
  await rejects(
    () => as("B", "insert into schedules (creator_user_id, date, time_slot) values ($1, jst_today(), 'night')", [ids.A]),
    /row-level security/,
  );
});

await test("参加: 作成者 + 既存参加者に通知（自分には通知しない）", async () => {
  await as("B", "insert into schedule_participants (schedule_id, intention) values ($1, 'going')", [sid]);
  assert.deepEqual((await notifs("A")).map((n) => n.type), ["schedule_join"]);
  assert.equal((await notifs("B")).length, 0);
  await clearNotifs();

  await as("C", "insert into schedule_participants (schedule_id, intention) values ($1, 'maybe')", [sid]);
  assert.deepEqual((await notifs("A")).map((n) => n.type), ["schedule_join"]);
  assert.deepEqual((await notifs("B")).map((n) => n.type), ["schedule_join"]);
  assert.equal((await notifs("C")).length, 0);
  await clearNotifs();
});

await test("行く！↔行けたら行く は通知なし", async () => {
  await as("C", "update schedule_participants set intention = 'going' where schedule_id = $1 and user_id = $2", [sid, ids.C]);
  const [{ n }] = await asSuper("select count(*)::int n from notifications");
  assert.equal(n, 0);
});

await test("他人の参加意思は変更できない", async () => {
  const rows = await as("B", "update schedule_participants set intention = 'maybe' where user_id = $1 returning 1", [ids.C]);
  assert.equal(rows.length, 0);
  await rejects(
    () => as("B", "insert into schedule_participants (schedule_id, user_id, intention) values ($1, $2, 'going')", [sid, ids.D]),
    /row-level security/,
  );
});

await test("キャンセル: 作成者 + 他参加者に通知", async () => {
  await as("B", "delete from schedule_participants where schedule_id = $1 and user_id = $2", [sid, ids.B]);
  assert.deepEqual((await notifs("A")).map((n) => n.type), ["schedule_cancel"]);
  assert.deepEqual((await notifs("C")).map((n) => n.type), ["schedule_cancel"]);
  assert.equal((await notifs("B")).length, 0);
  await clearNotifs();
});

await test("予定は作成者のみ編集。編集で参加意思は維持・参加者へ通知", async () => {
  const none = await as("C", "update schedules set time_slot = 'night' where id = $1 returning 1", [sid]);
  assert.equal(none.length, 0);

  await as("A", "update schedules set time_slot = 'night' where id = $1", [sid]);
  const ps = await asSuper("select user_id from schedule_participants where schedule_id = $1 order by user_id", [sid]);
  assert.deepEqual(ps.map((p) => p.user_id), [ids.A, ids.C]);
  const [n] = await notifs("C");
  assert.equal(n.type, "schedule_update");
  assert.equal(n.payload.old_time_slot, "evening");
  assert.equal(n.payload.new_time_slot, "night");
  assert.equal((await notifs("A")).length, 0);
  assert.equal((await notifs("B")).length, 0, "参加していないBには通知しない");
  await clearNotifs();

  await rejects(() => as("A", "update schedules set creator_user_id = $1 where id = $2", [ids.B, sid]), /permission denied/);
  await rejects(() => as("A", "update schedules set date = jst_today() - 1 where id = $1", [sid]), /past_date/);
});

await test("予定は論理削除のみ・参加者へ通知", async () => {
  await rejects(() => as("A", "delete from schedules where id = $1", [sid]), /permission denied/);
  const none = await as("C", "update schedules set deleted_at = now() where id = $1 returning 1", [sid]);
  assert.equal(none.length, 0);
  await as("A", "update schedules set deleted_at = now() where id = $1", [sid]);
  const [n] = await notifs("C");
  assert.equal(n.type, "schedule_delete");
  assert.equal(n.payload.time_slot, "night");
  await clearNotifs();
  await rejects(() => as("C", "delete from schedule_participants where schedule_id = $1", [sid]), /schedule_deleted/);
  await rejects(() => as("A", "update schedules set deleted_at = null where id = $1", [sid]), /schedule_deleted/);
});

await test("過去予定は編集・参加意思変更不可（閲覧は可）", async () => {
  await asSuper("alter table schedules disable trigger schedules_guard");
  await asSuper("alter table schedule_participants disable trigger schedule_participants_guard");
  const [{ id: past }] = await asSuper(
    "insert into schedules (creator_user_id, date, time_slot) values ($1, jst_today() - 3, 'morning') returning id",
    [ids.A],
  );
  await asSuper("alter table schedules enable trigger schedules_guard");
  await asSuper("alter table schedule_participants enable trigger schedule_participants_guard");
  await clearNotifs();
  assert.equal((await as("B", "select * from schedules where id = $1", [past])).length, 1);
  await rejects(
    () => as("B", "insert into schedule_participants (schedule_id, intention) values ($1, 'going')", [past]),
    /past_schedule/,
  );
  await rejects(() => as("A", "update schedules set time_slot = 'noon' where id = $1", [past]), /past_schedule/);
  await rejects(
    () => as("A", "update schedule_participants set intention = 'maybe' where schedule_id = $1", [past]),
    /past_schedule/,
  );
});

let checkInId;
await test("チェックインは利用者から直接作成不可（サーバーの50m判定経由のみ）", async () => {
  await rejects(() => as("B", "insert into check_ins (user_id) values ($1)", [ids.B]), /permission denied/);
  await rejects(() => as("B", "update check_ins set last_location_verified_at = now()"), /permission denied/);
});

await test("チェックイン: 他メンバーへ通知、自分には通知しない", async () => {
  [{ id: checkInId }] = await asService("insert into check_ins (user_id) values ($1) returning id", [ids.B]);
  assert.deepEqual((await notifs("A")).map((n) => n.type), ["check_in"]);
  assert.deepEqual((await notifs("C")).map((n) => n.type), ["check_in"]);
  assert.equal((await notifs("B")).length, 0);
  assert.equal((await notifs("D")).length, 0);
  await clearNotifs();
  await rejects(() => asService("insert into check_ins (user_id) values ($1)", [ids.B]), /duplicate key/);
});

await test("チェックインに位置情報の列が存在しない", async () => {
  const cols = await asSuper(
    "select column_name from information_schema.columns where table_schema = 'public' and (column_name ~* '(lat|lng|lon|distance_m|location)$')",
  );
  assert.deepEqual(cols, []);
});

await test("15分位置確認不能: 本人に1回だけ通知、Fit中は維持", async () => {
  assert.equal((await asService("select * from mark_stale_check_ins()")).length, 0);
  await asSuper("update check_ins set last_location_verified_at = now() - interval '16 minutes' where id = $1", [checkInId]);
  const stale = await asService("select * from mark_stale_check_ins()");
  assert.deepEqual(stale.map((s) => s.user_id), [ids.B]);
  assert.equal((await asService("select * from mark_stale_check_ins()")).length, 0, "2回目は通知しない");
  assert.deepEqual((await notifs("B")).map((n) => n.type), ["location_stale"]);
  assert.equal((await notifs("A")).length, 0);
  const [{ status }] = await asSuper("select status from check_ins where id = $1", [checkInId]);
  assert.equal(status, "active");
  await rejects(() => as("B", "select mark_stale_check_ins()"), /permission denied/);
  await clearNotifs();

  // 再確認後、再び15分経てば再通知
  await asSuper("update check_ins set last_location_verified_at = now() - interval '16 minutes' + interval '1 second', stale_notified_at = now() - interval '17 minutes' where id = $1", [checkInId]);
  assert.equal((await asService("select * from mark_stale_check_ins()")).length, 1);
  await clearNotifs();
});

await test("手動チェックアウト（本人のみ）", async () => {
  await as("A", "select check_out()");
  assert.equal((await asSuper("select status from check_ins where id = $1", [checkInId]))[0].status, "active");
  await as("B", "select check_out()");
  assert.equal((await asSuper("select status from check_ins where id = $1", [checkInId]))[0].status, "checked_out");
  await rejects(() => as("D", "select check_out()"), /forbidden/);
});

let sessionId;
const [{ id: benchId }] = await asSuper("select id from exercises where name = 'チェストプレス'");
const [{ id: runId }] = await asSuper("select id from exercises where name = 'ランニングマシン'");

await test("トレーニング記録: 複数種目・同一種目複数・種目0件", async () => {
  [{ save_training_session: sessionId }] = await as("B", "select save_training_session(null, now(), $1::jsonb)", [
    JSON.stringify([
      { exercise_id: benchId, entries: [{ weight_kg: 40, reps: 10 }, { weight_kg: 60, reps: 5 }, { weight_kg: 60, reps: 6 }] },
      { exercise_id: runId, entries: [{ duration_min: 20 }, { distance_km: 1.5 }] },
      { exercise_id: benchId, entries: [{}] },
    ]),
  ]);
  const [{ n }] = await asSuper("select count(*)::int n from exercise_entries");
  assert.equal(n, 6);
  const [{ save_training_session: empty }] = await as("C", "select save_training_session(null, now(), '[]')");
  assert.ok(empty);
});

await test("他人の記録は閲覧のみ", async () => {
  assert.equal((await as("C", "select * from training_sessions where id = $1", [sessionId])).length, 1);
  await rejects(() => as("C", "select save_training_session($1, now(), '[]')", [sessionId]), /forbidden/);
  assert.equal((await as("C", "delete from training_sessions where id = $1 returning 1", [sessionId])).length, 0);
  assert.equal((await as("C", "delete from exercise_entries returning 1")).length, 0);
  await rejects(
    () => as("C", "insert into session_exercises (session_id, exercise_id) values ($1, $2)", [sessionId, benchId]),
    /row-level security/,
  );
  await rejects(
    () => as("C", "insert into training_sessions (user_id, performed_at) values ($1, now())", [ids.B]),
    /row-level security/,
  );
});

await test("今月の自分: 訪問回数はセッション数（チェックインは数えない）", async () => {
  const [s] = await as("B", "select * from my_month_stats()");
  assert.deepEqual(s, { visits: 1, training_days: 1, exercise_kinds: 2 });
});

await test("種目代表値: 重量系は最大重量×その回数、有酸素は合計", async () => {
  const w = await as("A", "select * from exercise_month_summary($1)", [benchId]);
  assert.equal(w.length, 1);
  assert.equal(Number(w[0].weight_kg), 60);
  assert.equal(w[0].reps, 6);
  const c = await as("A", "select * from exercise_month_summary($1)", [runId]);
  assert.equal(Number(c[0].duration_min), 20);
  assert.equal(Number(c[0].distance_km), 1.5);
});

await test("最近の活動に詳細（重量・回数）を含めない", async () => {
  const rows = await as("A", "select * from recent_activity()");
  const visited = rows.filter((r) => r.kind === "visited");
  assert.equal(visited.length, 2);
  const b = visited.find((r) => r.actor_user_id === ids.B);
  assert.equal(b.detail.first_exercise_name, "チェストプレス");
  assert.equal(b.detail.exercise_count, 2);
  assert.ok(!JSON.stringify(rows).includes("weight"));
});

await test("種目マスタ: 変更は管理者のみ・物理削除不可", async () => {
  const [{ id: chest }] = await asSuper("select id from body_parts where name = '胸'");
  await rejects(
    () => as("B", "insert into exercises (name, body_part_id, type) values ('ベンチプレス', $1, 'weight')", [chest]),
    /row-level security/,
  );
  await as("A", "insert into exercises (name, body_part_id, type) values ('ベンチプレス', $1, 'weight')", [chest]);
  assert.equal((await as("B", "update exercises set active = false where id = $1 returning 1", [benchId])).length, 0);
  await as("A", "update exercises set active = false, name = 'チェストプレス2' where id = $1", [benchId]);
  await rejects(() => as("A", "delete from exercises where id = $1", [benchId]), /permission denied/);
  await rejects(() => as("A", "delete from body_parts"), /permission denied/);
});

await test("最後の管理者は降格・利用停止できない", async () => {
  await rejects(() => as("A", "update group_members set role = 'member' where user_id = $1", [ids.A]), /last_admin/);
  await rejects(() => asService("update users set deactivated_at = now() where id = $1", [ids.A]), /last_admin/);
  assert.equal((await as("B", "update group_members set role = 'admin' where user_id = $1 returning 1", [ids.B])).length, 0);
  await as("A", "update group_members set role = 'admin' where user_id = $1", [ids.B]);
  await as("A", "update group_members set role = 'member' where user_id = $1", [ids.A]);
  await as("B", "update group_members set role = 'admin' where user_id = $1", [ids.A]);
});

await test("利用停止メンバーは閲覧不可・過去記録は残る", async () => {
  await asService("update group_members set removed_at = now() where user_id = $1", [ids.C]);
  await asService("update users set deactivated_at = now() where id = $1", [ids.C]);
  assert.equal((await as("C", "select * from training_sessions")).length, 0);
  assert.equal((await as("A", "select * from training_sessions where user_id = $1", [ids.C])).length, 1);
  await asService("update users set deactivated_at = null where id = $1", [ids.C]);
  await asService("update group_members set removed_at = null where user_id = $1", [ids.C]);
});

await test("通知設定OFFなら通知しない", async () => {
  await clearNotifs();
  await as("A", "update notification_settings set check_in = false where user_id = $1", [ids.A]);
  const [{ id }] = await asService("insert into check_ins (user_id) values ($1) returning id", [ids.C]);
  assert.equal((await notifs("A")).length, 0);
  assert.equal((await notifs("B")).length, 1);
  await asService("update check_ins set status = 'checked_out', checked_out_at = now() where id = $1", [id]);
  await as("A", "update notification_settings set check_in = true where user_id = $1", [ids.A]);
});

await test("通知: 本人のみ閲覧・すべて既読・既読でも残る・期限切れは見えず削除", async () => {
  assert.equal((await as("A", "select * from notifications where recipient_user_id = $1", [ids.B])).length, 0);
  await rejects(() => as("B", "insert into notifications (recipient_user_id, type) values ($1, 'check_in')", [ids.A]), /permission denied/);
  await as("B", "select mark_all_notifications_read()");
  const rows = await as("B", "select read_at from notifications");
  assert.equal(rows.length, 1);
  assert.ok(rows[0].read_at);
  await asSuper("update notifications set expires_at = now() - interval '1 second'");
  assert.equal((await as("B", "select * from notifications")).length, 0);
  const [{ purge_expired_notifications: purged }] = await asService("select purge_expired_notifications()");
  assert.equal(purged, 1);
});

await test("定期処理: 毎分ジョブ登録、Vault未設定なら何もしない、設定後はシークレット付きで呼ぶ", async () => {
  const [job] = await asSuper("select * from cron.jobs");
  assert.equal(job.schedule, "* * * * *");
  await asSuper("select invoke_cron_tick()");
  assert.equal((await asSuper("select * from net.requests")).length, 0);
  await asSuper(
    "insert into vault.decrypted_secrets values ('condofit_app_origin', 'https://fit.example/'), ('condofit_cron_secret', 's3cret')",
  );
  await asSuper("select invoke_cron_tick()");
  const [req] = await asSuper("select * from net.requests");
  assert.equal(req.url, "https://fit.example/api/cron/tick");
  assert.equal(req.headers.Authorization, "Bearer s3cret");
  await rejects(() => as("A", "select invoke_cron_tick()"), /permission denied/);
});

console.log(`\n${passed} passed${process.exitCode ? ", some FAILED" : ""}`);
