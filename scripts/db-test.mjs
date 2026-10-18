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
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
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
async function asAnon(sql, params) {
  await db.exec("reset role; select set_config('request.jwt.claim.sub', '', false); set role anon;");
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

await test("プロフィール画像: 非公開バケット、保存先は利用者から直接変更できない", async () => {
  const [bucket] = await asSuper("select public, file_size_limit from storage.buckets where id = 'avatars'");
  assert.equal(bucket.public, false);
  await rejects(() => as("A", "update users set avatar_path = 'x' where id = $1", [ids.A]), /permission denied/);
  const rows = await as("B", "select avatar_path from users where id = $1", [ids.A]);
  assert.equal(rows.length, 1, "メンバーは他メンバーの画像の有無を参照できる");
});

await test("総合ランキング: 今月の訪問回数と種目数、記録0件も含む、グループ外は取得不可", async () => {
  const rows = await as("A", "select * from monthly_ranking(jst_today())");
  const byName = Object.fromEntries(rows.map((r) => [r.display_name, r]));
  assert.equal(byName["Bさん"].visits, 1);
  assert.equal(byName["Bさん"].exercise_kinds, 2);
  assert.equal(byName["Cさん"].visits, 1);
  assert.equal(byName["Cさん"].exercise_kinds, 0);
  assert.equal(byName["Aさん"].visits, 0, "記録0件も0として含む");
  assert.equal(byName["Dさん"], undefined, "グループ外のユーザーは含まない");
  const last = await as("A", "select * from monthly_ranking((jst_today() - interval '1 month')::date)");
  assert.ok(last.every((r) => r.visits === 0), "先月は記録なし");
  assert.equal((await as("D", "select * from monthly_ranking(jst_today())")).length, 0);
  await rejects(() => asAnon("select * from monthly_ranking(jst_today())"), /permission denied/);
});

await test("実績コメント: 今日以前のみ、本人以外に通知", async () => {
  await clearNotifs();
  // B・C は今日トレーニング記録がある
  const [{ id: c1 }] = await as("A", "insert into day_comments (date, body) values (jst_today(), '  今日は混んでた  ') returning id, body");
  const [{ body }] = await asSuper("select body from day_comments where id = $1", [c1]);
  assert.equal(body, "今日は混んでた", "前後の空白は取り除く");
  assert.deepEqual((await notifs("B")).map((n) => n.type), ["day_comment"]);
  assert.deepEqual((await notifs("C")).map((n) => n.type), ["day_comment"]);
  assert.equal((await notifs("A")).length, 0);
  assert.equal((await notifs("B"))[0].payload.excerpt, "今日は混んでた");
  await clearNotifs();

  await as("B", "insert into day_comments (date, body) values (jst_today(), 'おつかれ')");
  assert.deepEqual((await notifs("A")).map((n) => n.type), ["day_comment"], "先にコメントした人にも通知");
  assert.equal((await notifs("B")).length, 0);
  await clearNotifs();

  await rejects(() => as("A", "insert into day_comments (date, body) values (jst_today() + 1, 'x')"), /future_date/);
  await rejects(() => as("A", "insert into day_comments (date, body) values (jst_today(), '   ')"), /day_comments_body_len/);
  await rejects(() => as("A", "insert into day_comments (date, user_id, body) values (jst_today(), $1, 'なりすまし')", [ids.B]), /row-level security/);
  await rejects(() => as("D", "insert into day_comments (date, body) values (jst_today(), 'x')"), /row-level security/);
  assert.equal((await as("D", "select * from day_comments")).length, 0);
  assert.equal((await as("C", "select * from day_comments")).length, 2);
});

await test("実績コメント: 通知は全員（本人以外・グループ外は除く）、コメント通知をオフにした人には届かない", async () => {
  await clearNotifs();
  // 昨日は誰もトレーニング記録がない日。それでも全員に届く
  await as("A", "insert into day_comments (date, body) values (jst_today() - 1, '昨日のこと')");
  assert.deepEqual((await notifs("B")).map((n) => n.type), ["day_comment"]);
  assert.deepEqual((await notifs("C")).map((n) => n.type), ["day_comment"]);
  assert.equal((await notifs("A")).length, 0);
  assert.equal((await notifs("D")).length, 0, "グループ外には届かない");
  await clearNotifs();

  await as("C", "update notification_settings set comment = false where user_id = $1", [ids.C]);
  await as("B", "insert into day_comments (date, body) values (jst_today() - 1, 'オフ確認')");
  assert.equal((await notifs("C")).length, 0, "コメント通知オフ");
  assert.deepEqual((await notifs("A")).map((n) => n.type), ["day_comment"]);
  await as("C", "update notification_settings set comment = true where user_id = $1", [ids.C]);
  // 予定の通知設定とは独立している
  const [{ schedule, comment }] = await asSuper("select schedule, comment from notification_settings where user_id = $1", [ids.C]);
  assert.equal(schedule, true);
  assert.equal(comment, true);
  await asSuper("delete from day_comments where date = jst_today() - 1");
  await clearNotifs();
});

await test("実績コメント: 削除は本人と管理者だけ", async () => {
  const [{ id: aComment }] = await asSuper("select id from day_comments where user_id = $1", [ids.A]);
  const [{ id: bComment }] = await asSuper("select id from day_comments where user_id = $1", [ids.B]);
  // この時点で A・B は管理者、C は一般メンバー
  const [{ id: cComment }] = await as("C", "insert into day_comments (date, body) values (jst_today(), 'Cのコメント') returning id");
  assert.equal((await as("C", "delete from day_comments where id = $1 returning id", [aComment])).length, 0, "一般メンバーは他人のコメントを削除できない");
  assert.equal((await as("C", "delete from day_comments where id = $1 returning id", [cComment])).length, 1, "本人は削除できる");
  assert.equal((await as("A", "delete from day_comments where id = $1 returning id", [bComment])).length, 1, "管理者は他人のコメントも削除できる");
  assert.equal((await as("A", "delete from day_comments where id = $1 returning id", [aComment])).length, 1);
  await rejects(() => as("A", "update day_comments set body = 'x'"), /permission denied/);
});

await test("トレーニングメニュー: 自分専用で保存・更新・削除、他人は見えず変更もできない", async () => {
  const [{ id: chest }] = await asSuper("select id from exercises where name = 'ペックフライ'");
  const [{ id: run }] = await asSuper("select id from exercises where name = 'ランニングマシン'");
  const items = JSON.stringify([
    { exercise_id: chest, sets: [{ weight_kg: 40, reps: 10 }, { weight_kg: 45, reps: 8 }] },
    { exercise_id: run, sets: [{ duration_min: 20 }] },
  ]);
  const [{ save_workout_menu: menuId }] = await as("B", "select save_workout_menu(null, ' 胸の日 ', $1::jsonb)", [items]);
  const [menu] = await as("B", "select name from workout_menus where id = $1", [menuId]);
  assert.equal(menu.name, "胸の日");
  const rows = await as("B", "select exercise_id, display_order, sets from workout_menu_items where menu_id = $1 order by display_order", [menuId]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].sets.length, 2);
  assert.equal(rows[0].sets[1].weight_kg, 45);

  // 更新は中身を入れ替える
  await as("B", "select save_workout_menu($1, '胸の日2', $2::jsonb)", [menuId, JSON.stringify([{ exercise_id: run, sets: [] }])]);
  assert.equal((await as("B", "select * from workout_menu_items where menu_id = $1", [menuId])).length, 1);

  // 他人（管理者含む）は見えない・変更できない
  assert.equal((await as("A", "select * from workout_menus where id = $1", [menuId])).length, 0);
  assert.equal((await as("A", "select * from workout_menu_items where menu_id = $1", [menuId])).length, 0);
  await rejects(() => as("A", "select save_workout_menu($1, '乗っ取り', '[]'::jsonb)", [menuId]), /forbidden/);
  assert.equal((await as("A", "delete from workout_menus where id = $1 returning id", [menuId])).length, 0);
  await rejects(
    () => as("A", "insert into workout_menu_items (menu_id, exercise_id) values ($1, $2)", [menuId, run]),
    /row-level security/,
  );
  await rejects(() => as("B", "select save_workout_menu(null, '   ', '[]'::jsonb)"), /workout_menus_name_len/);
  await rejects(() => as("D", "select save_workout_menu(null, 'x', '[]'::jsonb)"), /row-level security/);

  // 削除すると項目も消える
  assert.equal((await as("B", "delete from workout_menus where id = $1 returning id", [menuId])).length, 1);
  assert.equal((await asSuper("select * from workout_menu_items where menu_id = $1", [menuId])).length, 0);
});

