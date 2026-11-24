// DLI classes, the pure part (web/js/dliweeks.js): a student's week in numbers, the tables' sums, the
// spreadsheet, and the checks on everything that arrives from the online service.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AGAIN, GOOD } from "../../web/js/review/fsrs.js";
import {
  CLASS_NAME_MAX, NAME_MAX, cleanClass, cleanCodes, cleanMe, cleanOwner, cleanStudents, cleanUse, cleanWeek, cleanWeeks, csvText,
  activity, answerDays, dateDay, dayDate, levelCounts, pasteText, sheetRows, spaced, teacherCode, totals, weekNumbers, weekStart, weeksAgo,
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
    { week: "2026-11-09", days: 7, minutes: 0, reviews: 12, remembered: 4, new_words: 0, words: 5, known: 2, listening: 0, watching: 0, reading: 0, active_days: 7 });
  const timed = cleanWeek({ week: "2026-11-09", days: 2, listening: 45.4, watching: 99999, reading: "x", active_days: 1 });
  assert.deepEqual([timed.listening, timed.watching, timed.reading, timed.active_days], [45, 10080, 0, 2], "time is capped, and active days are at least the flashcard days");
  assert.deepEqual(cleanWeeks([{ week: "2026-11-02" }, "junk", { week: "2026-11-09" }]).map((w) => w.week), ["2026-11-09", "2026-11-02"]);
  assert.deepEqual(cleanWeeks("nope"), []);
});

test("a table's sums over the last weeks", () => {
  const weeks = [
    { week: "2026-11-09", days: 2, minutes: 10, reviews: 0, remembered: 0, new_words: 1, words: 50, known: 30 },
    { week: "2026-11-02", days: 5, minutes: 60, reviews: 200, remembered: 150, new_words: 20, words: 45, known: 25 },
    { week: "2026-10-12", days: 7, minutes: 90, reviews: 300, remembered: 290, new_words: 40, words: 20, known: 10 },
  ];
  assert.deepEqual(totals(weeks, "2026-11-09", 1), { days: 2, active_days: 2, minutes: 10, listening: 0, watching: 0, reading: 0, reviews: 0, remembered: 0,
    new_words: 1, words: 50, known: 30, total: 10, active: "2026-11-09" });
  const withTime = totals([{ week: "2026-11-09", days: 1, minutes: 5, listening: 30, watching: 20, reading: 10, active_days: 3 }], "2026-11-09", 1);
  assert.deepEqual([withTime.total, withTime.active_days, withTime.listening], [65, 3, 30]);
  assert.equal(totals([{ week: "2026-11-02", listening: 20, active_days: 1 }], "2026-11-09", 4).active, "2026-11-02", "listening alone is studying");
  const four = totals(weeks, "2026-11-09", 4);
  assert.deepEqual([four.days, four.minutes, four.reviews, four.new_words], [7, 70, 200, 21], "the week of 12 October is five weeks back");
  assert.equal(totals(weeks, "2026-11-09", 12).reviews, 500);
  assert.equal(totals([], "2026-11-09", 4).active, "");
  assert.equal(weeksAgo("2026-11-02", "2026-11-09"), 1);
  assert.equal(weeksAgo("2026-11-09", "2026-11-09"), 0);
});

