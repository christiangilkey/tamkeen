// DLI teachers and Tamkeen's owner (the online side is dliclass.js; the rules are in
// supabase/v10-dli-classes.sql). In Settings → DLI students, under the student's card:
//   "I'm a DLI teacher" (opt-in): sign in, type the teacher code the owner gave out, then make classes. Each class
//   has a code its students type; a tap on a class opens its students with their weekly study numbers
//   (dliweeks.js): days studied, minutes (flashcards, listening, watching, reading), reviews, share remembered,
//   new words, words known, when they joined and their activity level (dliweeks.js activity), with how many
//   students are at each level above the table. Usernames and numbers only (no one's real name is kept: the
//   owner's rule, 2026-11-16): a teacher never sees a student's words or library.
//   The owner (made by the one-time owner code) also gets "All DLI students": every student, by language and
//   class, the same numbers, a copy for a spreadsheet, the teacher code and the list of teachers.
// A teacher can keep a private note on a student ("sits by the window"): it stays on that device
// (localStorage tamkeenDliNotes) and is never sent anywhere.
// Shared by the computer, the phones and the web app.

import { esc, h, toast } from "../app.js";
import { t } from "../i18n.js";
import { icon } from "../icons.js";
import { dliLanguageName } from "../dli.js";
import * as cls from "../dliclass.js";
import { LEVELS, LEVEL_WEEKS, activity, csvText, joinedOf, levelCounts, pasteText, sheetRows, totals, weeksAgo } from "../dliweeks.js";
import { codeBox, codeProblem, dayLabel, percent, signInSpot, weeksTable } from "./dlishare.js";
import { askName, confirmBox, openModal } from "./modal.js";
import { classLessonsPart } from "./lessonteach.js";

const SHOW_KEY = "tamkeenDliTeacher"; // "on" / "off": the tick of "I'm a DLI teacher" on this device
const NOTES_KEY = "tamkeenDliNotes";  // { student id: note }, this device only
const RANGES = [[1, "This week"], [4, "4 weeks"], [12, "12 weeks"]];

const read = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key, value) => { try { localStorage.setItem(key, value); } catch { /* storage off */ } };
function notes() { try { const v = JSON.parse(read(NOTES_KEY) || "{}"); return v && typeof v === "object" ? v : {}; } catch { return {}; } }
function setNote(id, text) {
  const all = notes();
  const clean = String(text || "").replace(/\s+/g, " ").trim().slice(0, 80);
  if (clean) all[id] = clean; else delete all[id];
  write(NOTES_KEY, JSON.stringify(all));
}

async function copyText(text, said) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = h(`<textarea style="position:fixed;opacity:0"></textarea>`);
    area.value = text;
    document.body.append(area);
    area.select();
    try { document.execCommand("copy"); } catch { /* nothing more to try */ }
    area.remove();
  }
  toast(said);
}

/** "This week", "Last week", "3 weeks ago" or "–" for the newest week with an answer. */
function lastStudied(active, current) {
  if (!active) return "–";
  const n = weeksAgo(active, current);
  return n <= 0 ? t("This week") : n === 1 ? t("Last week") : t("{0} weeks ago", n);
}

/** What each activity level is called (dliweeks.js activity). */
const LEVEL_NAMES = { active: "Active", some: "Some", little: "A little", stopped: "Stopped", none: "Not started" };
/** "4.2 days a week" and the like, for an activity level. */
function levelText(a) {
  if (a.level === "none") return t("Hasn't studied yet");
  if (a.level === "stopped") return t("Nothing this week or last");
  return a.perWeek === 1 ? t("1 day a week") : t("{0} days a week", a.perWeek.toLocaleString());
}
/** An activity level as a small coloured word. */
function levelTag(level) {
  const el = h(`<span class="dlt-lvl"></span>`);
  el.classList.add(`lvl-${level}`);
  el.textContent = t(LEVEL_NAMES[level]);
  return el;
}

