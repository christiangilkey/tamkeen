// DLI classes, the pure part (web/js/dliweeks.js): a student's week in numbers, the tables' sums, the
// spreadsheet, and the checks on everything that arrives from the online service.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AGAIN, GOOD } from "../../web/js/review/fsrs.js";
import {
  CLASS_NAME_MAX, NAME_MAX, cleanClass, cleanCodes, cleanMe, cleanOwner, cleanStudents, cleanUse, cleanWeek, cleanWeeks, csvText,
  dateDay, dayDate, pasteText, sheetRows, spaced, teacherCode, totals, weekNumbers, weekStart, weeksAgo,
} from "../../web/js/dliweeks.js";

const MON = dateDay("2026-11-09"); // a Monday
const word = (uid) => ({ uid, id: uid, text: `w${uid}`, meaning: "m" });
const ID = "0f8fad5b-d9cb-469f-a165-70867728950e";

test("a week starts on Monday, whatever the day", () => {
  assert.equal(new Date("2026-11-09T12:00:00Z").getUTCDay(), 1, "the fixture is a Monday");
  for (let d = 0; d < 7; d++) assert.equal(weekStart(MON + d), MON);
  assert.equal(weekStart(MON - 1), MON - 7);
  assert.equal(weekStart(MON + 7), MON + 7);
  assert.equal(dayDate(MON), "2026-11-09");
  assert.equal(dateDay(dayDate(MON + 3)), MON + 3);
});

test("a week's numbers: days, minutes, reviews, remembered, new words, words saved and known", () => {
  const log = {
    a: [[1, GOOD, MON - 3, 5000], [2, AGAIN, MON, 20000], [3, GOOD, MON, 10000], [4, GOOD, MON + 2, 30000]],  // known before the week
    b: [[5, AGAIN, MON + 2, 90000], [6, GOOD, MON + 2, 30000], [7, 0, MON + 2, 4000]],                        // new this week; one taken back
    c: [[8, GOOD, MON + 9, 9000]],                                                                              // next week only
    gone: [[9, GOOD, MON, 9000]],                                                                               // a word no longer saved
  };
  const n = weekNumbers([word("a"), word("b"), word("c"), word("d"), { ...word("x"), deleted: 1 }], log, MON);
  assert.deepEqual(n, { week: "2026-11-09", days: 2, minutes: 3, reviews: 5, remembered: 3, new_words: 1, words: 4, known: 2 });
  // a look counts 60 seconds at most: 20 + 10 + 30 + 60 (not 90) + 30 = 150 s = 2.5 → 3 minutes
  const next = weekNumbers([word("a"), word("b"), word("c"), word("d")], log, MON + 7);
  assert.deepEqual([next.days, next.reviews, next.new_words, next.known], [1, 1, 1, 3]);
  assert.deepEqual(weekNumbers([], {}, MON), { week: "2026-11-09", days: 0, minutes: 0, reviews: 0, remembered: 0, new_words: 0, words: 0, known: 0 });
  assert.equal(weekNumbers(null, null, MON).words, 0, "nothing to read is nothing, not an error");
});

test("the numbers carry no words", () => {
  const n = weekNumbers([word("a")], { a: [[1, GOOD, MON, 1000]] }, MON);
  assert.deepEqual(Object.keys(n).sort(), ["days", "known", "minutes", "new_words", "remembered", "reviews", "week", "words"]);
  for (const [k, v] of Object.entries(n)) assert.ok(k === "week" ? /^\d{4}-\d\d-\d\d$/.test(v) : Number.isInteger(v), k);
});

test("weeks from the online service are checked, and sorted newest first", () => {
  assert.equal(cleanWeek({ week: "soon", days: 1 }), null);
  assert.equal(cleanWeek(null), null);
  assert.deepEqual(cleanWeek({ week: "2026-11-09", days: 99, minutes: -4, reviews: "12", remembered: 3.6, new_words: "x", words: 5, known: 2, extra: "<b>" }),
    { week: "2026-11-09", days: 7, minutes: 0, reviews: 12, remembered: 4, new_words: 0, words: 5, known: 2 });
  assert.deepEqual(cleanWeeks([{ week: "2026-11-02" }, "junk", { week: "2026-11-09" }]).map((w) => w.week), ["2026-11-09", "2026-11-02"]);
  assert.deepEqual(cleanWeeks("nope"), []);
});

test("a table's sums over the last weeks", () => {
  const weeks = [
    { week: "2026-11-09", days: 2, minutes: 10, reviews: 0, remembered: 0, new_words: 1, words: 50, known: 30 },
    { week: "2026-11-02", days: 5, minutes: 60, reviews: 200, remembered: 150, new_words: 20, words: 45, known: 25 },
    { week: "2026-10-12", days: 7, minutes: 90, reviews: 300, remembered: 290, new_words: 40, words: 20, known: 10 },
  ];
  assert.deepEqual(totals(weeks, "2026-11-09", 1), { days: 2, minutes: 10, reviews: 0, remembered: 0, new_words: 1, words: 50, known: 30, active: "2026-11-02" });
  const four = totals(weeks, "2026-11-09", 4);
  assert.deepEqual([four.days, four.minutes, four.reviews, four.new_words], [7, 70, 200, 21], "the week of 12 October is five weeks back");
  assert.equal(totals(weeks, "2026-11-09", 12).reviews, 500);
  assert.equal(totals([], "2026-11-09", 4).active, "");
  assert.equal(weeksAgo("2026-11-02", "2026-11-09"), 1);
  assert.equal(weeksAgo("2026-11-09", "2026-11-09"), 0);
});

