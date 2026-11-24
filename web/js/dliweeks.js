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
// and, from each device (dlitime.js; supabase/v11-dli-activity.sql adds the devices up):
//   listening, watching, reading   minutes in the DLI language (podcasts and audio; videos and reels; books
//                                  and web pages)
//   active_days days of the week with any of it, flashcards included (at least `days`)
//
// A week starts on Monday, on the device's own calendar. Pure: shared by every version, tested in
// tests/js/dliweeks.test.mjs.

import { DLI_CODES } from "./dli.js";
import { cleanNotes } from "./classnotes.js";
import { GOOD, history } from "./review/fsrs.js";

const LOOK_CAP = 60000;

/** The Monday of the week that local day number `day` is in (review/fsrs.js dayNumber; day 0 was a Thursday). */
export const weekStart = (day) => day - ((((day + 3) % 7) + 7) % 7);
/** "2026-11-09" for a day number, and back. */
export const dayDate = (day) => new Date(day * 86400000).toISOString().slice(0, 10);
export const dateDay = (text) => Math.round(Date.parse(`${String(text).slice(0, 10)}T00:00:00Z`) / 86400000);

/** The numbers of the week that starts on day `start`. `words`: the saved words of the language; `log`: every
 *  answer by word, { uid: [[t, rating, day, ms], …] }. */
export const weekNumbers = (words, log, start) => scanWeek(words, log, start).numbers;
/** The days of that week (day numbers) with at least one flashcard answer. */
export const answerDays = (words, log, start) => scanWeek(words, log, start).days;

function scanWeek(words, log, start) {
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
  return { days, numbers: { week: dayDate(start), days: days.size, minutes: Math.round(ms / 60000), reviews, remembered, new_words: fresh, words: saved, known } };
}

const NUMBERS = ["days", "minutes", "reviews", "remembered", "new_words", "words", "known"];
/** The time numbers: each device's share, added up by the database (none from an app before v0.61). */
export const TIME_NUMBERS = ["listening", "watching", "reading"];
const whole = (v, most) => (Number.isFinite(Number(v)) ? Math.min(most, Math.max(0, Math.round(Number(v)))) : 0);

/** One week as it arrived from the online service, made safe to show: a Monday's date and whole numbers in range,
 *  or null. */
export function cleanWeek(raw) {
  if (!raw || typeof raw !== "object" || !/^\d{4}-\d{2}-\d{2}$/.test(String(raw.week || ""))) return null;
  const out = { week: String(raw.week) };
  for (const k of NUMBERS) out[k] = whole(raw[k], k === "days" ? 7 : 1000000);
  for (const k of TIME_NUMBERS) out[k] = whole(raw[k], 10080);
  out.active_days = Math.max(out.days, whole(raw.active_days, 7));
  return out;
}

/** Did the student study at all that week (any flashcard, minute or day)? */
export const studied = (w) => w.active_days > 0 || w.reviews > 0 || w.listening + w.watching + w.reading > 0;
/** A list of weeks, newest first, bad ones dropped. */
export const cleanWeeks = (list) => (Array.isArray(list) ? list : []).map(cleanWeek).filter(Boolean)
  .sort((a, b) => (a.week < b.week ? 1 : a.week > b.week ? -1 : 0));

const SUMMED = ["days", "active_days", "minutes", ...TIME_NUMBERS, "reviews", "remembered", "new_words"];

/** The last `count` weeks up to the week starting on `current` (a date), added up: what the tables show.
 *  The weekly numbers are sums; words and known are the newest week's; `total` is every kind of minute;
 *  `active` is the newest week with any study ("" when there is none in the list at all). */
export function totals(weeks, current, count) {
  const first = dayDate(dateDay(current) - 7 * (Math.max(1, count) - 1));
  const out = { words: 0, known: 0, total: 0, active: "" };
  for (const k of SUMMED) out[k] = 0;
  const list = cleanWeeks(weeks);
  for (const w of list) {
    if (!out.active && studied(w)) out.active = w.week;
    if (w.week > current || w.week < first) continue;
    for (const k of SUMMED) out[k] += w[k];
  }
  out.total = out.minutes + out.listening + out.watching + out.reading;
  if (list.length) { out.words = list[0].words; out.known = list[0].known; }
  return out;
}

