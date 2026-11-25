// DLI classes, the online side (supabase/v10-dli-classes.sql and v11-dli-activity.sql, through social.js's connection).
//
// A DLI student must share their username and weekly study numbers (dliweeks.js) with Tamkeen's developer and
// with the teachers of classes they join: the owner's rule, agreed to on a screen that says so
// (components/dlishare.js). Until they have, the DLI material stays closed (`gate`). Teachers make classes and
// see their own students; the owner sees every DLI student (components/dliteach.js).
//
// Who may see what is decided by the database, never here: every call below is a database function that checks
// who is asking. What comes back is still checked again before it is shown (dliweeks.js cleanMe and the rest).
//
// On this device (localStorage, not synced, so one device signing out doesn't lock the others):
//   tamkeenDliShare    { user, username, language, agreed_at }: sharing is on for this account (no name: DLI keeps
//                      none since v0.61, and one left here by an older version is removed when this file loads)
//   tamkeenDliService  "on" once the online service was found to have DLI classes (the SQL file run), "off" when
//                      it was found not to. Until it is known to be on, the material opens as it did before, with
//                      nothing shared: nobody is locked out by an update, or while offline on first start
//   tamkeenDliSent     the weekly numbers last sent, so the same ones aren't sent again
//   tamkeenDliTime, tamkeenDliDevice   this device's listening, watching and reading time (dlitime.js)
// Being offline never closes the material: only signing out, or stopping sharing, does.

import { api, state, toast } from "./app.js";
import { t } from "./i18n.js";
import * as social from "./social.js";
import { onlineStatus } from "./agegate.js";
import { dliState } from "./dli.js";
import { hasStudyLanguage, studyLanguage } from "./languages.js";
import { feature } from "./prototype.js";
import { dayNumber } from "./review/fsrs.js";
import { answerDays, cleanClass, cleanCodes, cleanMe, cleanOwner, cleanAdded, cleanAnswer, cleanInvited, cleanInvites, cleanPeople, cleanPosts, cleanRoom, cleanStudents, cleanTeachers, cleanUse, dayDate, teacherCode, weekNumbers, weekStart } from "./dliweeks.js";
import { dayMask, deviceId, timeLog, weekTime } from "./dlitime.js";

export { CLASS_NAME_MAX, NAME_MAX, spaced } from "./dliweeks.js";

/** The number of the sharing text a student agrees to (components/dlishare.js SHARE_TEXT). Raise it when that
 *  text changes what is shared: students are then asked again. (2, v0.61: listening, watching and reading time.) */
export const WORDING = 2;
export const SHARE_KEY = "tamkeenDliShare";
const SERVICE_KEY = "tamkeenDliService";
const SENT_KEY = "tamkeenDliSent";
/** Sent on `window` when sharing was switched on or off on this device. */
export const SHARE_EVENT = "tamkeen:dli-share";

const settings = () => (state.status && state.status.settings) || {};
const read = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key, value) => {
  try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch { /* storage off */ }
};

// ---------- what this device knows ----------

/** { user, username, language, agreed_at } while sharing is on for this device's account, else null. */
export function shareInfo() {
  try {
    const v = JSON.parse(read(SHARE_KEY) || "null");
    return v && typeof v.user === "string" && v.user && typeof v.language === "string" ? v : null;
  } catch { return null; }
}
// A last name kept on this device by an older version: deleted.
try {
  const old = JSON.parse(read(SHARE_KEY) || "null");
  if (old && typeof old === "object" && "last_name" in old) { delete old.last_name; write(SHARE_KEY, JSON.stringify(old)); }
} catch { /* nothing kept, or storage off */ }
function keepShare(value) {
  const before = read(SHARE_KEY);
  const after = value ? JSON.stringify(value) : null;
  if (before === after) return;
  write(SHARE_KEY, after);
  if (!value) write(SENT_KEY, null);
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(SHARE_EVENT));
}
/** True once the online service is known to have DLI classes (found out by `refresh`). */
export const serviceOn = () => read(SERVICE_KEY) === "on";

/** Where a DLI student stands: "closed" (not unlocked, or no language chosen), "share" (unlocked, but the
 *  sharing step is still to do) or "open" (the material shows). */
export function gate(s = settings()) {
  if (!dliState(s).ready) return "closed";
  return shareInfo() || !serviceOn() ? "open" : "share";
}
export const dliOpen = (s = settings()) => gate(s) === "open";

