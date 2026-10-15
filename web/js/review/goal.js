// The day's goal under the Review banner: how many new words and reviews are done today out of
// how many, and about how long the rest will take. Pure functions apart from the last few (which
// keep this device's own timings in localStorage); shared with the phone and tested in
// tests/js/goal.test.mjs. The bar itself is review/goalbar.js.
//
// Timing. The reviewer already writes how long each card was looked at into every answer
// ([t, rating, day, ms], ms from the card being shown to the answer, at most 60 s). What a
// learner spends on a word in a day is the sum over that day's answers: a new word that is missed
// twice and then remembered took three looks. So one "sample" is one word finished on one day
// (its last answer that day "Remembered"), kind "new" on the day of its first answer and "review"
// on any later day. A sample with an answer at the 60 s cap is dropped: the card was most likely
// left open while the learner was away. The typical time is a trimmed mean of the last 100.
//
// Where samples come from. Each device keeps its own last 100 of each kind (localStorage
// `reviewTimes`, NOT synced): a phone answered by swiping and a computer answered with keys are
// not the same speed, and the estimate is for the device in hand. Until a device has enough of
// its own, the answers on record (which do sync) stand in, and before those a fixed guess.

import { GOOD, history } from "./fsrs.js";
import { plan, reviewable, uidOf } from "./deck.js";

export const KEEP = 100;                               // the last this many samples of each kind
export const ENOUGH = 10;                              // fewer than this: not enough to go on
export const AWAY_MS = 60000;                          // an answer this long: the learner was away
export const GUESS_MS = { new: 25000, review: 10000 };  // before anything is measured
export const REVIEWS_PER_NEW = 10;                     // Anki's manual: 20 new a day -> about 200 reviews a day
const TRIM = 0.1;                                      // the fastest and slowest tenth are left out

/** Each day a word was answered: [{day, t, kind, ms, done, away}], oldest first. `t` is the
 * day's last answer, `done` that it was "Remembered", `away` that one answer hit the cap. */
export function wordDays(entries) {
  const out = [];
  for (const step of history(entries)) {
    const day = step.after.day;
    let last = out[out.length - 1];
    if (!last || last.day !== day) {
      last = { day, t: step.t, kind: !step.before || step.before.first === day ? "new" : "review", ms: 0, done: false, away: false };
      out.push(last);
    }
    last.t = step.t;
    last.ms += step.ms;
    last.done = step.rating === GOOD;
    if (step.ms >= AWAY_MS || step.ms <= 0) last.away = true;  // no time on record counts as unknown too
  }
  return out;
}

/** The finished, usable word-days in the whole log: {new: [[t, ms], ...], review: [...]}, oldest first. */
export function logTimes(log) {
  const out = { new: [], review: [] };
  for (const entries of Object.values(log || {})) {
    for (const d of wordDays(entries)) if (d.done && !d.away) out[d.kind].push([d.t, d.ms]);
  }
  for (const kind of ["new", "review"]) out[kind].sort((a, b) => a[0] - b[0]);
  return out;
}

/** The sample a word's answer on `day` makes, if that answer finished it for the day: {kind, t, ms} or null. */
export function finishedSample(entries, day) {
  const d = wordDays(entries).find((x) => x.day === day);
  return d && d.done && !d.away ? { kind: d.kind, t: d.t, ms: d.ms } : null;
}

/** Typical ms of the last `KEEP` samples ([t, ms] pairs): a mean without the fastest and slowest
 * tenth. Null with fewer than `ENOUGH`. */
export function typical(samples) {
  const ms = (samples || []).slice(-KEEP).map((s) => s[1]).filter((x) => Number.isFinite(x) && x > 0);
  if (ms.length < ENOUGH) return null;
  ms.sort((a, b) => a - b);
  const cut = Math.floor(ms.length * TRIM);
  const kept = ms.slice(cut, ms.length - cut);
  return kept.reduce((a, b) => a + b, 0) / kept.length;
}

/** The time to count per word of each kind: {new: {ms, from}, review: {ms, from}}, `from` being
 * "device" (this device's own), "log" (the answers on record) or "guess". */