/** How many whole weeks before this one the activity level looks at. */
export const LEVEL_WEEKS = 4;
/** The activity levels, most first: what each means is in `activity` below. */
export const LEVELS = ["active", "some", "little", "stopped", "none"];

/** A student's activity level from their weeks, by the days a week they studied anything:
 *   active   4 or more days a week on average      some   2 or 3      little  less than 2
 *   stopped  studied before, but not this week or last      none  never studied since sharing
 *  The average is over the LEVEL_WEEKS whole weeks before `current` (a Monday's date), from the week they joined
 *  (`since`, a date or time; "" for any), so a student who joined two weeks ago is averaged over two; one who
 *  joined this week is judged on this week so far. Returns { level, perWeek } (days a week, one decimal). */
export function activity(weeks, current, since = "") {
  const list = cleanWeeks(weeks);
  if (!list.some(studied)) return { level: "none", perWeek: 0 };
  const cur = dateDay(current);
  if (!list.some((w) => studied(w) && dateDay(w.week) >= cur - 7 && dateDay(w.week) <= cur)) return { level: "stopped", perWeek: 0 };
  const joined = since ? weekStart(dateDay(since)) : -Infinity;
  const counted = [];
  for (let n = 1; n <= LEVEL_WEEKS; n++) if (cur - 7 * n >= joined) counted.push(dayDate(cur - 7 * n));
  if (!counted.length) counted.push(current);
  const days = list.filter((w) => counted.includes(w.week)).reduce((sum, w) => sum + w.active_days, 0);
  const perWeek = Math.round((10 * days) / counted.length) / 10;
  return { level: perWeek >= 4 ? "active" : perWeek >= 2 ? "some" : "little", perWeek };
}

/** When a student joined, as far as the one looking can tell: their class (a teacher's report), else the day they
 *  first agreed to share (the owner's, v11), else the day they last agreed. */
export const joinedOf = (s) => (s && (s.joined_at || s.since || s.agreed_at)) || "";

/** How many students are at each level: { active: n, … }. `students`: [{ weeks, joined_at | since | agreed_at }]. */
export function levelCounts(students, current) {
  const out = Object.fromEntries(LEVELS.map((l) => [l, 0]));
  for (const s of Array.isArray(students) ? students : []) out[activity(s.weeks, current, joinedOf(s)).level]++;
  return out;
}

/** How many weeks ago `week` was, from the week starting on `current` (0 = this week). */
export const weeksAgo = (week, current) => Math.round((dateDay(current) - dateDay(week)) / 7);

/** "2026-11-03" for a time, on this device's calendar (as the tables show it), or "". */
export function localDate(when) {
  const d = new Date(when || "");
  if (!when || Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Spreadsheet rows, one per student per week: [[header…], [row…], …]. `students`: [{ username, language,
 *  classes: [names], agreed_at | joined_at, weeks }]. A student with no week yet still gets one row, so nobody is
 *  missing. "Days studied" counts any study; "Flashcard days" only the days with flashcard answers. */
export function sheetRows(students) {
  const rows = [["Username", "Language", "Class", "Joined", "Week starting", "Days studied", "Flashcard days", "Flashcard minutes",
    "Listening minutes", "Watching minutes", "Reading minutes", "Total minutes", "Reviews", "Remembered", "New words", "Words saved", "Words known"]];
  for (const s of Array.isArray(students) ? students : []) {
    const who = [String(s.username || ""), String(s.language || ""), (Array.isArray(s.classes) ? s.classes : []).join("; "),
      localDate(joinedOf(s))];
    const weeks = cleanWeeks(s.weeks).reverse();
    if (!weeks.length) rows.push([...who, "", 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    for (const w of weeks) rows.push([...who, w.week, w.active_days, w.days, w.minutes, w.listening, w.watching, w.reading,
      w.minutes + w.listening + w.watching + w.reading, w.reviews, w.remembered, w.new_words, w.words, w.known]);
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

/** A username as Tamkeen keeps them (social.js USERNAME_RE), or "user-" and six characters of the account's id from
 *  the database for someone with none yet (v11 private.dli_handle). DLI keeps no one's real name (the owner's rule,
 *  2026-11-16): students and teachers show to each other by username. */
export const NAME_MAX = 20;
export const CLASS_NAME_MAX = 60;
const handle = (v) => (/^[A-Za-z0-9_.-]{3,20}$/.test(String(v || "")) ? String(v) : "");

const text = (v, most) => String(v ?? "").replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, most);
const uuid = (v) => (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || "")) ? String(v).toLowerCase() : "");
const when = (v) => (typeof v === "string" && Number.isFinite(Date.parse(v)) ? v : "");
const count = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Math.min(100000, Math.round(Number(v)))) : 0);
const codeText = (v, shape) => (shape.test(String(v || "")) ? String(v) : "");
const names = (list) => (Array.isArray(list) ? list : []).map(handle).filter(Boolean).slice(0, 10);

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
  // (never a last name: a database without v11 still sends one, and it is left out here)
  const student = s && DLI_CODES.includes(s.language)
    ? { username: handle(s.username), language: s.language, agreed_at: when(s.agreed_at), joined_at: when(s.joined_at),
      agreed_version: count(s.agreed_version) || 1 } : null;
  const teacher = r.teacher && typeof r.teacher === "object" ? { username: handle(r.teacher.username) } : null;
  return { student, teacher, owner: r.owner === true,
    classes: (Array.isArray(r.classes) ? r.classes : []).map(cleanClass).filter(Boolean).slice(0, 40),
    weeks: cleanWeeks(r.weeks) };
}