test("the spreadsheet: a row per student per week, nobody missing, nothing a spreadsheet would run", () => {
  const rows = sheetRows([
    { last_name: "Smith", language: "Arabic", classes: ["A 101", "Evening"], weeks: [{ week: "2026-11-09", days: 3, minutes: 40, reviews: 100, remembered: 90, new_words: 10, words: 60, known: 40 },
      { week: "2026-11-02", days: 1, minutes: 5, reviews: 9, remembered: 9, new_words: 2, words: 50, known: 30 }] },
    { last_name: "=cmd|' /C calc'!A0", language: "Korean", classes: [], weeks: [] },
  ]);
  assert.equal(rows[0].length, 11);
  assert.deepEqual(rows[1], ["Smith", "Arabic", "A 101; Evening", "2026-11-02", 1, 5, 9, 9, 2, 50, 30], "oldest week first");
  assert.equal(rows.length, 4);
  assert.equal(rows[3][3], "", "a student with no week yet still has a row");
  const csv = csvText(rows).split("\r\n");
  assert.equal(csv[1], "Smith,Arabic,A 101; Evening,2026-11-02,1,5,9,9,2,50,30");
  assert.ok(csv[3].startsWith("'=cmd"), "a name that starts like a formula is made plain text");
  assert.equal(csvText([["a,b", 'say "hi"', -5]]), '"a,b","say ""hi""",-5');
  assert.equal(pasteText([["a\tb", "c\nd"], [1, 2]]), "a b\tc d\n1\t2");
});

test("what the online service says about me is cut to size and stripped of markup", () => {
  const me = cleanMe({
    student: { last_name: "  <b>Smith</b>\n", language: "ar", agreed_at: "2026-11-10T08:00:00Z", agreed_version: 1 },
    teacher: { name: "Ms. Rivera".repeat(20) }, owner: "yes",
    classes: [{ id: ID, name: "A <script>101", role: "teacher", code: "ABC234", staff_code: "COABCD2345", students: "12", teachers: ["Ms. R", 5, "<i>x</i>"] },
      { id: "nope", name: "x" }, { id: ID.toUpperCase(), name: "", role: "admin", code: "ABC234", teachers: "none" }],
    weeks: [{ week: "2026-11-09", days: 3 }, { week: "bad" }],
  });
  assert.equal(me.student.last_name, "b Smith /b");
  assert.equal(me.teacher.name.length, NAME_MAX);
  assert.equal(me.owner, false, "only a real yes makes an owner");
  assert.equal(me.classes.length, 2);
  assert.deepEqual(me.classes[0], { id: ID, name: "A script 101", role: "teacher", teachers: ["Ms. R", "5", "i x /i"], code: "ABC234", staff_code: "COABCD2345", students: 12 });
  assert.equal(me.classes[1].role, "student");
  assert.equal(me.classes[1].name, "Class");
  assert.equal(me.classes[1].code, undefined, "a student never gets a class's codes");
  assert.equal(me.weeks.length, 1);
  assert.equal(cleanMe(null).student, null);
  assert.equal(cleanMe({ student: { last_name: "Smith", language: "de" } }).student, null, "German isn't taught there");
  assert.equal(cleanClass({ id: ID, name: "x".repeat(200) }).name.length, CLASS_NAME_MAX);
});

test("reports, codes and code answers are checked too", () => {
  const students = cleanStudents([{ id: ID, last_name: "Baker", language: "ko", joined_at: "2026-11-01T00:00:00Z", classes: ["K1", 7], weeks: [{ week: "2026-11-09" }] },
    { last_name: "No id" }, null]);
  assert.equal(students.length, 1);
  assert.deepEqual(students[0].classes, ["K1", "7"]);
  const owner = cleanOwner({ students: [{ id: ID, last_name: "Baker", language: "ko" }], teachers: [{ id: ID, name: "T", username: "tee", classes: 2 }, { name: "ghost" }],
    classes: [{ id: ID, name: "K1", students: 3, teachers: ["T"] }], teacher_code: "TCHABCDEFGH2345" });
  assert.equal(owner.students.length + owner.teachers.length + owner.classes.length, 3);
  assert.equal(owner.teacher_code, "TCHABCDEFGH2345");
  assert.equal(cleanOwner({ teacher_code: "<script>" }).teacher_code, "");
  assert.equal(teacherCode("TCH123"), "");
  assert.deepEqual(cleanUse({ status: "joined", class: ID, name: "A 101" }), { status: "joined", id: ID, name: "A 101" });
  assert.deepEqual(cleanUse({ status: "<img>" }), { status: "no", id: "", name: "" });
  assert.deepEqual(cleanUse(null), { status: "no", id: "", name: "" });
  assert.deepEqual(cleanCodes({ code: "abc234", staff_code: "COABCD2345" }), { code: "", staff_code: "COABCD2345" });
});

