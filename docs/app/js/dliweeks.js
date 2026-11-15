// A DLI student's week in numbers: what their teachers and Tamkeen's developer see (dliclass.js sends it,
// supabase/v10-dli-classes.sql keeps it). Worked out on the device from the saved words of the DLI language
// and the flashcard answers on record. Numbers only: never a word, a meaning or a sentence.
//
//   days        days of the week with at least one flashcard answer
//   minutes     time spent looking at flashcards (a look counts 60 seconds at most)
//   reviews     flashcard answers given
//   remembered  how many of them were "Remembered"
//   new_words   words answered for the first time
//   words       words saved in the language (as of now)
//   known       of those, the ones remembered at least once by the end of the week
//
// A week starts on Monday, on the device's own calendar. Pure: shared by every version, tested in
// tests/js/dliweeks.test.mjs.

import { DLI_CODES } from "./dli.js";
import { GOOD, history } from "./review/fsrs.js";

const LOOK_CAP = 60000;

/** The Monday of the week that local day number `day` is in (review/fsrs.js dayNumber; day 0 was a Thursday). */
export const weekStart = (day) => day - ((((day + 3) % 7) + 7) % 7);
/** "2026-11-09" for a day number, and back. */
export const dayDate = (day) => new Date(day * 86400000).toISOString().slice(0, 10);
export const dateDay = (text) => Math.round(Date.parse(`${String(text).slice(0, 10)}T00:00:00Z`) / 86400000);

/** The numbers of the week that starts on day `start`. `words`: the saved words of the language; `log`: every
 *  answer by word, { uid: [[t, rating, day, ms], …] }. */
export function weekNumbers(words, log, start) {
  const end = start + 6;
  const days = new Set();
  let ms = 0, reviews = 0, remembered = 0, fresh = 0, saved = 0, known = 0;
  for (const w of Array.isArray(words) ? words : []) {
    if (!w || w.deleted) continue;
    saved++;
    let knew = false;
    for (const step of history((log || {})[String(w.uid || w.id)])) {
      const day = step.after.day;
      if (day > end) break;
      if (step.rating === GOOD) knew = true;
      if (day < start) continue;
      days.add(day);
      reviews++;
      if (step.rating === GOOD) remembered++;
      if (!step.before) fresh++;
      ms += Math.min(Math.max(step.ms, 0), LOOK_CAP);
    }
    if (knew) known++;
  }
  return { week: dayDate(start), days: days.size, minutes: Math.round(ms / 60000), reviews, remembered, new_words: fresh, words: saved, known };
}

const NUMBERS = ["days", "minutes", "reviews", "remembered", "new_words", "words", "known"];
const whole = (v, most) => (Number.isFinite(Number(v)) ? Math.min(most, Math.max(0, Math.round(Number(v)))) : 0);

/** One week as it arrived from the online service, made safe to show: a Monday's date and whole numbers in range,
 *  or null. */
export function cleanWeek(raw) {
  if (!raw || typeof raw !== "object" || !/^\d{4}-\d{2}-\d{2}$/.test(String(raw.week || ""))) return null;
  const out = { week: String(raw.week) };
  for (const k of NUMBERS) out[k] = whole(raw[k], k === "days" ? 7 : 1000000);
  return out;
}
/** A list of weeks, newest first, bad ones dropped. */
export const cleanWeeks = (list) => (Array.isArray(list) ? list : []).map(cleanWeek).filter(Boolean)
  .sort((a, b) => (a.week < b.week ? 1 : a.week > b.week ? -1 : 0));

/** The last `count` weeks up to the week starting on `current` (a date), added up: what the tables show.
 *  days, minutes, reviews, remembered and new words are sums; words and known are the newest week's;
 *  `active` is the newest week with any answer ("" when there is none in the list at all). */
export function totals(weeks, current, count) {
  const first = dayDate(dateDay(current) - 7 * (Math.max(1, count) - 1));
  const out = { days: 0, minutes: 0, reviews: 0, remembered: 0, new_words: 0, words: 0, known: 0, active: "" };
  const list = cleanWeeks(weeks);
  for (const w of list) {
    if (!out.active && w.reviews > 0) out.active = w.week;
    if (w.week > current || w.week < first) continue;
    for (const k of ["days", "minutes", "reviews", "remembered", "new_words"]) out[k] += w[k];
  }
  if (list.length) { out.words = list[0].words; out.known = list[0].known; }
  return out;
}

/** How many weeks ago `week` was, from the week starting on `current` (0 = this week). */
export const weeksAgo = (week, current) => Math.round((dateDay(current) - dateDay(week)) / 7);

/** Spreadsheet rows, one per student per week: [[header…], [row…], …]. `students`: [{ last_name, language,
 *  classes: [names], weeks }]. A student with no week yet still gets one row, so nobody is missing. */
export function sheetRows(students) {
  const rows = [["Last name", "Language", "Class", "Week starting", "Days studied", "Minutes", "Reviews", "Remembered",
    "New words", "Words saved", "Words known"]];
  for (const s of Array.isArray(students) ? students : []) {
    const who = [String(s.last_name || ""), String(s.language || ""), (Array.isArray(s.classes) ? s.classes : []).join("; ")];
    const weeks = cleanWeeks(s.weeks).reverse();
    if (!weeks.length) rows.push([...who, "", 0, 0, 0, 0, 0, 0, 0]);
    for (const w of weeks) rows.push([...who, w.week, w.days, w.minutes, w.reviews, w.remembered, w.new_words, w.words, w.known]);
  }
  return rows;
}