/** How many students are at each level, and the minutes a week they study on average, over `range` weeks. */
function levelSummary(students, current, range) {
  const counts = levelCounts(students, current);
  const minutes = students.length ? students.reduce((sum, s) => sum + totals(s.weeks, current, range).total, 0) / students.length / range : 0;
  const el = h(`<div class="dls-facts dlt-levels"></div>`);
  for (const level of LEVELS) {
    const tile = h(`<div><span class="small muted"></span><strong translate="no"></strong></div>`);
    tile.firstElementChild.append(levelTag(level));
    tile.querySelector("strong").textContent = counts[level].toLocaleString();
    el.append(tile);
  }
  const avg = h(`<div><span class="small muted">Minutes a week, on average</span><strong translate="no"></strong></div>`);
  avg.querySelector("strong").textContent = Math.round(minutes).toLocaleString();
  el.append(avg);
  return el;
}

/** What the levels mean, under a table. */
const levelsFoot = () => t("Days and minutes count flashcards, listening, watching and reading in the DLI language. Activity is days studied a week over the last {0} weeks (from when they joined): Active 4 or more, Some 2 or 3, A little under 2, Stopped when nothing this week or last.", LEVEL_WEEKS);

/** A row of choices, one on: [[value, label], …]. `pick(value)` runs on a tap. */
function choices(list, value, pick) {
  const bar = h(`<div class="dlt-seg" role="radiogroup">${list.map(([v, label]) =>
    `<button type="button" role="radio" data-v="${esc(v)}">${esc(label)}</button>`).join("")}</div>`);
  const paint = (now) => {
    for (const b of bar.querySelectorAll("button")) {
      const on = b.dataset.v === String(now);
      b.classList.toggle("on", on);
      b.setAttribute("aria-checked", String(on));
    }
  };
  bar.onclick = (e) => { const b = e.target.closest("button"); if (b) { paint(b.dataset.v); pick(b.dataset.v); } };
  paint(value);
  return bar;
}

/** A code shown large, with Copy. */
function codeTile(label, code, hint = "") {
  const el = h(`<div class="dlt-codetile"><span class="small muted"></span><strong translate="no"></strong>
    <button type="button" class="ghost">Copy</button><span class="small muted dlt-codehint"></span></div>`);
  el.firstElementChild.textContent = label;
  el.querySelector("strong").textContent = cls.spaced(code) || "–";
  el.querySelector(".dlt-codehint").textContent = hint;
  el.querySelector("button").onclick = () => copyText(cls.spaced(code), t("Copied."));
  return el;
}

/** The students' numbers over the last `range` weeks, in a table whose headings sort it.
 *  `more`: extra columns after the name ([{ label, get(student) }]); `open(student)`: a tap on a row. */