// ---------- talking to the online service ----------

const MESSAGES = {
  dli_bad_name: "That name can't be used. Use letters, at most 40 of them.",
  dli_bad_language: "Choose your DLI language first.",
  dli_not_teacher: "Enter your teacher code first.",
  dli_not_your_class: "That isn't one of your classes.",
  dli_cannot_drop: "Only a teacher who was in the class before them can take a teacher out.",
  dli_agree_first: "Agree to show yourself to classmates first.",
  dli_bad_post: "That couldn't be sent to the class.",
  dli_post_limit: "You've sent as many things as one day allows. Try again tomorrow.",
  dli_room_full: "The classroom is full (300 things, 40 folders). Remove something first.",
  dli_no_folder: "That folder is gone.",
  dli_no_post: "That was removed from the classroom.",
  dli_not_owner: "Only Tamkeen's owner can do that.",
  dli_class_limit: "You have 20 classes already. Delete one first.",
  dli_bad_week: "That week couldn't be saved.",
  // lessons (supabase/v12-dli-lessons.sql, dlilessons.js)
  dli_not_your_lesson: "That lesson isn't for one of your classes.",
  dli_lesson_needs_title: "Give the lesson a title first.",
  dli_too_many_lessons: "This class has 300 lessons already. Remove one first.",
  dli_not_in_class: "That student isn't in the class any more.",
};

/** An error with words that are safe to show. `notReady`: the online service has no DLI classes yet.
 *  `offline`: it couldn't be reached. */
function problem(error) {
  const msg = String((error && (error.message || error.error_description)) || error || "");
  const code = String((error && error.code) || "");
  const known = Object.keys(MESSAGES).find((k) => msg.includes(k));
  let out;
  if (known) { out = new Error(MESSAGES[known]); out.code = known; }
  else if (code === "PGRST202" || code === "42883" || /could not find the function/i.test(msg)) {
    out = new Error("DLI classes aren't switched on yet. Try again later.");
    out.notReady = true;
  } else if (/fetch|network|Failed to/i.test(msg)) {
    out = new Error("Couldn't reach the online service. Check your internet connection.");
    out.offline = true;
  } else if (/not signed in|jwt/i.test(msg)) out = new Error("Sign in first.");
  else out = new Error("That didn't work. Try again in a moment.");
  // (what the online service really said: shown small under an invitation that failed, so it can be reported)
  out.detail = [code, msg].filter(Boolean).join(" ").replace(/[<>]/g, "").slice(0, 160);
  return out;
}

async function rpc(name, args) {
  let res;
  try { res = await (await social.sb()).rpc(name, args); } catch (e) { throw problem(e); }
  if (res.error) throw problem(res.error);
  write(SERVICE_KEY, "on"); // (it answered: the service has DLI classes)
  return res.data;
}

/** Does the online service have DLI classes at all? Asked without signing in: a function that isn't there and one
 *  that refuses a signed-out caller answer differently. Offline, what was known stands. */
async function probe() {
  try { await rpc("dli_me"); } catch (e) {
    if (e.notReady) write(SERVICE_KEY, "off");
    else if (!e.offline) write(SERVICE_KEY, "on");
  }
}

/** Signed in to the online features? "in", "out", or "unknown" (offline with a pass that has run out: nobody
 *  signed out, so nothing is closed). */
export async function sessionState() {
  try {
    if ((await onlineStatus()) !== "ok") return "out";
    const { data, error } = await (await social.sb()).auth.getSession();
    if (data && data.session) return "in";
    return error || (typeof navigator !== "undefined" && navigator.onLine === false) ? "unknown" : "out";
  } catch { return "unknown"; }
}

// ---------- me ----------

/** Ask the online service where I stand and bring this device in line with it.
 *  Resolves to { signedIn, me, notReady, offline }: `me` (cleanMe) when it answered; `notReady` while the
 *  service isn't known to have DLI classes (the new parts then hide). Never throws. */
export async function refresh() {
  const session = await sessionState();
  if (session !== "in") {
    if (session === "out") keepShare(null); // (signed out: sharing isn't on for anyone here)
    await probe();
    return { signedIn: false, me: null, notReady: !serviceOn() };
  }
  let me;
  try { me = cleanMe(await rpc("dli_me")); } catch (e) {
    if (e.notReady) write(SERVICE_KEY, "off");
    return { signedIn: true, me: null, notReady: !serviceOn(), offline: !!e.offline, error: e };
  }
  const user = await social.currentUser();
  const st = dliState(settings());
  // (the DLI language was changed on another device: the record follows it)
  if (me.student && st.language && me.student.language !== st.language) {
    try { me = await agree(st.language); } catch { /* next time */ }
  }
  keepShare(me.student && user && me.student.agreed_version >= WORDING ? { user: user.id, ...me.student } : null);
  keepRole(me);
  return { signedIn: true, me };
}