await test("自分専用の種目: 本人だけ見える・ランキングと最近の活動に出さない・マスタは作れない", async () => {
  const [{ id: mine }] = await as("C", "insert into exercises (name, type, owner_user_id) values ('ケトルベルスイング', 'weight', $1) returning id", [ids.C]);
  assert.equal((await as("C", "select * from exercises where id = $1", [mine])).length, 1);
  assert.equal((await as("B", "select * from exercises where id = $1", [mine])).length, 0, "他の人には見えない");
  assert.equal((await as("A", "select * from exercises where id = $1", [mine])).length, 0, "管理者にも見えない");

  // なりすまし・部位付き・マスタの作成は不可
  await rejects(() => as("C", "insert into exercises (name, type, owner_user_id) values ('x', 'weight', $1)", [ids.B]), /row-level security/);
  const [{ id: part }] = await asSuper("select id from body_parts limit 1");
  await rejects(() => as("C", "insert into exercises (name, type, owner_user_id, body_part_id) values ('y', 'weight', $1, $2)", [ids.C, part]), /row-level security/);
  await rejects(() => as("C", "insert into exercises (name, type, body_part_id) values ('z', 'weight', $1)", [part]), /row-level security/);
  await rejects(() => as("C", "insert into exercises (name, type) values ('部位なしマスタ', 'weight')"), /row-level security|exercises_part_or_owner/);
  // 同じ人が同じ名前を二重に作れない（別の人なら作れる）
  await rejects(() => as("C", "insert into exercises (name, type, owner_user_id) values ('ケトルベルスイング', 'weight', $1)", [ids.C]), /duplicate key/);
  await as("B", "insert into exercises (name, type, owner_user_id) values ('ケトルベルスイング', 'cardio', $1)", [ids.B]);
  // 管理者も他人の種目は変更できない
  assert.equal((await as("A", "update exercises set name = 'x' where id = $1 returning id", [mine])).length, 0);

  // C が今月その種目だけで記録 → ランキングの種目数・最近の活動の種目名に出ない
  const before = Object.fromEntries((await as("A", "select * from monthly_ranking(jst_today())")).map((r) => [r.display_name, r]));
  await as("C", "select save_training_session(null, now(), $1::jsonb)", [JSON.stringify([{ exercise_id: mine, entries: [{ weight_kg: 16, reps: 15 }] }])]);
  const after = Object.fromEntries((await as("A", "select * from monthly_ranking(jst_today())")).map((r) => [r.display_name, r]));
  // C はこの日すでに記録があり3時間以内なので、Fit訪問回数は同じ来店として数える（回数は減らない）
  assert.ok(after["Cさん"].visits >= before["Cさん"].visits, "Fit訪問回数は減らない");
  assert.equal(after["Cさん"].exercise_kinds, before["Cさん"].exercise_kinds, "種目の数には入らない");
  const activity = await as("A", "select * from recent_activity()");
  assert.ok(!JSON.stringify(activity).includes("ケトルベル"), "最近の活動に名前が出ない");
  // 本人の記録としては普通に見える
  const own = await as("C", "select ex.name from session_exercises se join exercises ex on ex.id = se.exercise_id where se.exercise_id = $1", [mine]);
  assert.equal(own[0].name, "ケトルベルスイング");
});