test("the spreadsheet: a row per student per week, nobody missing, nothing a spreadsheet would run", () => {
  const rows = sheetRows([
    { username: "smith_ar", language: "Arabic", classes: ["A 101", "Evening"], weeks: [{ week: "2026-11-09", days: 3, minutes: 40, reviews: 100, remembered: 90, new_words: 10, words: 60, known: 40 },
      { week: "2026-11-02", days: 1, minutes: 5, reviews: 9, remembered: 9, new_words: 2, words: 50, known: 30 }] },
    { username: "=cmd|' /C calc'!A0", language: "Korean", classes: [], weeks: [] },
  ]);
  assert.equal(rows[0].length, 17);
  assert.ok(rows.every((r) => r.length === 17), "every row has every column");
  assert.equal(rows[0][0], "Username", "no name column: DLI keeps no one's real name");
  assert.deepEqual(rows[1], ["smith_ar", "Arabic", "A 101; Evening", "", "2026-11-02", 1, 1, 5, 0, 0, 0, 5, 9, 9, 2, 50, 30], "oldest week first");
  assert.equal(rows.length, 4);
  assert.equal(rows[3][4], "", "a student with no week yet still has a row");
  const csv = csvText(rows).split("\r\n");
  assert.equal(csv[1], "smith_ar,Arabic,A 101; Evening,,2026-11-02,1,1,5,0,0,0,5,9,9,2,50,30");
  const joined = sheetRows([{ username: "lee", agreed_at: "2026-11-03T12:00:00", weeks: [{ week: "2026-11-09", days: 1, minutes: 4, listening: 30, watching: 10, reading: 6, active_days: 4 }] }]);
  assert.deepEqual(joined[1].slice(3), ["2026-11-03", "2026-11-09", 4, 1, 4, 30, 10, 6, 50, 0, 0, 0, 0, 0], "the day they joined, every kind of minute and the total");
  assert.ok(csv[3].startsWith("'=cmd"), "a name that starts like a formula is made plain text");
  assert.equal(csvText([["a,b", 'say "hi"', -5]]), '"a,b","say ""hi""",-5');
  assert.equal(pasteText([["a\tb", "c\nd"], [1, 2]]), "a b\tc d\n1\t2");
});

test("a student's activity level: days a week over the last four whole weeks, from the week they joined", () => {
  const wk = (week, active_days, more = {}) => ({ week, days: 0, active_days, ...more });
  const now = "2026-11-30";
  assert.deepEqual(activity([], now), { level: "none", perWeek: 0 }, "never studied");
  assert.equal(activity([wk("2026-11-02", 5)], now).level, "stopped", "nothing this week or last");
  assert.deepEqual(activity([wk("2026-11-23", 5), wk("2026-11-16", 4), wk("2026-11-09", 4), wk("2026-11-02", 3)], now), { level: "active", perWeek: 4 });
  assert.equal(activity([wk("2026-11-23", 3), wk("2026-11-16", 2)], now).level, "little", "five days over four weeks is 1.3 a week");
  assert.deepEqual(activity([wk("2026-11-23", 3), wk("2026-11-16", 2)], now, "2026-11-17T10:00:00Z"), { level: "some", perWeek: 2.5 },
    "joined two weeks ago: averaged over two");
  assert.deepEqual(activity([wk("2026-11-30", 2)], now, "2026-11-30T10:00:00Z"), { level: "some", perWeek: 2 }, "joined this week: this week so far");
  assert.equal(activity([wk("2026-11-30", 0, { listening: 20 })], now, "2026-11-30T10:00:00Z").level, "little", "listening alone counts as studying");
  assert.equal(activity([wk("2026-11-30", 1), wk("2026-10-05", 7)], now).level, "little", "studied this week after a long gap");
  const counts = levelCounts([{ weeks: [] }, { weeks: [wk("2026-11-23", 6), wk("2026-11-16", 6), wk("2026-11-09", 6), wk("2026-11-02", 6)] },
    { weeks: [wk("2026-10-05", 4)] }], now);
  assert.deepEqual(counts, { active: 1, some: 0, little: 0, stopped: 1, none: 1 });
});

test("the days with flashcard answers, for the week's studied days", () => {
  const log = { 1: [[Date.parse("2026-11-10T10:00:00Z"), GOOD, MON + 1, 4000]], 2: [[Date.parse("2026-11-12T10:00:00Z"), AGAIN, MON + 3, 4000]] };
  assert.deepEqual([...answerDays([word(1), word(2)], log, MON)].sort(), [MON + 1, MON + 3]);
});

