// The flashcard streak: the flame next to a name in the friends list. A day counts when the learner
// finished the day's flashcards, the same "done" as the goal bar under the Review banner
// (review/goal.js `today`): every new word the day's allowance let in learned (answered and, if
// missed, remembered in the end), and every word that was due remembered.
//
// It is worked out from the answer log (which syncs), never kept as a counter, so it survives a
// reinstall or a new device. Pure functions apart from the last few, which keep a short note of
// the past days already counted on this device (see `keptDays`).
//
// The day of an answer is the day written into it when it was given (fsrs.js `dayNumber`, local
// time then), so an answer at 23:59 belongs to that day whatever the clock says later, and a trip
// across time zones never moves an answer to another day.
//
// Each day is one of:
//   "met"   something was answered that day and nothing was left: it adds one;
//   "rest"  there was nothing to do (nothing due, no new words waiting or "0 new words a day") and
//           nothing was answered: it neither adds nor breaks the streak;
//   "missed" anything else. Today is never "missed" while it lasts: until it is done it is "open",
//           and the streak is the one that ended yesterday.

import { history } from "./fsrs.js";
import { reviewable, uidOf } from "./deck.js";

const DAY_S = 86400;

/** The local day (as fsrs.js counts days) a word was saved on; -Infinity when unknown. */
function savedDay(v) {
  let t = Number(v && v.created_at);
  if (!Number.isFinite(t) || t <= 0) return -Infinity;
  if (t > 1e11) t /= 1000; // milliseconds rather than seconds
  const d = new Date(t * 1000);
  return Math.floor((t - d.getTimezoneOffset() * 60) / DAY_S);
}

/**
 * Everything the day-by-day check needs, worked out once: {list, firsts}. `list`: for each word
 * that can be reviewed, its states (after each day it was answered) and the day it was saved.
 * `firsts`: how many words of the whole log were first answered on each day (deleted ones and other
 * languages' too: like the day's allowance in deck.js `plan`, which they use up).
 */
export function prepare(words, log) {
  const out = [];
  const firsts = new Map();
  for (const entries of Object.values(log || {})) {
    const steps = history(entries);
    if (steps.length) firsts.set(steps[0].after.first, (firsts.get(steps[0].after.first) || 0) + 1);
  }
  for (const v of (words || []).filter(reviewable)) {
    const steps = history((log || {})[uidOf(v)]);
    const ends = []; // [day, state at the end of that day]
    for (const s of steps) {
      if (ends.length && ends[ends.length - 1][0] === s.after.day) ends[ends.length - 1][1] = s.after;
      else ends.push([s.after.day, s.after]);
    }
    out.push({ saved: savedDay(v), ends });
  }
  return { list: out, firsts };
}

/** A word's state at the end of `day` (null: not answered by then). */
function stateAt(w, day) {
  let found = null;
  for (const [d, state] of w.ends) { if (d <= day) found = state; else break; }
  return found;
}

/**
 * What `day` was like, from the prepared words: {kind, answered, newDone, newLeft, revDone, revLeft}
 * with kind "met" | "rest" | "missed". `goal` is the new words a day.
 */
export function dayCheck(prepared, day, goal) {
  let answered = false, started = 0, newBusy = 0, unseen = 0, waitingBefore = 0, revDone = 0, revLeft = 0, dueBefore = 0;
  for (const w of prepared.list) {
    const end = stateAt(w, day);
    const start = stateAt(w, day - 1);
    if (w.ends.some(([d]) => d === day)) answered = true;
    if (!end) {
      // Never answered by the end of the day: waiting as a new word, if it was saved by then.
      if (w.saved <= day) unseen++;
      if (w.saved <= day - 1) waitingBefore++;
      continue;
    }
    if (end.first === day) {
      started++;
      if (end.learning) newBusy++;
      if (w.saved <= day - 1) waitingBefore++;
      continue;
    }
    // An older word: due today if it was still to be remembered, or its day had come.
    const due = start && (start.learning || start.due <= day);
    if (due) dueBefore++;
    if (end.learning || end.due <= day) revLeft++;
    else if (due) revDone++;
  }
  const allowance = Math.max(0, goal - Math.max(started, prepared.firsts.get(day) || 0));
  const fresh = Math.min(unseen, allowance);
  const newLeft = newBusy + fresh;
  const kind = answered && newLeft === 0 && revLeft === 0 ? "met"
    : !answered && dueBefore === 0 && (goal <= 0 || waitingBefore === 0) ? "rest" : "missed";
  return { kind, answered, newDone: started - newBusy, newLeft, revDone, revLeft };
}