export function pace(device, log) {
  const fromLog = logTimes(log);
  const out = {};
  for (const kind of ["new", "review"]) {
    const mine = typical(device && device[kind]);
    const all = mine === null ? typical(fromLog[kind]) : null;
    out[kind] = mine !== null ? { ms: mine, from: "device" } : all !== null ? { ms: all, from: "log" } : { ms: GUESS_MS[kind], from: "guess" };
  }
  return out;
}

/** The reviews a day to expect in the long run for a new-words goal (about 10 per new word). */
export const expectedReviews = (goal) => Math.max(0, goal) * REVIEWS_PER_NEW;

/**
 * Today's numbers among `words` (every saved word, whatever folder is open: the goal is the day's).
 *   newDone   words first answered today and remembered since
 *   newLeft   new words still to do today: started but not yet remembered, plus the unseen ones
 *             the day's allowance still lets in
 *   revDone   older words remembered today
 *   revLeft   older words due today, or missed today and still to be remembered
 * The targets are done + left, so a bar is full exactly when nothing is left.
 */
export function today(words, cards, day, goal) {
  const p = plan(words, cards, day, goal);
  let newDone = 0, newBusy = 0, revDone = 0, revLeft = 0;
  for (const v of (words || []).filter(reviewable)) {
    const c = cards.get(uidOf(v));
    if (!c) continue;
    if (c.first === day) { if (c.learning) newBusy++; else newDone++; } else if (c.day === day && !c.learning) revDone++;
    else if (c.learning || c.due <= day) revLeft++;
  }
  const newLeft = newBusy + p.fresh.length;
  return { goal, newDone, newLeft, newTarget: newDone + newLeft, revDone, revLeft, revTarget: revDone + revLeft,
           waiting: p.waiting, expected: expectedReviews(goal) };
}

/** Estimated ms of work left today. */
export const timeLeft = (t, p) => t.newLeft * p.new.ms + t.revLeft * p.review.ms;

/** "under a minute", "about 9 min", "about 1 h 20 min"; "" for nothing. */
export function minutesText(ms) {
  if (!(ms > 0)) return "";
  const min = Math.round(ms / 60000);
  if (min < 1) return "under a minute";
  if (min < 60) return `about ${min} min`;
  const hours = Math.floor(min / 60), rest = min % 60;
  return `about ${hours} h${rest ? ` ${rest} min` : ""}`;
}

/** Seconds as the popup says them: "24 s". */
export const secondsText = (ms) => `${Math.max(1, Math.round(ms / 1000))} s`;

// ----- this device's own timings (localStorage `reviewTimes`, never synced) -----

/** Add a sample to a record ({new: [[t, ms]], review: [...]}), keeping the last `KEEP` of its kind. */
export function addSample(record, { kind, t, ms }) {
  const out = { new: [...((record && record.new) || [])], review: [...((record && record.review) || [])] };
  out[kind] = [...out[kind].filter((s) => s[0] !== t), [t, ms]].slice(-KEEP);
  return out;
}

/** The record without the sample made at `t` (an answer taken back with Undo). */
export function dropSample(record, t) {
  return { new: ((record && record.new) || []).filter((s) => s[0] !== t), review: ((record && record.review) || []).filter((s) => s[0] !== t) };
}

const TIMES_KEY = "reviewTimes";
export function deviceTimes() {
  try { const v = JSON.parse(localStorage.getItem(TIMES_KEY)); return v && typeof v === "object" ? v : { new: [], review: [] }; } catch { return { new: [], review: [] }; }
}
function saveTimes(record) {
  try { localStorage.setItem(TIMES_KEY, JSON.stringify(record)); } catch { /* storage unavailable: no estimate kept */ }
}
/** After an answer: when it finished the word for the day, keep the time it took on this device. */
export function noteAnswer(entries, day) {
  const s = finishedSample(entries, day);
  if (s) saveTimes(addSample(deviceTimes(), s));
}
/** After Undo: forget the sample that answer made, if it made one. */
export const forgetAnswer = (t) => saveTimes(dropSample(deviceTimes(), t));