test("what the online service says about me is cut to size and stripped of markup", () => {
  const me = cleanMe({
    student: { username: "smith_ar", last_name: "Smith", language: "ar", agreed_at: "2026-11-10T08:00:00Z", agreed_version: 1 },
    teacher: { username: "<b>rivera</b>", name: "Ms. Rivera" }, owner: "yes",
    classes: [{ id: ID, name: "A <script>101", role: "teacher", code: "ABC234", staff_code: "COABCD2345", students: "12", teachers: ["rivera", 5, "<i>x</i>", "Ms. R", "user-1a2b3c"] },
      { id: "nope", name: "x" }, { id: ID.toUpperCase(), name: "", role: "admin", code: "ABC234", teachers: "none" }],
    weeks: [{ week: "2026-11-09", days: 3 }, { week: "bad" }],
  });
  assert.equal(me.student.username, "smith_ar");
  assert.ok(!JSON.stringify(me).includes("Smith") && !JSON.stringify(me).includes("Rivera"), "a name sent by an older database is never kept");
  assert.equal(me.teacher.username, "", "only a username, nothing with markup");
  assert.equal(cleanMe({ student: { language: "ar" } }).student.username, "", "no username yet: still a student");
  assert.equal(me.owner, false, "only a real yes makes an owner");
  assert.equal(me.classes.length, 2);
  assert.deepEqual(me.classes[0], { id: ID, name: "A script 101", role: "teacher", teachers: ["rivera", "user-1a2b3c"], code: "ABC234", staff_code: "COABCD2345", students: 12 },
    "teachers by username only");
  assert.equal(me.classes[1].role, "student");
  assert.equal(me.classes[1].name, "Class");
  assert.equal(me.classes[1].code, undefined, "a student never gets a class's codes");
  assert.equal(me.weeks.length, 1);
  assert.equal(cleanMe(null).student, null);
  assert.equal(cleanMe({ student: { username: "smith_ar", language: "de" } }).student, null, "German isn't taught there");
  assert.equal(cleanClass({ id: ID, name: "x".repeat(200) }).name.length, CLASS_NAME_MAX);
});