await test("バー抜きの種目: 自分の種目は本人だけ切り替えられる・マスタは管理者だけ", async () => {
  const [{ id: mine }] = await as("C", "insert into exercises (name, type, owner_user_id) values ('ベンチプレス（自分）', 'weight', $1) returning id", [ids.C]);
  assert.equal((await as("C", "select excludes_bar from exercises where id = $1", [mine]))[0].excludes_bar, false, "初期値はバー込み");
  assert.equal((await as("C", "select set_my_exercise_excludes_bar($1, true) as ok", [mine]))[0].ok, true);
  assert.equal((await as("C", "select excludes_bar from exercises where id = $1", [mine]))[0].excludes_bar, true);
  // 他人の種目・マスタは関数では変えられない
  assert.equal((await as("B", "select set_my_exercise_excludes_bar($1, false) as ok", [mine]))[0].ok, false);
  assert.equal((await asSuper("select excludes_bar from exercises where id = $1", [mine]))[0].excludes_bar, true);
  const [{ id: master }] = await asSuper("select id from exercises where owner_user_id is null and type = 'weight' limit 1");
  assert.equal((await as("C", "select set_my_exercise_excludes_bar($1, true) as ok", [master]))[0].ok, false);
  assert.equal((await as("C", "update exercises set excludes_bar = true where id = $1 returning id", [master])).length, 0, "メンバーはマスタを変更できない");
  assert.equal((await as("A", "update exercises set excludes_bar = true where id = $1 returning id", [master])).length, 1, "管理者はマスタを変更できる");
  await asSuper("update exercises set excludes_bar = false where id = $1", [master]);
});