/** dli_agree (v11), or on a database without v11 yet the older dli_register with a dash where a last name went:
 *  no name is ever sent. */
async function agree(language) {
  try { return cleanMe(await rpc("dli_agree", { language, wording: WORDING })); } catch (e) {
    if (!e.notReady) throw e;
    return cleanMe(await rpc("dli_register", { last_name: "-", language, wording: WORDING }));
  }
}

/** Agree to share my username and weekly numbers, with my DLI language. Resolves to `me`. */
export async function register(language) {
  const me = await agree(language);
  const user = await social.currentUser();
  keepShare(me.student && user ? { user: user.id, ...me.student } : null);
  return me;
}

/** Stop sharing: my record, classes and weekly numbers are deleted online; the DLI material closes here. */
export async function unregister() {
  await rpc("dli_unregister");
  keepShare(null);
}

/** Type a code: a class code, a teacher code, a class's second-teacher code or the owner code.
 *  Resolves to { status, id, name } (the statuses are listed in the SQL file). */
export async function useCode(code) {
  return cleanUse(await rpc("dli_use_code", { code: String(code || "").slice(0, 80) }));
}

export const leaveClass = (id) => rpc("dli_leave_class", { class: id });

// ---------- teachers ----------

export async function createClass(name) {
  return cleanClass({ ...(await rpc("dli_create_class", { name: String(name || "") })), role: "teacher", students: 0 });
}
export const renameClass = (id, name) => rpc("dli_rename_class", { class: id, name: String(name || "") });
export const deleteClass = (id) => rpc("dli_delete_class", { class: id });
export const removeStudent = (id, student) => rpc("dli_remove_student", { class: id, student });
export const newCodes = async (id) => cleanCodes(await rpc("dli_new_codes", { class: id }));

// The Class tab (supabase/v15-dli-class-tab.sql; prototype "class_tab"). Against a database without v15 these
// throw an error whose `notReady` is true.
/** The wording a student agrees to before classmates see them (their username and activity level). Not the app's
 *  WORDING: agreeing to this one is a choice made in the Class tab, and nothing locks without it. */
export const CLASSMATES_WORDING = 3;
/** Invite a DLI student to one of my classes by username: { status, username }. */
export const inviteStudent = async (id, username) => cleanAnswer(await rpc("dli_invite_student", { class: id, username: String(username || "").slice(0, 40) }));
/** Who I invited and has not answered: [{ id, username, invited_at }]. */
export const classInvited = async (id) => cleanInvited(await rpc("dli_class_invited", { class: id }));
export const cancelInvite = (id, student) => rpc("dli_cancel_invite", { class: id, student });
/** The invitations waiting for me: [{ class, name, teachers, invited_at }]. */
export const myInvites = async () => cleanInvites(await rpc("dli_my_invites"));
/** Accept or turn down an invitation: { status, id, name }. */
export const answerInvite = async (id, accept) => cleanAnswer(await rpc("dli_answer_invite", { class: id, accept: !!accept }));
/** A class's teachers and students as a classmate sees them: { teachers, students: [{ username, level, me }] }. */
export const classmates = async (id) => cleanPeople(await rpc("dli_classmates", { class: id }));
/** Agree that classmates see my username and activity level (my language and everything else stay as they are). */
export async function agreeToClassmates() {
  const share = shareInfo();
  if (!share) throw new Error("Finish the sharing step in Settings → DLI students first.");
  const me = cleanMe(await rpc("dli_agree", { language: share.language, wording: CLASSMATES_WORDING }));
  const user = await social.currentUser();
  if (me.student && user) keepShare({ user: user.id, ...me.student });
  return me;
}
/** What was sent to a class, newest first. */
export const classPosts = async (id) => cleanPosts(await rpc("dli_class_posts", { class: id }));
const CLASS_BUCKET = "dli-class";
/** Send one thing to a class. `item`: its fields (cleanPostItem's); `file`: its words, gzipped, or null.
 *  Resolves to { id, withWords }. The files of posts that just expired are removed along the way. */