test("reports, codes and code answers are checked too", () => {
  const students = cleanStudents([{ id: ID, username: "baker1", last_name: "Baker", language: "ko", joined_at: "2026-11-01T00:00:00Z", classes: ["K1", 7], weeks: [{ week: "2026-11-09" }] },
    { username: "noid" }, null]);
  assert.equal(students.length, 1);
  assert.equal(students[0].username, "baker1");
  assert.ok(!("last_name" in students[0]), "a last name is never kept");
  assert.equal(cleanStudents([{ id: ID, last_name: "Baker" }])[0].username, "?", "a database without v11: no name shown");
  assert.deepEqual(students[0].classes, ["K1", "7"]);
  const owner = cleanOwner({ students: [{ id: ID, username: "baker1", language: "ko" }], teachers: [{ id: ID, name: "T", username: "tee", classes: 2 }, { name: "ghost" }],
    classes: [{ id: ID, name: "K1", students: 3, teachers: ["T"] }], teacher_code: "TCHABCDEFGH2345" });
  assert.equal(owner.students.length + owner.teachers.length + owner.classes.length, 3);
  assert.deepEqual(Object.keys(owner.teachers[0]).sort(), ["classes", "id", "since", "username"], "a teacher's name isn't kept either");
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
  const v11 = readFileSync(new URL("../../supabase/v11-dli-activity.sql", import.meta.url), "utf8");
  const v13 = readFileSync(new URL("../../supabase/v13-dli-class-teachers.sql", import.meta.url), "utf8");
  const v15 = readFileSync(new URL("../../supabase/v15-dli-class-tab.sql", import.meta.url), "utf8");
  const app = readFileSync(new URL("../../web/js/dliclass.js", import.meta.url), "utf8");
  // every database function the app calls exists in the files, and is open to signed-in people only
  const called = [...app.matchAll(/rpc\("(dli_[a-z_]+)"/g)].map((m) => m[1]);
  assert.ok(called.length >= 16, "the app's calls were found");
  for (const name of new Set(called)) {
    const file = [sql, v11, v13, v15].find((f) => f.includes(`create or replace function public.${name}(`)) || sql;
    assert.ok(file.includes(`create or replace function public.${name}(`), `${name} is in a SQL file`);
    assert.ok(new RegExp(`grant execute on function[^;]*public\\.${name}\\(`).test(file), `${name} may be run by signed-in people`);
    assert.ok(new RegExp(`revoke all on function[^;]*public\\.${name}\\(`).test(file), `${name} is closed to everyone else`);
  }
  // the week's numbers go by the names the database function takes
  const report = /create or replace function public\.dli_report_week\(([^)]*)\)/.exec(sql)[1];
  for (const k of Object.keys(weekNumbers([], {}, MON))) assert.ok(new RegExp(`\\b${k} `).test(report), `dli_report_week takes ${k}`);
  // no table can be read through the API directly: row-level security on, and not one reading rule
  const tables = [...sql.matchAll(/create table if not exists public\.(dli_\w+)/g)].map((m) => m[1]);
  assert.equal(tables.length, 6);
  for (const name of tables) assert.ok(sql.includes(`alter table public.${name} enable row level security;`), `${name} is closed`);
  assert.ok(!/create policy/i.test(sql), "no reading or writing rule at all: everything goes through the functions");
  assert.ok(sql.includes(`length(name) between 1 and ${CLASS_NAME_MAX}`));
  // no one's real name: v11 deletes the columns that held them, and the app never sends one
  assert.ok(v11.includes("alter table public.dli_students drop column if exists last_name;"));
  assert.ok(v11.includes("alter table public.dli_teachers drop column if exists name;"));
  assert.ok(!/rpc\("dli_set_teacher_name"/.test(app), "the app no longer sends a teacher's name");
  assert.ok(/rpc\("dli_register", \{ last_name: "-",/.test(app), "the only last name ever sent is a dash, to a database without v11");
  assert.equal(NAME_MAX, 20, "a username's length");
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

test("every UPDATE and DELETE in the database file has a WHERE (the API refuses one without: found live, 2026-11-15)", () => {
  // Supabase loads "safeupdate" for calls that come through the API, not for the SQL editor, so the self-test
  // passed while the app's call failed with "UPDATE requires a WHERE clause".
  const sql = readFileSync(new URL("../../supabase/v10-dli-classes.sql", import.meta.url), "utf8").replace(/--[^\n]*/g, "");
  const statements = sql.split(";").map((s) => s.replace(/\s+/g, " ").trim());
  const risky = statements.filter((s) => /(^|\s)(update [\w.]+( \w+)? set|delete from) /i.test(s) && !/ where /i.test(s));
  assert.deepEqual(risky.map((s) => s.slice(0, 80)), []);
});

test("a class's teachers (v13): the list and the answer to adding one are checked, and the file keeps the rules", async () => {
  const { cleanTeachers, cleanAdded } = await import("../../web/js/dliweeks.js");
  const list = cleanTeachers([{ id: ID, username: "ms.rivera", added_at: "2026-11-01T00:00:00Z", me: true, can_drop: "yes" },
    { id: ID.replace("0f", "1f"), username: "<b>x</b>", can_drop: true }, { username: "no id" }, null]);
  assert.equal(list.length, 2);
  assert.deepEqual(list[0], { id: ID, username: "ms.rivera", added_at: "2026-11-01T00:00:00Z", me: true, can_drop: false });
  assert.equal(list[1].username, "?", "markup is never a username");
  assert.equal(list[1].can_drop, true);
  assert.deepEqual(cleanAdded({ status: "added", username: "mr_haddad" }), { status: "added", username: "mr_haddad" });
  assert.deepEqual(cleanAdded({ status: "<img>", username: "a b" }), { status: "no", username: "" });
  assert.deepEqual(cleanAdded(null), { status: "no", username: "" });

  const sql = readFileSync(new URL("../../supabase/v13-dli-class-teachers.sql", import.meta.url), "utf8");
  const bare = sql.replace(/--[^\n]*/g, "");
  assert.ok(!/create table|create policy|alter table/i.test(bare), "no new table and no table rule: three functions only");
  assert.equal(sql.split("$$").length - 1, 6, "three functions, each opened and closed");
  for (const name of ["dli_class_teachers", "dli_add_teacher", "dli_drop_teacher"]) {
    const body = sql.slice(sql.indexOf(`create or replace function public.${name}(`));
    const fn = body.slice(0, body.indexOf("end $$;"));
    assert.ok(/security definer set search_path = ''/.test(fn), `${name} pins its search path`);
    assert.ok(/me is null/.test(fn), `${name} refuses a signed-out caller`);
    assert.ok(/dli_teaches\(me, class\)|v_mine is null/.test(fn), `${name} is for a teacher of that class only`);
  }
  // only someone who is already a DLI teacher can be added, and "no such user" looks the same as "not a teacher"
  assert.ok(/join public\.dli_teachers t on t\.user_id = p\.id/.test(sql));
  assert.equal((bare.match(/'status', 'no'/g) || []).length, 1, "one answer for every name that can't be added");
  // every UPDATE and DELETE has a WHERE (the API refuses one without)
  const risky = bare.split(";").map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => /(^|\s)(update [\w.]+( \w+)? set|delete from) /i.test(s) && !/ where /i.test(s));
  assert.deepEqual(risky, []);
  // released for everyone (released in v0.63.0, the owner, 2026-11-18); its code still asks feature("class_teachers")
  const proto = readFileSync(new URL("../../web/js/prototype.js", import.meta.url), "utf8");
  assert.ok(/class_teachers: \{[^}]*released: true/.test(proto));
  const screen = readFileSync(new URL("../../web/js/components/dliteach.js", import.meta.url), "utf8");
  assert.ok(screen.includes('if (feature("class_teachers"))'));
});

test("the Class tab (v15): what arrives is checked, and the file keeps the rules", async () => {
  const { cleanInvites, cleanInvited, cleanPeople, cleanPostItem, cleanPosts, cleanAnswer } = await import("../../web/js/dliweeks.js");
  // invitations
  const inv = cleanInvites([{ class: ID, name: "<b>Arabic 1</b>", teachers: ["ms.rivera", "<i>"], invited_at: "2026-11-24T00:00:00Z" }, { name: "no id" }, null]);
  assert.equal(inv.length, 1);
  assert.equal(inv[0].class, ID);
  assert.ok(!/[<>]/.test(inv[0].name + inv[0].teachers.join("")), "no markup in a class name or a username");
  assert.deepEqual(cleanInvites("nope"), []);
  const waiting = cleanInvited([{ id: ID, username: "sam_k", invited_at: "2026-11-24T00:00:00Z" }, { username: "no id" }]);
  assert.equal(waiting.length, 1);
  assert.equal(waiting[0].username, "sam_k");
  assert.equal(cleanAnswer({ status: "joined", class: ID, name: "Arabic 1" }).status, "joined");
  assert.equal(cleanAnswer({ status: "<img>" }).status, "no");
  assert.equal(cleanAnswer(null).status, "no");
  // classmates: a username and one of five words, nothing else
  const people = cleanPeople({ teachers: ["ms.rivera"], students: [{ username: "sam_k", level: "active", me: true, minutes: 99 },
    { username: "lee.p", level: "hacked" }, { username: "<b>", level: "active" }, null] });
  assert.deepEqual(people.teachers, ["ms.rivera"]);
  assert.deepEqual(people.students[0], { username: "sam_k", level: "active", me: true });
  assert.ok(["active", "some", "little", "stopped", "none"].includes(people.students[1].level), "an unknown level is never shown");
  assert.equal(people.students.length, 2, "markup is never a username");
  assert.deepEqual(cleanPeople(null), { teachers: [], students: [] });
  // posts: the kinds Send to a friend sends, never Netflix, and only a file of this shape
  assert.equal(cleanPostItem({ kind: "netflix", title: "x" }), null);
  assert.equal(cleanPostItem({ kind: "page" }), null, "a post needs a title or a link");
  const posts = cleanPosts([{ id: ID, item: { kind: "podcast", title: "Ep <1>", url: "https://example.org/a.mp3" }, path: `${ID}/${ID}.gz`, sender: "ms.rivera", created_at: "2026-11-24T00:00:00Z" },
    { id: ID, item: { kind: "page", title: "No file" }, path: "../../etc/passwd" }, { id: ID, item: { kind: "netflix", title: "x" } }, null]);
  assert.equal(posts.length, 2, "a post of a kind that isn't sent is dropped");
  assert.equal(posts[0].path, `${ID}/${ID}.gz`);
  assert.equal(posts[1].path, "", "an odd file path is never fetched");

  const sql = readFileSync(new URL("../../supabase/v15-dli-class-tab.sql", import.meta.url), "utf8");
  const bare = sql.replace(/--[^\n]*/g, "");
  assert.equal(sql.split("$$").length % 2, 1, "every function body is opened and closed");
  const tables = [...sql.matchAll(/create table if not exists public\.(dli_\w+)/g)].map((m) => m[1]);
  assert.deepEqual(tables, ["dli_class_invites", "dli_class_posts"]);
  for (const name of tables) assert.ok(sql.includes(`alter table public.${name} enable row level security;`), `${name} is closed`);
  assert.ok(!/create policy[^;]* on public\./i.test(bare), "no rule on a table: everything goes through the functions");
  assert.equal((bare.match(/create policy/gi) || []).length, 3, "three file rules, on the class's own storage only");
  for (const m of bare.matchAll(/create policy[^;]*;/gi)) assert.ok(m[0].includes("bucket_id = 'dli-class'"), "a file rule reaches no other storage");
  const fns = ["dli_invite_student", "dli_class_invited", "dli_cancel_invite", "dli_my_invites", "dli_answer_invite", "dli_classmates", "dli_post", "dli_class_posts", "dli_delete_post"];
  for (const name of fns) {
    const body = sql.slice(sql.indexOf(`create or replace function public.${name}(`));
    const fn = body.slice(0, body.indexOf("end $$;"));
    assert.ok(/security definer set search_path = ''/.test(fn), `${name} pins its search path`);
    assert.ok(/(me|auth\.uid\(\)) is null then raise exception 'Not signed in'/.test(fn), `${name} refuses a signed-out caller`);
  }
  for (const name of ["dli_invite_student", "dli_class_invited", "dli_cancel_invite", "dli_post", "dli_delete_post"]) {
    const body = sql.slice(sql.indexOf(`create or replace function public.${name}(`));
    assert.ok(/if not private\.dli_teaches\(/.test(body.slice(0, body.indexOf("end $$;"))), `${name} is for a teacher of that class`);
  }
  // classmates: only those who agreed to wording 3, and no number leaves
  const mates = sql.slice(sql.indexOf("create or replace function public.dli_classmates("));
  const matesFn = mates.slice(0, mates.indexOf("end $$;"));
  assert.ok(matesFn.includes("raise exception 'dli_agree_first'"));
  assert.equal((matesFn.match(/agreed_version >= 3/g) || []).length, 2, "who may look, and who is listed");
  assert.ok(!/minutes|reviews|remembered|words|known|'id'/.test(matesFn), "a level, never the numbers or an id");
  // one answer for every name that can't be invited, and wrong names are counted
  assert.equal((bare.match(/'status', 'no'/g) || []).length, 1);
  assert.ok(bare.includes("insert into private.dli_tries (user_id) values (me);"));
  // every UPDATE and DELETE has a WHERE (the API refuses one without)
  const risky = bare.split(";").map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => /(^|\s)(update [\w.]+( \w+)? set|delete from) /i.test(s) && !/ where /i.test(s));
  assert.deepEqual(risky, []);
  // the self-test is there, and ends by rolling everything back
  const selftest = readFileSync(new URL("../../supabase/test_rls_dli_class_tab.sql", import.meta.url), "utf8");
  assert.ok(/raise exception 'RESULTS ok=% bad=\[%\]/.test(selftest));
  for (const name of fns) assert.ok(selftest.includes(`'${name}'`), `the self-test checks ${name} is closed to the signed-out`);
  // a prototype: only the owner's devices show it, and the phones and the web app get the page too
  const proto = readFileSync(new URL("../../web/js/prototype.js", import.meta.url), "utf8");
  assert.ok(/class_tab: \{[^}]*released: false/.test(proto));
  const app = readFileSync(new URL("../../web/js/dliclass.js", import.meta.url), "utf8");
  assert.ok(app.includes('feature("class_tab")'));
  assert.ok(/export const WORDING = 2;/.test(app), "the sharing step's wording is unchanged: agreeing to classmates is its own choice");
  assert.ok(/CLASSMATES_WORDING = 3/.test(app));
  const build = readFileSync(new URL("../../mobile/scripts/build-www.mjs", import.meta.url), "utf8");
  assert.ok(build.includes('"js/pages/class.js"'));
  for (const shell of ["../../web/js/app.js", "../../mobile/src/js/app.js"]) {
    assert.ok(readFileSync(new URL(shell, import.meta.url), "utf8").includes("/^class$/"), `${shell} has the Class page`);
  }
  for (const page of ["../../web/index.html", "../../mobile/src/index.html"]) {
    assert.ok(/data-nav="class"[^>]* hidden/.test(readFileSync(new URL(page, import.meta.url), "utf8")), `${page}: the tab is hidden until a DLI role shows it`);
  }
});