await test("Fit訪問回数: 同じ日で3時間以内の記録は1回、3時間以上あけば別の来店", async () => {
  const visits = async (who) =>
    (await as("A", "select display_name, visits from monthly_ranking(jst_today())")).find((r) => r.display_name === who).visits;
  const myVisits = async () => (await as("A", "select visits from my_month_stats()"))[0].visits;
  const before = await visits("Aさん");
  const beforeMine = await myVisits();
  // 今日の JST 6:00 と 6:00（同時刻の重複）、7:30（1.5時間後）→ 1回
  for (const t of ["06:00", "06:00", "07:30"]) {
    await as("A", `select save_training_session(null, (jst_today()::text || ' ${t}:00+09')::timestamptz, '[]')`);
  }
  assert.equal(await visits("Aさん"), before + 1, "重複・3時間以内は1回");
  assert.equal(await myVisits(), beforeMine + 1, "ホームの今月の活動も同じ数え方");
  // 同じ日の 11:00（前の記録から3.5時間後）→ 別の来店
  await as("A", "select save_training_session(null, (jst_today()::text || ' 11:00:00+09')::timestamptz, '[]')");
  assert.equal(await visits("Aさん"), before + 2);
  const [{ training_days }] = await as("A", "select training_days from my_month_stats()");
  assert.ok(training_days >= 1, "トレーニング日数は日数のまま");
});