export async function postToClass(id, item, file = null) {
  const store = (await social.sb()).storage.from(CLASS_BUCKET);
  let path = null;
  if (file) {
    path = `${id}/${crypto.randomUUID()}.gz`;
    const up = await store.upload(path, file, { contentType: "application/gzip" });
    if (up.error) path = null; // (sent without its words: each student's app can still fetch or make them)
  }
  let r;
  try { r = (await rpc("dli_post", { class: id, item, path })) || {}; } catch (e) {
    if (path) store.remove([path]).catch(() => {});
    throw e;
  }
  const old = (Array.isArray(r.old) ? r.old : []).filter((p) => /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.gz$/.test(String(p)));
  if (old.length) store.remove(old).catch(() => {});
  return { id: String(r.id || ""), withWords: !!path };
}
// ---------- the Classroom (v17: supabase/v17-dli-classroom.sql; components/classroompanel.js) ----------
// A class's shared material: what was sent to it, in folders, with the teacher's notes on its words. On a database
// without v17 these throw an error whose `notReady` is true (the panel then shows v15's plain list).
const fileOf = async (id, file) => {
  if (!file) return null;
  const path = `${id}/${crypto.randomUUID()}.gz`;
  const up = await (await social.sb()).storage.from(CLASS_BUCKET).upload(path, file, { contentType: "application/gzip" });
  return up.error ? null : path;
};
const dropFiles = async (paths) => {
  const list = paths.filter((p) => /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.gz$/.test(String(p || "")));
  if (list.length) (await social.sb()).storage.from(CLASS_BUCKET).remove(list).catch(() => {});
};
/** A class's classroom: { folders, items } (dliweeks.js cleanRoom). */
export const classroom = async (id) => cleanRoom(await rpc("dli_classroom", { class: id }));
/** Add something to a classroom. `file`: its words, gzipped, or null. Resolves to { id, withWords }. */
export async function roomAdd(id, item, { file = null, notes = [], folder = null } = {}) {
  const path = await fileOf(id, file);
  let r;
  try { r = (await rpc("dli_room_add", { class: id, item, path, notes, folder: folder || null })) || {}; } catch (e) {
    if (path) dropFiles([path]);
    throw e;
  }
  return { id: String(r.id || ""), withWords: !!path };
}
/** Change a classroom item in place: its words (`file`: a new gzipped transcript; leave it out to keep the old
 *  one) and the teacher's notes. Resolves to { withWords }. */
export async function roomUpdate(classId, postId, { item = null, file = null, notes = null } = {}) {
  const path = await fileOf(classId, file);
  let old;
  try { old = await rpc("dli_room_update", { post: postId, item, path, notes }); } catch (e) {
    if (path) dropFiles([path]);
    throw e;
  }
  if (old) dropFiles([old]);
  return { withWords: !!path };
}
export const roomMove = (postId, folder) => rpc("dli_room_move", { post: postId, folder: folder || null });
/** Make a folder (no `folder`) or rename one. Resolves to its id. */
export const folderSave = (classId, name, folder = null) => rpc("dli_folder_save", { class: classId, name: String(name || "").slice(0, 60), folder });
export const folderRemove = (folder) => rpc("dli_folder_remove", { folder });

/** The words that came with a post (a Blob, gzipped), or null. */
export async function postFile(path) {
  if (!path) return null;
  const { data, error } = await (await social.sb()).storage.from(CLASS_BUCKET).download(path);
  return error ? null : data;
}
/** A teacher takes a post back (its file goes too). */
export async function deletePost(postId) {
  const path = await rpc("dli_delete_post", { post: postId });
  if (path) (await social.sb()).storage.from(CLASS_BUCKET).remove([String(path)]).catch(() => {});
}