function studentsTable(students, { range, current, more = [], open }) {
  const marks = notes();
  const rows = students.map((s) => ({ s, tot: totals(s.weeks, current, range), act: activity(s.weeks, current, joinedOf(s)) }));
  const columns = [
    { label: "Student", sort: (r) => r.s.username.toLowerCase() },
    ...more.map((m) => ({ label: m.label, sort: (r) => m.get(r.s).toLowerCase(), cell: (r) => m.get(r.s) })),
    { label: "Joined", sort: (r) => joinedOf(r.s) || "9" },
    { label: "Activity level", sort: (r) => LEVELS.indexOf(r.act.level) * 100 - r.act.perWeek },
    { label: "Days", sort: (r) => -r.tot.active_days },
    { label: "Minutes", sort: (r) => -r.tot.total },
    { label: "Reviews", sort: (r) => -r.tot.reviews },
    { label: "% remembered", sort: (r) => -(r.tot.reviews ? r.tot.remembered / r.tot.reviews : -1) },
    { label: "New words", sort: (r) => -r.tot.new_words },
    { label: "Words known", sort: (r) => -r.tot.known },
    { label: "Last studied", sort: (r) => (r.tot.active ? weeksAgo(r.tot.active, current) : 1e9), cell: (r) => lastStudied(r.tot.active, current) },
  ];
  const wrap = h(`<div class="dls-scroll"><table class="dls-table dlt-table"><thead><tr>${columns.map((c, i) =>
    `<th><button type="button" class="dlt-sort" data-i="${i}">${c.label}</button></th>`).join("")}</tr></thead><tbody></tbody></table></div>`);
  const body = wrap.querySelector("tbody");
  let by = 0;
  const paint = () => {
    const sorted = [...rows].sort((a, b) => {
      const x = columns[by].sort(a), y = columns[by].sort(b);
      return x < y ? -1 : x > y ? 1 : a.s.username.localeCompare(b.s.username);
    });
    body.innerHTML = "";
    for (const r of sorted) {
      const tot = r.tot;
      const numbers = [tot.active_days, tot.total, tot.reviews, percent(tot), tot.new_words, tot.known].map((v) => (typeof v === "number" ? v.toLocaleString() : v));
      const tr = h(`<tr tabindex="0"><td><strong translate="no"></strong><span class="small muted dlt-note" translate="no"></span></td>
        ${more.map(() => `<td class="dlt-more" translate="no"></td>`).join("")}
        <td class="dlt-joined" translate="no"></td><td class="dlt-act"></td>
        ${numbers.map((v) => `<td translate="no">${esc(v)}</td>`).join("")}<td></td></tr>`);
      tr.querySelector("strong").textContent = r.s.username;
      tr.querySelector(".dlt-note").textContent = marks[r.s.id] || "";
      tr.querySelectorAll(".dlt-more").forEach((td, i) => { td.textContent = more[i].get(r.s); });
      tr.querySelector(".dlt-joined").textContent = dayLabel(joinedOf(r.s)) || "–";
      const act = tr.querySelector(".dlt-act");
      act.append(levelTag(r.act.level));
      act.title = levelText(r.act);
      // (the minutes by kind, on hover)
      tr.children[more.length + 4].title = t("Flashcards {0} · Listening {1} · Watching {2} · Reading {3}",
        tot.minutes.toLocaleString(), tot.listening.toLocaleString(), tot.watching.toLocaleString(), tot.reading.toLocaleString());
      tr.lastElementChild.textContent = lastStudied(r.tot.active, current);
      tr.onclick = () => open(r.s);
      tr.onkeydown = (e) => { if (e.key === "Enter") open(r.s); };
      body.append(tr);
    }
    for (const b of wrap.querySelectorAll(".dlt-sort")) b.classList.toggle("on", Number(b.dataset.i) === by);
  };
  wrap.querySelector("thead").onclick = (e) => { const b = e.target.closest(".dlt-sort"); if (b) { by = Number(b.dataset.i); paint(); } };
  paint();
  return wrap;
}

/** One student: their weeks, the teacher's private note, and the way out (`remove`: { label, text, ok, run }). */
function studentBox(student, { remove, changed = () => {} }) {
  const box = openModal({ title: student.username, wide: true, cls: "dlt-back" });
  const view = h(`<div class="dls dls-what-box">
    <div class="dls-facts">
      <div><span class="small muted">DLI language</span><strong class="dlt-f-lang"></strong></div>
      <div><span class="small muted dlt-f-sincelabel"></span><strong class="dlt-f-since" translate="no"></strong></div>
      <div><span class="small muted dlt-f-level"></span><strong class="dlt-f-pace"></strong></div>
    </div>
    <div class="dlt-weeks"></div>
    <label class="dlt-notebox"><span class="small muted">Your note (stays on this device, never sent)</span>
      <input type="text" maxlength="80" autocomplete="off" translate="no"></label>
    <div class="set-actions"><button type="button" class="ghost danger dlt-remove"></button></div>
  </div>`);
  view.querySelector(".dlt-f-lang").textContent = student.language ? t(dliLanguageName(student.language)) : "–";
  view.querySelector(".dlt-f-sincelabel").textContent = student.joined_at ? t("In this class since") : t("Joined");
  view.querySelector(".dlt-f-since").textContent = dayLabel(joinedOf(student)) || "–";
  const act = activity(student.weeks, cls.thisWeek(), joinedOf(student));
  view.querySelector(".dlt-f-level").append(levelTag(act.level));
  view.querySelector(".dlt-f-pace").textContent = levelText(act);
  view.querySelector(".dlt-weeks").append(student.weeks.length ? weeksTable(student.weeks)
    : h(`<p class="small muted">No numbers yet. They arrive after the student reviews flashcards with the app open.</p>`));
  const note = view.querySelector(".dlt-notebox input");
  note.value = notes()[student.id] || "";
  note.onchange = () => { setNote(student.id, note.value); changed(); };
  const out = view.querySelector(".dlt-remove");
  out.textContent = remove.label;
  out.onclick = async () => {
    if (!(await confirmBox(remove.title, remove.text, { ok: remove.ok, danger: true }))) return;
    try { await remove.run(); box.close(); changed(); } catch (err) { toast(err.message, { error: true }); }
  };
  box.body.append(view);
}

