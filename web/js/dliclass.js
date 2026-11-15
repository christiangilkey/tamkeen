// DLI classes, the online side (supabase/v10-dli-classes.sql, through social.js's connection).
//
// A DLI student must share their last name and weekly study numbers (dliweeks.js) with Tamkeen's developer and
// with the teachers of classes they join: the owner's rule, agreed to on a screen that says so
// (components/dlishare.js). Until they have, the DLI material stays closed (`gate`). Teachers make classes and
// see their own students; the owner sees every DLI student (components/dliteach.js).
//
// Who may see what is decided by the database, never here: every call below is a database function that checks
// who is asking. What comes back is still checked again before it is shown (dliweeks.js cleanMe and the rest).
//
// On this device (localStorage, not synced, so one device signing out doesn't lock the others):
//   tamkeenDliShare    { user, last_name, language, agreed_at }: sharing is on for this account
//   tamkeenDliService  "on" once the online service was found to have DLI classes (the SQL file run), "off" when
//                      it was found not to. Until it is known to be on, the material opens as it did before, with
//                      nothing shared: nobody is locked out by an update, or while offline on first start
//   tamkeenDliSent     the weekly numbers last sent, so the same ones aren't sent again
// Being offline never closes the material: only signing out, or stopping sharing, does.

import { api, state } from "./app.js";
import * as social from "./social.js";
import { onlineStatus } from "./agegate.js";
import { dliState } from "./dli.js";
import { hasStudyLanguage, studyLanguage } from "./languages.js";
import { dayNumber } from "./review/fsrs.js";
import { cleanClass, cleanCodes, cleanMe, cleanOwner, cleanStudents, cleanUse, dayDate, teacherCode, weekNumbers, weekStart } from "./dliweeks.js";

export { CLASS_NAME_MAX, NAME_MAX, spaced } from "./dliweeks.js";

/** The number of the sharing text a student agrees to (components/dlishare.js SHARE_TEXT). Raise it when that
 *  text changes what is shared: students are then asked again. */
export const WORDING = 1;
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

/** { user, last_name, language, agreed_at } while sharing is on for this device's account, else null. */
export function shareInfo() {
  try {
    const v = JSON.parse(read(SHARE_KEY) || "null");
    return v && typeof v.user === "string" && typeof v.last_name === "string" && v.last_name ? v : null;
  } catch { return null; }
}
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
  dli_not_owner: "Only Tamkeen's owner can do that.",
  dli_class_limit: "You have 20 classes already. Delete one first.",
  dli_bad_week: "That week couldn't be saved.",
};

/** An error with words that are safe to show. `notReady`: the online service has no DLI classes yet.
 *  `offline`: it couldn't be reached. */
function problem(error) {
  const msg = String((error && (error.message || error.error_description)) || error || "");
  const code = String((error && error.code) || "");
  const known = Object.keys(MESSAGES).find((k) => msg.includes(k));
  let out;
  if (known) out = new Error(MESSAGES[known]);
  else if (code === "PGRST202" || code === "42883" || /could not find the function/i.test(msg)) {
    out = new Error("DLI classes aren't switched on yet. Try again later.");
    out.notReady = true;
  } else if (/fetch|network|Failed to/i.test(msg)) {
    out = new Error("Couldn't reach the online service. Check your internet connection.");
    out.offline = true;
  } else if (/not signed in|jwt/i.test(msg)) out = new Error("Sign in first.");
  else out = new Error("That didn't work. Try again in a moment.");
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
    try { me = cleanMe(await rpc("dli_register", { last_name: me.student.last_name, language: st.language, wording: WORDING })); } catch { /* next time */ }
  }
  keepShare(me.student && user && me.student.agreed_version >= WORDING ? { user: user.id, ...me.student } : null);
  return { signedIn: true, me };
}

/** Agree to share: my last name, with my DLI language. Resolves to `me`. */
export async function register(lastName, language) {
  const me = cleanMe(await rpc("dli_register", { last_name: String(lastName || ""), language, wording: WORDING }));
  const user = await social.currentUser();
  keepShare(me.student && user ? { user: user.id, ...me.student } : null);
  return me;
}

/** Stop sharing: my last name, classes and weekly numbers are deleted online; the DLI material closes here. */
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

export const setTeacherName = (name) => rpc("dli_set_teacher_name", { name: String(name || "") });
export async function createClass(name) {
  return cleanClass({ ...(await rpc("dli_create_class", { name: String(name || "") })), role: "teacher", students: 0 });
}
export const renameClass = (id, name) => rpc("dli_rename_class", { class: id, name: String(name || "") });
export const deleteClass = (id) => rpc("dli_delete_class", { class: id });
export const removeStudent = (id, student) => rpc("dli_remove_student", { class: id, student });
export const newCodes = async (id) => cleanCodes(await rpc("dli_new_codes", { class: id }));

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
    const current = weekStart(dayNumber());
    const agreed = share.agreed_at ? weekStart(dayNumber(new Date(share.agreed_at))) : current;
    const record = sentRecord(user.id);
    let sent = 0;
    for (const start of [current - 7, current]) {
      if (start < agreed) continue;
      const done = start < current; // (a week that has ended is sent one last time, then left alone)
      const numbers = weekNumbers(Array.isArray(words) ? words : [], log, start);
      const sig = JSON.stringify(numbers);
      const before = record.weeks[numbers.week];
      if (before && (before.done || (before.sig === sig && !done))) continue;
      const ok = await rpc("dli_report_week", numbers);
      if (ok === false) { keepShare(null); return sent; } // (no record online any more: sharing was stopped elsewhere)
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

/** The numbers of this week as they would be sent now (the "What is shared" box), or null when the DLI
 *  language isn't the one being studied. */
export async function myWeekNow() {
  const st = dliState(settings());
  if (!st.language || !hasStudyLanguage() || studyLanguage() !== st.language) return null;
  const [words, log] = await Promise.all([api("/vocab"), api("/reviews").then((r) => (r && r.reviews) || {})]);
  return weekNumbers(Array.isArray(words) ? words : [], log, weekStart(dayNumber()));
}

/** The Monday this week started on, as a date ("2026-11-09"). */
export const thisWeek = () => dayDate(weekStart(dayNumber()));