// Who gets the Class tab on this device: a student who shares, or a teacher (kept from the last answer of the
// online service, so the tab is there at once on opening the app). `tamkeenDliRole`: "teacher" or "".
const ROLE_KEY = "tamkeenDliRole";
const CLASSES_KEY = "tamkeenDliTeaches"; // [{ id, name }]: my classes as a teacher, for "Send to a class"
export const isTeacherHere = () => read(ROLE_KEY) === "teacher";
/** My classes as a teacher, as last heard: [{ id, name }]. */
export function teacherClasses() {
  try { const v = JSON.parse(read(CLASSES_KEY) || "[]"); return Array.isArray(v) ? v.filter((c) => c && c.id && c.name).slice(0, 40) : []; } catch { return []; }
}
function keepRole(me) {
  if (!me) return;
  write(ROLE_KEY, me.teacher || me.owner ? "teacher" : null);
  write(CLASSES_KEY, JSON.stringify(me.classes.filter((c) => c.role === "teacher").map((c) => ({ id: c.id, name: c.name }))));
  syncClassNav();
}
/** Does this device show the Classroom in the Library (prototype "classroom")? The same people as the Class tab. */
export const classroomShown = () => feature("classroom") && serviceOn() && (!!shareInfo() || isTeacherHere());
// ---------- invitations waiting for me: said out loud ----------
// A teacher's invitation used to wait silently in Friends → Class until the student happened to look there
// (found 2026-11-25: "I added a student to my class and it didn't work"). Now Home asks when it opens, and says so.
let invitesAsked = 0;
let invitesWaiting = 0;
const toldInvites = new Set();
/** How many invitations were waiting for me when last asked (the Friends page's Class part shows it). */
export const invitesCount = () => invitesWaiting;
/**
 * Ask whether a class invitation is waiting for me, and say so with a way to open it. Safe to call often (Home
 * does, each time it opens): at most every five minutes, only on a device where DLI classes are in use, never
 * throws. It also brings this device's role up to date first, so a student who agreed to share on another device
 * gets the Class part here too. Resolves to how many are waiting.
 */
export async function noticeInvites({ force = false } = {}) {
  if (!feature("class_tab") || !serviceOn()) return 0;
  if (!force && Date.now() - invitesAsked < 5 * 60000) return invitesWaiting;
  invitesAsked = Date.now();
  try {
    if ((await sessionState()) !== "in") return 0;
    if (!shareInfo() && !isTeacherHere()) await refresh(); // (this device doesn't know yet what I am)
    if (!shareInfo()) { invitesWaiting = 0; return 0; }
    const list = cleanInvites(await rpc("dli_my_invites"));
    invitesWaiting = list.length;
    for (const inv of list) {
      if (toldInvites.has(inv.class)) continue;
      toldInvites.add(inv.class);
      toast(t("You're invited to {0}", inv.name), { timeout: 12000, action: { label: t("Open"), run: () => (location.hash = "#/class") } });
    }
    return list.length;
  } catch { return invitesWaiting; }
}

/** Does this device show the Class part of the Friends page (pages/friends.js; prototype "class_tab")? A DLI
 *  student who shares, or a teacher, as the online service last said. */
export const classTabShown = () => feature("class_tab") && serviceOn() && (!!shareInfo() || isTeacherHere());
/** (Until 2026-11-25 Class was a tab of its own in the app's bar; a page that still has that link keeps it hidden.) */
export function syncClassNav() {
  if (typeof document === "undefined") return;
  for (const a of document.querySelectorAll('[data-nav="class"]')) a.hidden = true;
}
if (typeof window !== "undefined") {
  window.addEventListener(SHARE_EVENT, syncClassNav);
  if (typeof document !== "undefined") setTimeout(syncClassNav, 0);
}

// A class's teachers (supabase/v13-dli-class-teachers.sql; prototype "class_teachers"). Against a database
// without v13 these throw an error whose `notReady` is true.
/** The teachers of one of my classes: [{ id, username, added_at, me, can_drop }]. */
export const classTeachers = async (id) => cleanTeachers(await rpc("dli_class_teachers", { class: id }));
/** Add a DLI teacher to one of my classes by username: { status, username }. */
export const addTeacher = async (id, username) => cleanAdded(await rpc("dli_add_teacher", { class: id, username: String(username || "").slice(0, 40) }));
/** Take out a teacher who joined the class after me. */
export const dropTeacher = (id, person) => rpc("dli_drop_teacher", { class: id, person });

/** One of my classes with its students' numbers: { class, students }. */
export async function classReport(id, weeks = 12) {
  const r = (await rpc("dli_class_report", { class: id, weeks })) || {};
  return { class: cleanClass({ ...(r.class || {}), role: "teacher" }), students: cleanStudents(r.students) };
}

// ---------- the owner ----------