/** A class as its teacher sees it. `changed` runs when the class was renamed, left or deleted. */
export function openClass(klass, { changed = () => {} } = {}) {
  const box = openModal({ title: klass.name, wide: true, cls: "dlt-back" });
  const view = h(`<div class="dls dlt-class"><p class="small muted">Loading…</p></div>`);
  box.body.append(view);
  let range = 4;
  let report = null;

  async function load() {
    try { report = await cls.classReport(klass.id, 12); } catch (err) {
      view.innerHTML = "";
      const p = h(`<p class="small muted"></p>`);
      p.textContent = err.message;
      view.append(p);
      return;
    }
    paint();
  }

  function paint() {
    const c = report.class || klass;
    box.setTitle(c.name);
    view.innerHTML = "";
    const codes = h(`<div class="dlt-codes"></div>`);
    codes.append(codeTile(t("Class code"), c.code, t("Students type it in Settings → DLI students.")),
      codeTile(t("Code for another teacher"), c.staff_code, t("A teacher types it under “I'm a DLI teacher”.")));
    view.append(codes);
    const head = h(`<div class="dlt-head"><h3></h3></div>`);
    head.querySelector("h3").textContent = report.students.length === 1 ? t("1 student") : t("{0} students", report.students.length);
    head.append(choices(RANGES.map(([n, label]) => [n, t(label)]), range, (v) => { range = Number(v); paint(); }));
    view.append(head);
    if (!report.students.length) {
      view.append(h(`<div class="dli-soon"><p>No students yet. Give them the class code: they join in Settings → DLI students.</p></div>`));
    } else {
      view.append(levelSummary(report.students, cls.thisWeek(), range));
      view.append(studentsTable(report.students, { range, current: cls.thisWeek(),
        more: [{ label: "Language", get: (s) => (s.language ? t(dliLanguageName(s.language)) : "") }], open: (s) => studentBox(s, {
        changed: load,
        remove: { label: t("Remove from the class"), title: t("Remove {0} from the class?", s.username),
          text: t("You stop seeing their numbers. They can join again with the class code."), ok: t("Remove"),
          run: () => cls.removeStudent(klass.id, s.id) },
      }) }));
      const foot = h(`<p class="small muted dlt-foot"></p>`);
      foot.textContent = `${levelsFoot()} ${t("Tap a student for their weeks; tap a heading to sort.")}`;
      view.append(foot);
    }
    view.append(classLessonsPart(klass.id)); // the lessons sent to the class (lessonteach.js)
    const acts = h(`<div class="set-actions dlt-acts"><button type="button" data-a="rename">Rename</button>
      <button type="button" data-a="codes">New codes</button><button type="button" class="ghost danger" data-a="leave">Leave the class</button>
      <button type="button" class="ghost danger" data-a="delete">Delete the class</button></div>`);
    acts.onclick = async (e) => {
      const a = e.target.closest("button") && e.target.closest("button").dataset.a;
      try {
        if (a === "rename") {
          const name = (await askName(t("Rename the class"), t("Class name"), { value: c.name, ok: t("Save") })).slice(0, cls.CLASS_NAME_MAX);
          if (name && name !== c.name) { await cls.renameClass(klass.id, name); changed(); load(); }
        } else if (a === "codes") {
          if (await confirmBox(t("Make new codes for this class?"), t("The old codes stop working. Everyone already in the class stays."), { ok: t("New codes") })) {
            await cls.newCodes(klass.id); changed(); load();
          }
        } else if (a === "leave") {
          if (await confirmBox(t("Leave the class {0}?", c.name), t("You stop seeing its students. If you are its only teacher, the class closes."),
            { ok: t("Leave"), danger: true })) { await cls.leaveClass(klass.id); box.close(); changed(); }
        } else if (a === "delete") {
          if (await confirmBox(t("Delete {0}?", c.name), t("The class closes for every teacher and student in it. The students' own records stay."),
            { ok: t("Delete"), danger: true })) { await cls.deleteClass(klass.id); box.close(); changed(); }
        }
      } catch (err) { toast(err.message, { error: true }); }
    };
    view.append(acts);
  }

  load();
  return box;
}