/** A list of students as a report gives it, made safe: [{ id, username, language, joined_at | agreed_at, since, classes, weeks }].
 *  joined_at: when they joined the teacher's class; since: when they first agreed to share (the owner's report, v11). */
export function cleanStudents(list) {
  return (Array.isArray(list) ? list : []).map((s) => {
    const id = uuid(s && s.id);
    if (!id) return null;
    return { id, username: handle(s.username) || "?", language: DLI_CODES.includes(s.language) ? s.language : "",
      joined_at: when(s.joined_at), agreed_at: when(s.agreed_at), since: when(s.since),
      classes: (Array.isArray(s.classes) ? s.classes : []).map((n) => text(n, CLASS_NAME_MAX)).filter(Boolean).slice(0, 10),
      weeks: cleanWeeks(s.weeks) };
  }).filter(Boolean);
}

/** What dli_owner_report answered, made safe: { students, teachers, classes, teacher_code }. */
export function cleanOwner(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  return {
    students: cleanStudents(r.students),
    teachers: (Array.isArray(r.teachers) ? r.teachers : []).map((t) => ({ id: uuid(t && t.id),
      username: handle(t && t.username), since: when(t && t.since), classes: count(t && t.classes) })).filter((t) => t.id),
    classes: (Array.isArray(r.classes) ? r.classes : []).map((c) => ({ id: uuid(c && c.id), name: text(c && c.name, CLASS_NAME_MAX),
      students: count(c && c.students), teachers: names(c && c.teachers) })).filter((c) => c.id),
    teacher_code: teacherCode(r.teacher_code),
  };
}
/** A class's teachers as dli_class_teachers answers (v13), made safe: [{ id, username, added_at, me, can_drop }]. */
export function cleanTeachers(list) {
  return (Array.isArray(list) ? list : []).map((x) => ({ id: uuid(x && x.id), username: handle(x && x.username) || "?",
    added_at: when(x && x.added_at), me: !!x && x.me === true, can_drop: !!x && x.can_drop === true })).filter((x) => x.id).slice(0, 10);
}
/** What dli_add_teacher answered: { status, username }. */
export function cleanAdded(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  return { status: /^[a-z_]{1,20}$/.test(String(r.status || "")) ? String(r.status) : "no", username: handle(r.username) };
}
// ---------- the Class tab (v15) ----------
/** Invitations waiting for me, made safe: [{ class, name, teachers, invited_at }]. */
export function cleanInvites(list) {
  return (Array.isArray(list) ? list : []).map((x) => ({ class: uuid(x && x.class), name: text(x && x.name, CLASS_NAME_MAX) || "Class",
    teachers: names(x && x.teachers), invited_at: when(x && x.invited_at) })).filter((x) => x.class).slice(0, 20);
}
/** Who a teacher invited and has not answered yet: [{ id, username, invited_at }]. */
export function cleanInvited(list) {
  return (Array.isArray(list) ? list : []).map((x) => ({ id: uuid(x && x.id), username: handle(x && x.username) || "?",
    invited_at: when(x && x.invited_at) })).filter((x) => x.id).slice(0, 60);
}
/** The people of a class as a classmate sees them: { teachers: [username], students: [{ username, level, me }] }.
 *  A level is one of LEVELS; anything else reads as "none". Never a number. */