/** Every DLI student, the teachers, the classes and the teacher code. */
export const ownerReport = async (weeks = 12) => cleanOwner(await rpc("dli_owner_report", { weeks }));
export const ownerNewTeacherCode = async () => teacherCode(await rpc("dli_owner_new_teacher_code"));
export const ownerRemoveTeacher = (person) => rpc("dli_owner_remove_teacher", { person });
export const ownerRemoveStudent = (person) => rpc("dli_owner_remove_student", { person });

// ---------- sending the weekly numbers ----------

let sending = null;
let lastSend = 0;

function sentRecord(user) {
  try {
    const v = JSON.parse(read(SENT_KEY) || "null");
    return v && v.user === user && v.weeks && typeof v.weeks === "object" ? v : { user, weeks: {} };
  } catch { return { user, weeks: {} }; }
}

/** Send this week's numbers (and last week's once more after it ended), when they changed. Only while the DLI
 *  language is the one being studied: the saved words on hand are that language's. Resolves to how many weeks
 *  were sent. Never throws. */
export function reportWeeks({ force = false } = {}) {
  if (sending) return sending;
  sending = (async () => {
    const share = shareInfo();
    const st = dliState(settings());
    if (!share || !st.ready || !hasStudyLanguage() || studyLanguage() !== st.language) return 0;
    if (!force && Date.now() - lastSend < 5 * 60000) return 0;
    if ((await sessionState()) !== "in") return 0;
    const user = await social.currentUser();
    if (!user || user.id !== share.user) return 0;
    const [words, log] = await Promise.all([api("/vocab"), api("/reviews").then((r) => (r && r.reviews) || {})]);
    const times = timeLog();
    const current = weekStart(dayNumber());
    const agreed = share.agreed_at ? weekStart(dayNumber(new Date(share.agreed_at))) : current;
    const record = sentRecord(user.id);
    let sent = 0;
    for (const start of [current - 7, current]) {
      if (start < agreed) continue;
      const done = start < current; // (a week that has ended is sent one last time, then left alone)
      const { numbers, time } = weekOf(words, log, times, st.language, start);
      const sig = JSON.stringify([numbers, time]);
      const before = record.weeks[numbers.week];
      if (before && (before.done || (before.sig === sig && !done))) continue;
      const ok = await rpc("dli_report_week", numbers);
      if (ok === false) { keepShare(null); return sent; } // (no record online any more: sharing was stopped elsewhere)
      // (this device's time: refused only by a database without v11 yet, which then simply goes without it)
      try { await rpc("dli_report_time", { week: numbers.week, device: deviceId(), ...time }); } catch { /* v11 not run yet */ }
      record.weeks[numbers.week] = { sig, done };
      sent++;
    }
    lastSend = Date.now();
    // (only the last few weeks are worth remembering)
    const keep = Object.keys(record.weeks).sort().slice(-4);
    record.weeks = Object.fromEntries(keep.map((k) => [k, record.weeks[k]]));
    write(SENT_KEY, JSON.stringify(record));
    return sent;
  })().catch(() => 0).finally(() => { sending = null; });
  return sending;
}

/** A week as this device sends it: the flashcard numbers (dli_report_week) and this device's time
 *  (dli_report_time: minutes, and the days with any study as bits, flashcard days included). */
function weekOf(words, log, times, language, start) {
  const list = Array.isArray(words) ? words : [];
  const numbers = weekNumbers(list, log, start);
  const spent = weekTime(times, language, start);
  const days = new Set([...answerDays(list, log, start), ...spent.days]);
  return { numbers, time: { listening: spent.listening, watching: spent.watching, reading: spent.reading, day_mask: dayMask(days, start) },
    active_days: days.size };
}

/** The numbers of this week as they would be sent now (the "What is shared" box), or null when the DLI
 *  language isn't the one being studied. (Only this device's time: the others' arrive with the next report.) */
export async function myWeekNow() {
  const st = dliState(settings());
  if (!st.language || !hasStudyLanguage() || studyLanguage() !== st.language) return null;
  const [words, log] = await Promise.all([api("/vocab"), api("/reviews").then((r) => (r && r.reviews) || {})]);
  const { numbers, time, active_days } = weekOf(words, log, timeLog(), st.language, weekStart(dayNumber()));
  const { day_mask, ...minutes } = time;
  return { ...numbers, ...minutes, active_days };
}

/** The Monday this week started on, as a date ("2026-11-09"). */
export const thisWeek = () => dayDate(weekStart(dayNumber()));

/** The same checked call for the lessons' functions (dlilessons.js, supabase/v12-dli-lessons.sql). */
export { rpc as dliRpc };