/** Every DLI student, for the owner. */
export function openOwner() {
  const box = openModal({ title: t("All DLI students"), wide: true, cls: "dlt-back" });
  const view = h(`<div class="dls dlt-class"><p class="small muted">Loading…</p></div>`);
  box.body.append(view);
  let range = 4, language = "", klass = "";
  let report = null;

  async function load() {
    try { report = await cls.ownerReport(12); } catch (err) {
      view.innerHTML = "";
      const p = h(`<p class="small muted"></p>`);
      p.textContent = err.message;
      view.append(p);
      return;
    }
    paint();
  }

  /** Everything on record (two years at most), for the spreadsheet. */
  async function sheet() {
    const all = await cls.ownerReport(104);
    return sheetRows(all.students.map((s) => ({ ...s, language: s.language ? dliLanguageName(s.language) : "" })));
  }

  function paint() {
    view.innerHTML = "";
    const tiles = h(`<div class="dls-facts">
      <div><span class="small muted">Students</span><strong translate="no">${report.students.length}</strong></div>
      <div><span class="small muted">Teachers</span><strong translate="no">${report.teachers.length}</strong></div>
      <div><span class="small muted">Classes</span><strong translate="no">${report.classes.length}</strong></div></div>`);
    view.append(tiles);

    const langs = [...new Set(report.students.map((s) => s.language).filter(Boolean))];
    const classes = [...new Set(report.students.flatMap((s) => s.classes))].sort((a, b) => a.localeCompare(b));
    const filters = h(`<div class="dlt-head dlt-filters">
      <select class="dlt-lang" aria-label="Language"><option value="">All languages</option></select>
      <select class="dlt-klass" aria-label="Class" translate="no"></select></div>`);
    const langPick = filters.querySelector(".dlt-lang");
    for (const code of langs) { const o = h(`<option></option>`); o.value = code; o.textContent = t(dliLanguageName(code)); langPick.append(o); }
    langPick.value = langs.includes(language) ? language : (language = "");
    langPick.onchange = () => { language = langPick.value; paint(); };
    const klassPick = filters.querySelector(".dlt-klass");
    klassPick.append(Object.assign(h(`<option value=""></option>`), { textContent: t("All classes") }),
      Object.assign(h(`<option value=" none "></option>`), { textContent: t("Not in a class") }));
    for (const name of classes) { const o = h(`<option></option>`); o.value = name; o.textContent = name; klassPick.append(o); }
    klassPick.value = klass === " none " || classes.includes(klass) ? klass : (klass = "");
    klassPick.onchange = () => { klass = klassPick.value; paint(); };
    filters.append(choices(RANGES.map(([n, label]) => [n, t(label)]), range, (v) => { range = Number(v); paint(); }));
    view.append(filters);

    const shown = report.students.filter((s) => (!language || s.language === language)
      && (!klass || (klass === " none " ? !s.classes.length : s.classes.includes(klass))));
    if (!report.students.length) {
      view.append(h(`<div class="dli-soon"><p>No DLI students yet. They show here once they agree to share in Settings → DLI students.</p></div>`));
    } else if (!shown.length) {
      view.append(h(`<div class="dli-soon"><p>No students match.</p></div>`));
    } else {
      view.append(levelSummary(shown, cls.thisWeek(), range));
      view.append(studentsTable(shown, { range, current: cls.thisWeek(),
        more: [{ label: "Language", get: (s) => (s.language ? t(dliLanguageName(s.language)) : "") }, { label: "Class", get: (s) => s.classes.join(", ") }],
        open: (s) => studentBox(s, { changed: load,
          remove: { label: t("Delete this student's DLI record"), title: t("Delete {0}'s DLI record?", s.username),
            text: t("Their record, classes and weekly numbers are deleted. Their DLI content locks until they share again."), ok: t("Delete"),
            run: () => cls.ownerRemoveStudent(s.id) } }) }));
    }

    const out = h(`<div class="set-actions dlt-acts"><button type="button" class="primary" data-a="copy">Copy for a spreadsheet</button>
      <button type="button" data-a="csv">Download .csv</button></div>`);
    if (window.pywebview) out.querySelector('[data-a="csv"]').hidden = true; // (the computer's window can't save a made-up file: Copy does it)
    out.onclick = async (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      b.disabled = true;
      try {
        const rows = await sheet();
        if (b.dataset.a === "copy") await copyText(pasteText(rows), t("Copied. Paste it into Excel or Google Sheets."));
        else {
          const a = document.createElement("a");
          a.href = URL.createObjectURL(new Blob(["﻿", csvText(rows)], { type: "text/csv;charset=utf-8" }));
          a.download = `tamkeen-dli-students-${cls.thisWeek()}.csv`;
          document.body.append(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(a.href), 60000);
        }
      } catch (err) { toast(err.message, { error: true }); } finally { b.disabled = false; }
    };
    const foot = h(`<p class="small muted dlt-foot"></p>`);
    foot.textContent = `${levelsFoot()} ${t("The spreadsheet has a row for each student for each week on record, to set beside your grades.")}`;
    view.append(out, foot);

    // The teacher code, and the teachers.
    view.append(h(`<h3>Teacher code</h3>`), h(`<p class="set-hint">Give it to DLI teachers. Whoever types it can make classes; they see only the students who join them.</p>`));
    const codes = h(`<div class="dlt-codes"></div>`);
    codes.append(codeTile(t("Teacher code"), report.teacher_code));
    view.append(codes);
    const fresh = h(`<div class="set-actions dlt-acts"><button type="button">Make a new teacher code</button></div>`);
    fresh.querySelector("button").onclick = async () => {
      if (!(await confirmBox(t("Make a new teacher code?"), t("The old code stops working. Teachers who already used it stay teachers."), { ok: t("New code") }))) return;
      try { await cls.ownerNewTeacherCode(); load(); } catch (err) { toast(err.message, { error: true }); }
    };
    view.append(fresh, h(`<h3>Teachers</h3>`));
    const list = h(`<div class="dls-list"></div>`);
    if (!report.teachers.length) list.append(h(`<p class="small muted dls-none">No teachers yet.</p>`));
    for (const who of report.teachers) {
      const row = h(`<div class="dls-row"><span class="dls-row-text"><strong translate="no"></strong><span class="small muted"></span></span>
        <button type="button" class="ghost danger">Remove</button></div>`);
      row.querySelector("strong").textContent = who.username || "–";
      row.querySelector(".muted").textContent = who.classes === 1 ? t("1 class, since {0}", dayLabel(who.since))
        : t("{0} classes, since {1}", who.classes, dayLabel(who.since));
      row.querySelector("button").onclick = async () => {
        if (!(await confirmBox(t("Remove this teacher?"), t("They leave their classes and stop seeing students. A class with no teacher left closes."),
          { ok: t("Remove"), danger: true }))) return;
        try { await cls.ownerRemoveTeacher(who.id); load(); } catch (err) { toast(err.message, { error: true }); }
      };
      list.append(row);
    }
    view.append(list);
  }

  load();
  return box;
}