await test("アプリのクエリが指定している外部キー名が存在する", async () => {
  const rows = await asSuper(
    "select conname from pg_constraint where conname = any($1)",
    [["schedules_creator_user_id_fkey", "notifications_actor_user_id_fkey"]],
  );
  assert.equal(rows.length, 2);
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

// ---- CondoCook だけ使える家族（E） ----
const idE = "00000000-0000-0000-0000-00000000000e";
await asSuper("insert into auth.users (id) values ($1)", [idE]);
await asSuper("insert into users (id, display_name) values ($1, 'Eさん')", [idE]);
await asSuper("insert into group_members (group_id, user_id, role, apps) values ($1, $2, 'member', 'cook')", [groupId, idE]);
const asE = (sql, params) => db.exec(`reset role; select set_config('request.jwt.claim.sub', '${idE}', false); set role authenticated;`).then(() => db.query(sql, params)).then((r) => r.rows);

await test("CondoCook だけの家族: 名前・アイコンは読めるが、CondoFit のデータは読めず書けない", async () => {
  assert.equal((await asE("select is_member() m, is_cook_user() c, is_admin() a"))[0].m, false);
  assert.equal((await asE("select is_cook_user() c"))[0].c, true);
  assert.ok((await asE("select * from users")).length >= 5, "メンバーの名前は見える");
  assert.equal((await asE("select * from groups")).length, 1);
  assert.equal((await asE("select apps from group_members where user_id = $1", [idE]))[0].apps, "cook");
  for (const t of ["training_sessions", "session_exercises", "exercise_entries", "exercises", "body_parts", "schedules",
    "schedule_participants", "check_ins", "day_comments", "workout_menus", "workout_menu_items", "invite_tokens"]) {
    const [{ n }] = await asSuper(`select count(*)::int n from ${t}`);
    const rows = await asE(`select * from ${t}`).catch(() => []);
    assert.equal(rows.length, 0, `${t} は見えない（全体 ${n} 件）`);
  }
  await rejects(() => asE("insert into schedules (date, time_slot) values (jst_today(), 'night')"), /row-level security|permission denied/);
  await rejects(() => asE("insert into day_comments (date, body) values (jst_today(), 'x')"), /row-level security|permission denied/);
  await rejects(() => asE("select save_training_session(null, now(), '[]')"), /forbidden|permission denied|row-level security/);
  // ランキングには出ない
  const ranking = await as("A", "select display_name from monthly_ranking(jst_today())");
  assert.ok(!ranking.some((r) => r.display_name === "Eさん"), "ランキングに出ない");
});

await test("CondoCook だけの家族: CondoFit の通知は作られない", async () => {
  await clearNotifs();
  await as("A", "insert into day_comments (date, body) values (jst_today(), '家族には届かない')");
  assert.equal((await asSuper("select count(*)::int n from notifications where recipient_user_id = $1", [idE]))[0].n, 0);
  assert.ok((await asSuper("select count(*)::int n from notifications where recipient_user_id = $1", [ids.B]))[0].n > 0, "メンバーには届く");
});

await test("家族: 入っていなければ1人の家族を作る・1人1家族・見えるのは自分の家族（管理者は全部）", async () => {
  const [{ h: hE }] = await asE("select ensure_my_household() h");
  assert.ok(hE);
  assert.equal((await asE("select ensure_my_household() h"))[0].h, hE, "2回目は同じ家族");
  assert.equal((await asE("select name from households"))[0].name, "Eさん");
  const [{ h: hC }] = await as("C", "select ensure_my_household() h");
  assert.notEqual(hC, hE);
  assert.equal((await as("C", "select * from households")).length, 1, "自分の家族だけ");
  assert.equal((await as("C", "select * from household_members where user_id = $1", [idE])).length, 0);
  assert.ok((await as("A", "select * from households")).length >= 2, "管理者は全部見える");
  await rejects(() => as("D", "select ensure_my_household()"), /forbidden/);
  // 直接の作成・変更はできない（管理者もサーバー経由）
  await rejects(() => asE("insert into households (group_id, name) values ($1, 'x')", [groupId]), /permission denied/);
  await rejects(() => as("A", "insert into household_members (user_id, household_id) values ($1, $2)", [ids.B, hC]), /permission denied/);
  await rejects(() => asSuper("insert into household_members (user_id, household_id) values ($1, $2)", [ids.C, hE]), /duplicate key/);
});

console.log(`\n${passed} passed${process.exitCode ? ", some FAILED" : ""}`);
