// DLI students' listening, watching and reading time (web/js/dlitime.js) and the v11 database file that adds the
// devices up (supabase/v11-dli-activity.sql). The SQL can't be run here (no database on this machine): its
// self-test is supabase/test_rls_dli_activity.sql, run by the owner in the Supabase SQL editor.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { addTime, dayMask, weekTime } from "../../web/js/dlitime.js";
import { dateDay } from "../../web/js/dliweeks.js";

const MON = dateDay("2026-11-09");

test("time adds up by language, day and kind, and old days are dropped", () => {
  const log = {};
  addTime(log, "listen", 5, "ar", MON);
  addTime(log, "listen", 5, "ar", MON);
  addTime(log, "watch", 30, "ar", MON + 1);
  addTime(log, "read", 60, "es", MON + 1);
  addTime(log, "sleep", 60, "ar", MON);    // (not a kind)
  addTime(log, "read", 60, "", MON);       // (no language)
  assert.deepEqual(log, { ar: { [MON]: [10, 0, 0], [MON + 1]: [0, 30, 0] }, es: { [MON + 1]: [0, 0, 60] } });
  addTime(log, "listen", 5, "ar", MON + 30);
  assert.deepEqual(Object.keys(log), ["ar"], "days over three weeks old go, and a language with none left");
  assert.deepEqual(Object.keys(log.ar), [String(MON + 30)]);
  const capped = {};
  for (let i = 0; i < 200; i++) addTime(capped, "listen", 600, "ar", MON);
  assert.equal(capped.ar[MON][0], 16 * 3600, "a player left running all night isn't a day of study");
});

test("a week's time in minutes, and its days", () => {
  const log = { ar: { [MON - 1]: [600, 0, 0], [MON]: [1800, 0, 0], [MON + 2]: [30, 0, 0], [MON + 3]: [0, 600, 90], [MON + 7]: [600, 0, 0] } };
  const w = weekTime(log, "ar", MON);
  assert.deepEqual([w.listening, w.watching, w.reading], [31, 10, 2]);
  assert.deepEqual([...w.days], [MON, MON + 3], "a day with under a minute of each kind isn't a studied day");
  assert.deepEqual(weekTime(log, "es", MON).days.size, 0);
  assert.equal(dayMask(new Set([MON, MON + 3, MON + 6, MON + 7]), MON), 0b1001001, "Monday is the first bit; other weeks' days are left out");
});

test("the v11 file: closed table, checked caller, WHERE on every change, the app's names", () => {
  const sql = readFileSync(new URL("../../supabase/v11-dli-activity.sql", import.meta.url), "utf8");
  const app = readFileSync(new URL("../../web/js/dliclass.js", import.meta.url), "utf8");
  assert.ok(!sql.includes("\r"));
  assert.ok(sql.includes("alter table public.dli_week_time enable row level security;"));
  assert.ok(!/create policy/i.test(sql), "no reading or writing rule: only the function writes it");
  assert.ok(/revoke all on function public\.dli_report_time\([^)]*\) from public, anon;/.test(sql));
  assert.ok(/grant execute on function public\.dli_report_time\([^)]*\) to authenticated;/.test(sql));
  for (const k of ["week", "device", "listening", "watching", "reading", "day_mask"]) {
    assert.ok(new RegExp(`dli_report_time\\([^)]*\\b${k} `).test(sql), `dli_report_time takes ${k}`);
  }
  for (const k of ["listening", "watching", "reading", "day_mask"]) assert.ok(app.includes(k), `the app sends ${k}`);
  assert.ok(app.includes('rpc("dli_report_time"'));
  const heads = [...sql.matchAll(/create or replace function ([\w.]+)\([^\n]*\n(?:[^\n]*\n)?(language [^\n]+) as \$\$/g)];
  assert.equal(heads.length, 3, "dli_report_time, dli_weeks_of, dli_owner_report");
  for (const [, name, head] of heads) {
    assert.ok(head.includes("set search_path = ''") && head.includes("security definer"), `${name} pins its search path`);
  }
  assert.ok(/me is null then raise exception 'Not signed in'/.test(sql.slice(sql.indexOf("public.dli_report_time("))));
  const bare = sql.replace(/--[^\n]*/g, "");
  const risky = bare.split(";").map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => /(^|\s)(update [\w.]+( \w+)? set|delete from) /i.test(s) && !/ where /i.test(s));
  assert.deepEqual(risky, [], "the API refuses an UPDATE or DELETE without WHERE");
  assert.equal((sql.split("$$").length - 1) % 2, 0);
  let depth = 0;
  for (const ch of bare.replace(/'(?:[^']|'')*'/g, "''")) { depth += ch === "(" ? 1 : ch === ")" ? -1 : 0; assert.ok(depth >= 0); }
  assert.equal(depth, 0, "every ( is closed");
  const test = readFileSync(new URL("../../supabase/test_rls_dli_activity.sql", import.meta.url), "utf8");
  assert.ok(test.includes("raise exception 'RESULTS ok=% bad=[%]"), "the self-test ends by rolling everything back");
  assert.equal((test.split("$$").length - 1) % 2, 0);
});

test("the sharing text says what is now shared, and students are asked again", () => {
  const share = readFileSync(new URL("../../web/js/components/dlishare.js", import.meta.url), "utf8");
  const app = readFileSync(new URL("../../web/js/dliclass.js", import.meta.url), "utf8");
  assert.ok(/listening, watching and reading in your DLI language/.test(share));
  assert.ok(Number(/export const WORDING = (\d+);/.exec(app)[1]) >= 2, "raised for the time numbers");
  const policy = readFileSync(new URL("../../docs/privacy.html", import.meta.url), "utf8");
  assert.ok(/listening, watching and reading/.test(policy), "the privacy policy says so too");
});