/** The card "I'm a DLI teacher", appended to `body` (Settings → DLI students). Returns a cleanup function. */
export function teachCard(body) {
  const card = h(`<section class="card set-card stack dli-card dlt-card" data-find="dliteacher">
    <label class="check dli-student"><input type="checkbox">
      <span><span class="dli-student-title">I'm a DLI teacher</span><span class="small muted dli-sub">Make classes and follow your students' practice</span></span></label>
    <div class="dlt-body dls" hidden></div>
  </section>`);
  body.append(card);
  const tick = card.querySelector("input");
  const part = card.querySelector(".dlt-body");
  let alive = true;

  async function paint() {
    const r = await cls.refresh();
    if (!alive) return;
    card.hidden = !!r.notReady; // (no DLI classes online yet)
    if (r.notReady) return;
    const me = r.me;
    const is = !!(me && (me.teacher || me.owner));
    const flag = read(SHOW_KEY);
    tick.checked = flag === "on" || (flag !== "off" && is);
    part.hidden = !tick.checked;
    part.innerHTML = "";
    if (!tick.checked) return;
    if (!r.signedIn) {
      const box = h(`<div class="dls-step dli-part"><p class="set-hint">Sign in with your Google account, then enter the teacher code you were given.</p>
        <div class="dls-signin"></div></div>`);
      part.append(box);
      signInSpot(box.querySelector(".dls-signin"), () => { if (alive) paint(); });
      return;
    }
    if (!me) {
      const box = h(`<div class="dls-step dli-part"><p class="set-hint"></p><div class="set-actions"><button type="button">Try again</button></div></div>`);
      box.querySelector("p").textContent = (r.error && r.error.message) || "";
      box.querySelector("button").onclick = paint;
      part.append(box);
      return;
    }
    if (!is) { enterCode(); return; }
    teacher(me);
  }

  /** What a code typed in this card did: a toast for what isn't this card's business, true when it was used. */
  async function typed(code) {
    const r = await cls.useCode(code);
    if (r.status === "teacher") toast("You can now make classes.");
    else if (r.status === "owner") toast("This account is now Tamkeen's owner for DLI.");
    else if (r.status === "coteacher") toast(t("You now teach {0} too.", r.name));
    else if (r.status === "joined") toast(t("You're in {0}.", r.name));
    else { toast(codeProblem(r.status), { error: true }); return false; }
    if (alive) paint();
    return true;
  }

  function enterCode() {
    const box = h(`<div class="dls-step dli-part"><h3>Teacher code</h3>
      <p class="set-hint">The code Tamkeen gave you. With it you make classes and see the students who join them: their username and
        weekly study numbers, never their words.</p></div>`);
    box.append(codeBox({ label: t("Teacher code"), placeholder: "TCH-…", button: t("Continue"), go: typed }));
    part.append(box);
  }

  function teacher(me) {
    const box = h(`<div class="dls-step dli-part">
      <p class="set-hint dlt-seenas"></p>
      <h3>My classes</h3>
      <div class="dls-list"></div>
      <div class="set-actions"><button type="button" class="primary dlt-new">New class</button></div>
      <h3>Another teacher's class</h3>
      <p class="set-hint">To teach a class together, type the code for another teacher that its teacher gave you.</p>
    </div>`);
    // (by username: no one's real name is kept. "user-…" is the database's stand-in for someone with no username yet)
    const seen = (me.teacher && me.teacher.username) || "";
    box.querySelector(".dlt-seenas").textContent = seen && !seen.startsWith("user-")
      ? t("Your students see you as {0}. You can change your username in Settings → Account & sync.", seen)
      : t("Choose a username in Settings → Account & sync so your students know who you are. Pick a nickname, not your real name.");
    const list = box.querySelector(".dls-list");
    const mine = me.classes.filter((c) => c.role === "teacher");
    if (!mine.length) list.append(h(`<p class="small muted dls-none">No classes yet. Make one, then give your students its code.</p>`));
    for (const c of mine) {
      const row = h(`<button type="button" class="dls-row dlt-classrow"><span class="dls-row-text"><strong translate="no"></strong>
        <span class="small muted"></span></span><span class="dlt-chev">${icon("chevron", 18)}</span></button>`);
      row.querySelector("strong").textContent = c.name;
      row.querySelector(".muted").textContent = [c.students === 1 ? t("1 student") : t("{0} students", c.students),
        t("code {0}", cls.spaced(c.code))].join(" · ");
      row.onclick = () => openClass(c, { changed: () => { if (alive) paint(); } });
      list.append(row);
    }
    box.querySelector(".dlt-new").onclick = async () => {
      const title = (await askName(t("Name the class"), t("Class name"), { ok: t("Make the class") })).slice(0, cls.CLASS_NAME_MAX);
      if (!title) return;
      try {
        const made = await cls.createClass(title);
        if (!alive) return;
        await paint();
        if (made) openClass(made, { changed: () => { if (alive) paint(); } });
      } catch (err) { toast(err.message, { error: true }); }
    };
    box.append(codeBox({ label: t("Code for another teacher"), placeholder: "CO-…", button: t("Join"), go: typed }));
    part.append(box);
    if (me.owner) {
      const own = h(`<div class="dls-step dli-part"><h3>Tamkeen's owner</h3>
        <div class="dls-list"><button type="button" class="dls-row dlt-classrow"><span class="dls-row-text"><strong>All DLI students</strong>
          <span class="small muted">Everyone who shares, by language and class, with a copy for a spreadsheet</span></span>
          <span class="dlt-chev">${icon("chevron", 18)}</span></button></div></div>`);
      own.querySelector("button").onclick = () => openOwner();
      part.append(own);
    }
  }

  tick.onchange = () => { write(SHOW_KEY, tick.checked ? "on" : "off"); paint(); };
  const onShare = () => { if (alive) paint(); };
  window.addEventListener(cls.SHARE_EVENT, onShare);
  paint();
  return () => { alive = false; window.removeEventListener(cls.SHARE_EVENT, onShare); };
}