// A cell that a spreadsheet would run as a formula (a name typed as "=cmd…") gets a leading apostrophe.
const safeCell = (v) => { const s = String(v ?? ""); return /^[=+\-@\t\r]/.test(s) && typeof v !== "number" ? `'${s}` : s; };
/** The rows as a .csv file's text. */
export const csvText = (rows) => rows.map((r) => r.map((v) => { const s = safeCell(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; })
  .join(",")).join("\r\n");
/** The rows as text to paste into a spreadsheet (tabs between cells). */
export const pasteText = (rows) => rows.map((r) => r.map((v) => safeCell(v).replace(/[\t\r\n]+/g, " ")).join("\t")).join("\n");

// ---------- what arrives from the online service, checked before it is shown ----------
// (A friend's or a stranger's device can't write these, the database decides who reads what; but nothing that
// arrives is drawn without being cut to size and stripped of markup first.)

export const NAME_MAX = 40;
export const CLASS_NAME_MAX = 60;

const text = (v, most) => String(v ?? "").replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, most);
const uuid = (v) => (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || "")) ? String(v).toLowerCase() : "");
const when = (v) => (typeof v === "string" && Number.isFinite(Date.parse(v)) ? v : "");
const count = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Math.min(100000, Math.round(Number(v)))) : 0);
const codeText = (v, shape) => (shape.test(String(v || "")) ? String(v) : "");
const names = (list) => (Array.isArray(list) ? list : []).map((n) => text(n, NAME_MAX)).filter(Boolean).slice(0, 10);

/** A class, made safe: { id, name, role, teachers } and, for its teachers, { code, staff_code, students }. */
export function cleanClass(raw) {
  const id = uuid(raw && raw.id);
  if (!id) return null;
  const out = { id, name: text(raw.name, CLASS_NAME_MAX) || "Class", role: raw.role === "teacher" ? "teacher" : "student", teachers: names(raw.teachers) };
  if (out.role === "teacher") {
    out.code = codeText(raw.code, /^[A-Z2-9]{6}$/);
    out.staff_code = codeText(raw.staff_code, /^CO[A-Z2-9]{8}$/);
    out.students = count(raw.students);
  } else out.joined_at = when(raw.joined_at);
  return out;
}

/** What dli_me answered, made safe: { student, teacher, owner, classes, weeks }. */
export function cleanMe(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const s = r.student && typeof r.student === "object" ? r.student : null;
  const student = s && text(s.last_name, NAME_MAX) && DLI_CODES.includes(s.language)
    ? { last_name: text(s.last_name, NAME_MAX), language: s.language, agreed_at: when(s.agreed_at), agreed_version: count(s.agreed_version) || 1 } : null;
  const teacher = r.teacher && typeof r.teacher === "object" ? { name: text(r.teacher.name, NAME_MAX) } : null;
  return { student, teacher, owner: r.owner === true,
    classes: (Array.isArray(r.classes) ? r.classes : []).map(cleanClass).filter(Boolean).slice(0, 40),
    weeks: cleanWeeks(r.weeks) };
}

/** A list of students as a report gives it, made safe: [{ id, last_name, language, joined_at | agreed_at, classes, weeks }]. */
export function cleanStudents(list) {
  return (Array.isArray(list) ? list : []).map((s) => {
    const id = uuid(s && s.id);
    if (!id) return null;
    return { id, last_name: text(s.last_name, NAME_MAX) || "?", language: DLI_CODES.includes(s.language) ? s.language : "",
      joined_at: when(s.joined_at), agreed_at: when(s.agreed_at),
      classes: (Array.isArray(s.classes) ? s.classes : []).map((n) => text(n, CLASS_NAME_MAX)).filter(Boolean).slice(0, 10),
      weeks: cleanWeeks(s.weeks) };
  }).filter(Boolean);
}

/** What dli_owner_report answered, made safe: { students, teachers, classes, teacher_code }. */
export function cleanOwner(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  return {
    students: cleanStudents(r.students),
    teachers: (Array.isArray(r.teachers) ? r.teachers : []).map((t) => ({ id: uuid(t && t.id), name: text(t && t.name, NAME_MAX),
      username: text(t && t.username, 20), since: when(t && t.since), classes: count(t && t.classes) })).filter((t) => t.id),
    classes: (Array.isArray(r.classes) ? r.classes : []).map((c) => ({ id: uuid(c && c.id), name: text(c && c.name, CLASS_NAME_MAX),
      students: count(c && c.students), teachers: names(c && c.teachers) })).filter((c) => c.id),
    teacher_code: teacherCode(r.teacher_code),
  };
}
/** A teacher code as the owner reads it, or "". */
export const teacherCode = (v) => codeText(v, /^TCH[A-Z2-9]{12}$/);
/** What dli_use_code answered: { status, id, name }. */
export function cleanUse(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  return { status: /^[a-z_]{1,20}$/.test(String(r.status || "")) ? String(r.status) : "no", id: uuid(r.class), name: text(r.name, CLASS_NAME_MAX) };
}
/** A class's two codes: { code, staff_code }. */
export function cleanCodes(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  return { code: codeText(r.code, /^[A-Z2-9]{6}$/), staff_code: codeText(r.staff_code, /^CO[A-Z2-9]{8}$/) };
}

/** A code as it is read out and typed: in groups ("TCH-ABCD-EFGH-JKLM", "CO-ABCD-EFGH", "ABC-DEF"). */
export function spaced(code) {
  const c = String(code || "");
  if (/^TCH/.test(c)) return `TCH-${c.slice(3).replace(/(.{4})(?=.)/g, "$1-")}`;
  if (/^CO/.test(c)) return `CO-${c.slice(2).replace(/(.{4})(?=.)/g, "$1-")}`;
  return c.replace(/(.{3})(?=.)/g, "$1-");
}