test("codes are read out in groups", () => {
  assert.equal(spaced("ABC234"), "ABC-234");
  assert.equal(spaced("COABCD2345"), "CO-ABCD-2345");
  assert.equal(spaced("TCHABCDEFGH2345"), "TCH-ABCD-EFGH-2345");
  assert.equal(spaced(""), "");
});

test("the database file and the app agree on names and limits", () => {
  const sql = readFileSync(new URL("../../supabase/v10-dli-classes.sql", import.meta.url), "utf8");
  const app = readFileSync(new URL("../../web/js/dliclass.js", import.meta.url), "utf8");
  // every database function the app calls exists in the file, and is open to signed-in people only
  const called = [...app.matchAll(/rpc\("(dli_[a-z_]+)"/g)].map((m) => m[1]);
  assert.ok(called.length >= 15, "the app's calls were found");
  for (const name of new Set(called)) {
    assert.ok(sql.includes(`create or replace function public.${name}(`), `${name} is in the SQL file`);
    assert.ok(new RegExp(`grant execute on function[^;]*public\\.${name}\\(`).test(sql), `${name} may be run by signed-in people`);
    assert.ok(new RegExp(`revoke all on function[^;]*public\\.${name}\\(`).test(sql), `${name} is closed to everyone else`);
  }
  // the week's numbers go by the names the database function takes
  const report = /create or replace function public\.dli_report_week\(([^)]*)\)/.exec(sql)[1];
  for (const k of Object.keys(weekNumbers([], {}, MON))) assert.ok(new RegExp(`\\b${k} `).test(report), `dli_report_week takes ${k}`);
  // no table can be read through the API directly: row-level security on, and not one reading rule
  const tables = [...sql.matchAll(/create table if not exists public\.(dli_\w+)/g)].map((m) => m[1]);
  assert.equal(tables.length, 6);
  for (const name of tables) assert.ok(sql.includes(`alter table public.${name} enable row level security;`), `${name} is closed`);
  assert.ok(!/create policy/i.test(sql), "no reading or writing rule at all: everything goes through the functions");
  assert.ok(sql.includes(`length(last_name) between 1 and ${NAME_MAX}`) && sql.includes(`length(name) between 1 and ${CLASS_NAME_MAX}`));
  // never the owner's address, the DLI password or a real code in the file
  assert.ok(!/@gmail|@[a-z0-9-]+\.(com|org|net)\b/i.test(sql), "no email address in the SQL file");
});

test("the SQL files hold together (they can't be run here: there is no database on this machine)", () => {
  for (const name of ["v10-dli-classes.sql", "test_rls_dli.sql"]) {
    const sql = readFileSync(new URL(`../../supabase/${name}`, import.meta.url), "utf8");
    assert.ok(!sql.includes("\r"), `${name} has LF line endings`);
    // every function body opens and closes with $$, and no lone $ is left where $$ was meant
    assert.equal((sql.split("$$").length - 1) % 2, 0, `${name}: every $$ has its partner`);
    const bare = sql.replace(/--[^\n]*/g, "").replace(/'(?:[^']|'')*'/g, "''"); // (comments and quoted text out of the way)
    assert.ok(!/(^|[^$])\$([^$]|$)/.test(bare), `${name}: no lone $ outside quoted text`);
    // brackets balance
    let depth = 0;
    for (const ch of bare) {
      if (ch === "(") depth++;
      else if (ch === ")") depth--;
      assert.ok(depth >= 0, `${name}: a ) with no (`);
    }
    assert.equal(depth, 0, `${name}: every ( is closed`);
  }
  const sql = readFileSync(new URL("../../supabase/v10-dli-classes.sql", import.meta.url), "utf8");
  assert.equal(sql.split("$$").length - 1, 52, "25 functions and the first-run block, each opened and closed");
  // every function pins its search path (one that didn't could be tricked into running someone else's code),
  // and every function the app can reach runs with the database's own rights only after checking who asks
  const heads = [...sql.matchAll(/create or replace function ([\w.]+)\([^\n]*\n(?:[^\n]*\n)?(language [^\n]+) as \$\$/g)];
  assert.equal(heads.length, 25);
  for (const [, name, head] of heads) {
    assert.ok(head.includes("set search_path = ''"), `${name} pins its search path`);
    if (name.startsWith("public.")) assert.ok(head.includes("security definer"), `${name} is security definer`);
  }
  for (const [, name] of heads.filter((h) => h[1].startsWith("public."))) {
    const body = sql.slice(sql.indexOf(`create or replace function ${name}(`));
    assert.ok(/auth\.uid\(\) is null|me is null/.test(body.slice(0, body.indexOf("end $$;"))), `${name} refuses a signed-out caller`);
  }
});