// ---------- looks (added once; plain solid surfaces) ----------
if (typeof document !== "undefined" && !document.getElementById("dlt-css")) {
  const style = document.createElement("style");
  style.id = "dlt-css";
  style.textContent = `
    .dlt-card[hidden], .dlt-body[hidden] { display: none; }
    .dlt-back .modal-box.wide { width: min(940px, 100%); box-shadow: none; }
    .dlt-class { display: flex; flex-direction: column; gap: 12px; }
    .dlt-class h3 { margin: 6px 0 0; }
    .dlt-class .set-hint { margin: 0; }
    .dlt-codes { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px; }
    .dlt-codetile { border: 1px solid var(--border); border-radius: 14px; background: var(--surface); padding: 12px; display: flex; flex-direction: column;
      align-items: center; gap: 4px; text-align: center; }
    .dlt-codetile strong { font-size: 26px; letter-spacing: 0.08em; overflow-wrap: anywhere; }
    .dlt-codetile button { min-height: 36px; }
    .dlt-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
    .dlt-head h3 { margin: 0; }
    .dlt-filters select { min-height: 40px; max-width: 100%; }
    .dlt-seg { display: inline-flex; border: 1px solid var(--border); border-radius: 12px; overflow: hidden; background: var(--surface); }
    .dlt-seg button { border: 0; border-radius: 0; background: none; min-height: 40px; padding: 0 14px; font-weight: 600; color: var(--muted); }
    .dlt-seg button.on, .dlt-seg button.on:hover:not(:disabled) { background: var(--accent); color: var(--accent-ink); }
    .dlt-table tbody tr { cursor: pointer; }
    .dlt-table tbody tr:hover, .dlt-table tbody tr:focus-visible { background: var(--surface-2); outline: none; }
    .dlt-table td:first-child { display: flex; flex-direction: column; gap: 1px; white-space: normal; min-width: 120px; }
    .dlt-sort { border: 0; background: none; padding: 0; min-height: 0; font: inherit; color: inherit; font-weight: 600; }
    .dlt-sort:hover:not(:disabled) { background: none; color: var(--text); }
    .dlt-sort.on { color: var(--accent); }
    .dlt-foot { margin: 0; text-align: center; }
    .dlt-acts { justify-content: center; flex-wrap: wrap; }
    .dlt-notebox { display: flex; flex-direction: column; gap: 4px; }
    .dlt-notebox input { min-height: 44px; font-size: 16px; }
    .dlt-classrow { width: 100%; text-align: start; border: 0; border-radius: 0; background: none; color: var(--text); font: inherit; }
    .dlt-classrow:hover:not(:disabled) { background: var(--surface-2); }
    .dlt-chev { display: inline-flex; color: var(--muted); flex: none; }
    .dlt-lvl { font-weight: 700; white-space: nowrap; }
    .dlt-lvl.lvl-active { color: var(--accent); }
    .dlt-lvl.lvl-some { color: var(--text); }
    .dlt-lvl.lvl-little { color: var(--warn); }
    .dlt-lvl.lvl-stopped { color: var(--danger); }
    .dlt-lvl.lvl-none { color: var(--muted); }
    .dlt-levels { grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); }
    .dlt-levels > div { align-items: center; text-align: center; }
    .dlt-joined { white-space: nowrap; }
  `;
  document.head.append(style);
}