export function cleanPeople(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  return { teachers: names(r.teachers),
    students: (Array.isArray(r.students) ? r.students : []).map((s) => ({ username: handle(s && s.username),
      level: LEVELS.includes(s && s.level) ? s.level : "none", me: !!s && s.me === true })).filter((s) => s.username).slice(0, 60) };
}
const POST_KINDS = ["youtube", "reel", "podcast", "page", "book", "text"];
const link = (v) => { const s = String(v || "").trim(); return /^https?:\/\/[^\s<>"']+$/i.test(s) && s.length <= 600 ? s : ""; };
/** One thing sent to a class, made safe: the fields "Send to a friend" sends (sendmedia.js), cut to size, links
 *  that are links, a kind the app knows (never Netflix: it is not a kind). Null when it isn't one. */
export function cleanPostItem(raw) {
  if (!raw || typeof raw !== "object" || !POST_KINDS.includes(raw.kind)) return null;
  if (!text(raw.title, 200) && !link(raw.url)) return null; // (nothing to show and nothing to open)
  const out = { kind: raw.kind, title: text(raw.title, 200) || "Untitled", url: link(raw.url), subtitle: text(raw.subtitle, 120), image: link(raw.image) };
  if (/^[a-z]{2,3}$/.test(String(raw.language || ""))) out.language = raw.language;
  const n = Number(raw.duration);
  if (Number.isFinite(n) && n > 0 && n < 1e6) out.duration = Math.round(n);
  for (const k of ["feed_url", "audio_url"]) if (link(raw[k])) out[k] = link(raw[k]);
  for (const k of ["guid", "source"]) if (raw[k]) out[k] = text(raw[k], 200);
  return out;
}
/** A class's posts, newest first: [{ id, item, path, sender, mine, created_at }]. */
export function cleanPosts(list) {
  return (Array.isArray(list) ? list : []).map((p) => {
    const id = uuid(p && p.id), item = cleanPostItem(p && p.item);
    if (!id || !item) return null;
    return { id, item, path: codeText(p.path, /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.gz$/), sender: handle(p.sender), mine: p.mine === true, created_at: when(p.created_at) };
  }).filter(Boolean).slice(0, 50);
}
/** A classroom (v17), made safe: { folders: [{ id, name }], items: [{ id, item, path, notes, folder, sender, mine,
 *  created_at, updated_at }] }. An item in a folder that is gone shows at the top (folder ""). */
export function cleanRoom(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const folders = (Array.isArray(r.folders) ? r.folders : []).map((f) => ({ id: uuid(f && f.id), name: text(f && f.name, CLASS_NAME_MAX) }))
    .filter((f) => f.id && f.name).slice(0, 40);
  const known = new Set(folders.map((f) => f.id));
  const items = (Array.isArray(r.items) ? r.items : []).map((p) => {
    const id = uuid(p && p.id), item = cleanPostItem(p && p.item);
    if (!id || !item) return null;
    const folder = uuid(p.folder);
    return { id, item, path: codeText(p.path, /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.gz$/), notes: cleanNotes(p.notes), folder: known.has(folder) ? folder : "",
      sender: handle(p.sender), mine: p.mine === true, created_at: when(p.created_at), updated_at: when(p.updated_at) || when(p.created_at) };
  }).filter(Boolean).slice(0, 300);
  return { folders, items };
}
/** An answer with a status and, sometimes, a username or a class: { status, username, id, name }. */
export function cleanAnswer(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  return { status: /^[a-z_]{1,20}$/.test(String(r.status || "")) ? String(r.status) : "no", username: handle(r.username),
    id: uuid(r.class), name: text(r.name, CLASS_NAME_MAX) };
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