/**
 * The streak on `today`: {days, through, today}. `days` = days met in a row, ending today if today
 * is done, else yesterday (rest days in between are passed over); `through` = the last day counted
 * (null for none); `today` = "met" | "open" | "rest". `kept` is a Set of past days already counted
 * (see keptDays): one stays counted even if the goal has since been raised.
 */
export function streak(words, log, { today, goal, kept = new Set(), limit = 3660 } = {}) {
  const prepared = prepare(words, log);
  let last = -Infinity, firstDay = Infinity;
  for (const w of prepared.list) {
    if (!w.ends.length) continue;
    last = Math.max(last, w.ends[w.ends.length - 1][0]);
    firstDay = Math.min(firstDay, w.ends[0][0]);
  }
  // Flown west after answering "tomorrow"? Today is at least the latest day anything was answered.
  const top = Math.max(today, last);
  const now = dayCheck(prepared, top, goal);
  const todayKind = now.kind === "missed" ? "open" : now.kind;
  let days = 0, through = null;
  const met = [];
  for (let d = top; d >= firstDay && d > top - limit; d--) {
    const kind = d === top ? todayKind : kept.has(d) ? "met" : dayCheck(prepared, d, goal).kind;
    if (kind === "open" || kind === "rest") continue;
    if (kind === "missed") break;
    days++;
    if (through === null) through = d;
    met.push(d);
  }
  return { days, through, today: todayKind, check: now, met };
}

/**
 * When a friend's streak runs out, as an ISO time: the end of the day after the last day counted,
 * at the publisher's own midnight. A friend sees the streak until then, wherever they are.
 * `through` is a local day number (fsrs.js `dayNumber`).
 */
export function streakUntil(through) {
  if (!Number.isFinite(through)) return null;
  // Day numbers are local dates counted from 1970-01-01: take the calendar date of day through + 2
  // and its local midnight.
  const date = new Date((through + 2) * DAY_S * 1000);
  return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()).toISOString();
}

/** A person's flashcard streak as published (social.gameProfiles row): the number while it lasts, else 0. */
export function streakNow(profile, now = new Date()) {
  const n = profile && Number(profile.streak);
  if (!(n > 0) || !profile.streak_until) return 0;
  const until = new Date(profile.streak_until).getTime();
  return Number.isFinite(until) && now.getTime() < until ? Math.floor(n) : 0;
}

// ----- the past days already counted on this device (localStorage, per language; not synced) -----
// Only so that raising "new words a day" doesn't take back days that were done under the old goal.
// Lost with the app's data: then every day is worked out again from the log with today's goal.

const KEEP_DAYS = 400;
const keyOf = (lang) => `flameDays:${lang || "-"}`;

/** The past days counted before on this device, as a Set of day numbers. */
export function keptDays(lang) {
  try {
    const list = JSON.parse(localStorage.getItem(keyOf(lang)));
    return new Set(Array.isArray(list) ? list.filter(Number.isFinite) : []);
  } catch { return new Set(); }
}

/** Remember the past days of `result.met` (today is never kept: it can still be undone). */
export function keepDays(lang, result, today) {
  try {
    const all = new Set([...keptDays(lang), ...(result.met || []).filter((d) => d < today)]);
    localStorage.setItem(keyOf(lang), JSON.stringify([...all].sort((a, b) => a - b).slice(-KEEP_DAYS)));
  } catch { /* storage unavailable: worked out from the log each time */ }
}
