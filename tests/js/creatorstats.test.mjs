// The creator's view (web/js/creatorstats.js, supabase/v14-creator.sql): the limits, the lines, the checks on what
// arrives, and the rules the database file must keep.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FULL_AT, LIMITS, OTHER_SERVICES, WARN_AT, amountText, bytesText, cleanStats, level, meters, percentText, planOf, share, tightest,
  unseen } from "../../web/js/creatorstats.js";

const MB = 1024 * 1024, GB = 1024 * MB;
const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

test("the limits are Supabase's published ones, for both plans", () => {
  assert.deepEqual(LIMITS.free, { db: 500 * MB, storage: GB, mau: 50000, egress: 5 * GB, connections: 200, messages: 2000000, functions: 500000 });
  assert.deepEqual(Object.keys(LIMITS.pro), Object.keys(LIMITS.free));
  for (const k of Object.keys(LIMITS.free)) assert.ok(LIMITS.pro[k] > LIMITS.free[k], `Pro allows more ${k}`);
  assert.equal(planOf("pro"), "pro");
  assert.equal(planOf("anything"), "free");
});

test("a line is fine, amber from 70% and red from 90%", () => {
  assert.equal(level(0, 100), "ok");
  assert.equal(level(69, 100), "ok");
  assert.equal(level(100 * WARN_AT, 100), "warn");
  assert.equal(level(100 * FULL_AT, 100), "full");
  assert.equal(level(500, 100), "full");
  assert.equal(level(5, 0), "ok", "no limit known: never a warning");
  assert.equal(share(500, 100), 1, "a bar is never longer than its track");
  assert.equal(share(0, 100), 0);
  assert.equal(percentText(0, 100), "0%");
  assert.equal(percentText(1, 100000), "under 0.1%");
  assert.equal(percentText(3.4, 100), "3.4%");
  assert.equal(percentText(42.6, 100), "43%");
});

test("sizes and counts read plainly", () => {
  assert.equal(bytesText(730 * 1024), "730 KB");
  assert.equal(bytesText(12.34 * MB), "12 MB");
  assert.equal(bytesText(3.21 * MB), "3.2 MB");
  assert.equal(bytesText(1.44 * GB), "1.4 GB");
  assert.equal(amountText(50000, "count"), "50,000");
  assert.equal(amountText(500 * MB, "bytes"), "500 MB");
});

test("what the database answers is cut down to whole numbers and plain names", () => {
  const s = cleanStats({ at: "2026-11-20T10:00:00Z", online: "12", seen_today: 40.6, users: -5, active_30d: "x", db_bytes: 31 * MB, extra: "<b>",
    buckets: [{ bucket: "voice", bytes: 2 * MB, files: 9 }, { bucket: "<script>x</script>", bytes: MB, files: 1 }, { bytes: 5 }, null],
    tables: [{ name: "messages", bytes: MB, rows: 120 }, { name: "a b;drop", bytes: 1, rows: 1 }, {}] });
  assert.equal(s.online, 12);
  assert.equal(s.seen_today, 41);
  assert.equal(s.users, 0);
  assert.equal(s.active_30d, 0);
  assert.deepEqual(s.buckets.map((b) => b.bucket), ["voice", "scriptxscript"]);
  assert.equal(s.storage_bytes, 3 * MB);
  assert.deepEqual(s.tables.map((x) => x.name), ["messages", "abdrop"]);
  assert.equal(Object.prototype.hasOwnProperty.call(s, "extra"), false);
  assert.equal(cleanStats(null).online, 0);
  assert.deepEqual(cleanStats("junk").buckets, []);
});

test("the lines: people online against live connections, active users, database, files; the rest only Supabase knows", () => {
  const s = cleanStats({ online: 150, active_30d: 1000, db_bytes: 460 * MB, buckets: [{ bucket: "voice", bytes: 100 * MB, files: 3 }] });
  const lines = meters(s, "free");
  assert.deepEqual(lines.map((m) => [m.id, m.used, m.limit]), [["connections", 150, 200], ["mau", 1000, 50000], ["db", 460 * MB, 500 * MB], ["storage", 100 * MB, GB]]);
  assert.deepEqual(lines.map((m) => level(m.used, m.limit)), ["warn", "ok", "full", "ok"]);
  assert.equal(tightest(s, "free").id, "db", "the bar on Home shows the line nearest its limit");
  assert.equal(tightest(s, "pro").id, "connections");
  assert.deepEqual(unseen("free").map((u) => [u.id, u.limit]), [["egress", 5 * GB], ["messages", 2000000], ["functions", 500000]]);
  assert.ok(OTHER_SERVICES.length >= 4 && OTHER_SERVICES.every((x) => x.name && x.limit));
});

test("the database file keeps the rules", () => {
  const sql = read("supabase/v14-creator.sql");
  const bare = sql.replace(/--[^\n]*/g, "");
  assert.ok(!sql.includes("\r"));
  assert.equal((sql.split("$$").length - 1) % 2, 0, "every $$ has its partner");
  assert.ok(!/@[a-z0-9-]+\.(com|org|net)\b/i.test(sql), "no email address: the creator is a row in a table");
  assert.ok(!/sb_secret|service_role key|eyJ[A-Za-z0-9_-]{20}/.test(sql), "no key in the file");
  assert.ok(bare.includes("alter table private.creators enable row level security;"));
  assert.ok(!/create policy/i.test(bare), "no way into the creators table through the API");
  for (const name of ["public.am_creator", "public.creator_stats", "private.is_creator"]) {
    const body = sql.slice(sql.indexOf(`create or replace function ${name}(`));
    assert.ok(/security definer set search_path = ''/.test(body.slice(0, body.indexOf("$$;"))), `${name} pins its search path`);
  }
  const stats = sql.slice(sql.indexOf("create or replace function public.creator_stats("));
  const fn = stats.slice(0, stats.indexOf("end $$;"));
  assert.ok(fn.indexOf("if not private.is_creator(me) then raise exception") < fn.indexOf("select count(*)"), "the check comes before any figure");
  assert.ok(!/username|email|last_name/.test(fn), "counts and sizes only: nothing about a person");
  assert.ok(/revoke all on function public\.am_creator\(\), public\.creator_stats\(\) from public, anon;/.test(sql));
  const risky = bare.split(";").map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => /(^|\s)(update [\w.]+( \w+)? set|delete from) /i.test(s) && !/ where /i.test(s));
  assert.deepEqual(risky, [], "every UPDATE and DELETE has a WHERE");
});

test("the app holds no key, asks the database who the creator is, and has its row in the prototype list", () => {
  const bar = read("web/js/components/creatorbar.js");
  const all = bar + read("web/js/creatorstats.js");
  assert.ok(!/sb_secret|sbp_[a-z0-9]{10}|api\.supabase\.com/.test(all), "no secret key and no Management API call in the app");
  assert.ok(bar.includes('rpc("am_creator")') && bar.includes('rpc("creator_stats")'));
  assert.ok(bar.includes('feature("creator_bar")'));
  assert.ok(/creator_bar: \{[^}]*released: (true|false)/.test(read("web/js/prototype.js")), "released for everybody in v0.66.0: the database still answers for the creator only");
  assert.ok(read("web/js/pages/home.js").includes('if (feature("creator_bar")) creatorBar('));
  assert.ok(read("mobile/scripts/build-www.mjs").includes('"js/components/creatorbar.js"'), "the phones and the web app get it too");
});
