// The day's goal under the Review banner: how many new words and reviews are done today out of
// how many, and about how long the rest will take. Pure functions apart from the last few (which
// keep the list of answers given on this device in localStorage); shared with the phone and tested
// in tests/js/goal.test.mjs. The bar itself is review/goalbar.js.
//
// Timing. The reviewer writes how long each card was looked at into every answer ([t, rating, day,
// ms], ms from the card being shown to the answer, at most 60 s). The estimate is built from those
// looks, not from whole words, because what a word costs depends on whether it is remembered:
//   - each look belongs to a group: "new" (a word's first look on the day of its first answer),
//     "review" (an older word's first look of the day) or "again" (a later look the same day, after
//     "Not remembered");
//   - per group: how often it ends in "Remembered", and how long a look takes when it does and when
//     it doesn't (a miss is usually slower: the learner searches, then reads the back);
//   - a word still to do costs its first look, plus, if it is missed, the looks it takes coming back
//     until it is remembered (on average 1 / the "again" rate of them);
//   - a word already missed today costs only those return looks.
// A look at the 60 s cap is left out of the times (the card was most likely left open while the
// learner was away) but still counts for remembered-or-not. Times are means of the last 300 looks
// of a kind without the fastest and slowest 5%. Each look also costs a moment between cards.
//
// Where the numbers come from. Remembered-or-not is about memory, so it comes from every answer on
// record (which sync). Speed is about the device: a phone answered by swiping and a computer
// answered with keys differ, so this device's own looks are used first (localStorage `reviewTimes`,
// the times of the answers given here, NOT synced), then all answers on record, then a fixed guess.
// While part of the estimate is a guess, or rests on few looks, it is shown as a range.

import { GOOD, history } from "./fsrs.js";
import { plan, reviewable, uidOf } from "./deck.js";

export const KEEP = 300;           // the last this many looks of each kind count
export const ENOUGH = 10;          // fewer looks than this: not enough to time a kind
export const AWAY_MS = 60000;      // a look this long: the learner was away
export const GAP_MS = 600;         // between cards (one leaving, the next arriving): not in the recorded times
export const REVIEWS_PER_NEW = 10; // Anki's manual: 20 new a day -> about 200 reviews a day
export const GUESS = {             // before anything is measured: [ms remembered, ms not remembered, share remembered]
  new: [11000, 15000, 0.6],
  review: [7000, 11000, 0.85],     // the reviewer aims at 90% remembered
  again: [6000, 9000, 0.75],
};
const PRIOR = 5;                   // the guessed share counts as this many answers until real ones outweigh it
const TRIM = 0.05;                 // the fastest and slowest twentieth are left out of a time
const FIRM = 30;                   // looks of a kind behind a time before the estimate is shown as one number
const SPREAD = { guess: 0.35, few: 0.2 };  // how wide the range is: a guess, or a time from few looks

/** Every look at every word: [{t, day, kind, yes, ms, away}], oldest first per word. */
export function looks(log) {
  const out = [];
  for (const entries of Object.values(log || {})) {
    let lastDay = null;
    for (const step of history(entries)) {
      const day = step.after.day;
      const kind = lastDay === day ? "again" : !step.before || step.before.first === day ? "new" : "review";
      lastDay = day;
      out.push({ t: step.t, day, kind, yes: step.rating === GOOD, ms: step.ms, away: !(step.ms > 0 && step.ms < AWAY_MS) });
    }
  }
  return out.sort((a, b) => a.t - b.t);
}

/** The mean of `ms` without the fastest and slowest twentieth; null with fewer than `ENOUGH`. */
export function typical(ms) {
  const list = (ms || []).filter((x) => Number.isFinite(x) && x > 0);
  if (list.length < ENOUGH) return null;
  list.sort((a, b) => a - b);
  const cut = Math.floor(list.length * TRIM);
  const kept = list.slice(cut, list.length - cut);
  return kept.reduce((a, b) => a + b, 0) / kept.length;
}

/** How long a look of one kind takes, from `list` (that kind's looks, oldest first):
 * {yes, no, n} in ms, or null with too few. A miss or a hit with too few of its own uses all of them. */
function times(list) {
  const timed = list.filter((l) => !l.away).slice(-KEEP);
  const all = typical(timed.map((l) => l.ms));
  if (all === null) return null;
  const yes = typical(timed.filter((l) => l.yes).map((l) => l.ms));
  const no = typical(timed.filter((l) => !l.yes).map((l) => l.ms));
  return { yes: yes ?? all, no: no ?? all, n: timed.length };
}

/**
 * What a look of each kind is like: {new, review, again}, each {yes, no, rate, n, from}:
 * ms when remembered and when not, the share remembered, how many looks the times rest on, and
 * where they come from ("device", "log" or "guess"). `device` is the set of answer times given on
 * this device (see deviceTimes).
 */
export function model(log, device = new Set()) {
  const all = looks(log);
  const out = {};
  for (const kind of ["new", "review", "again"]) {
    const mine = all.filter((l) => l.kind === kind);
    const [gYes, gNo, gRate] = GUESS[kind];
    const recent = mine.slice(-KEEP);
    const hits = recent.filter((l) => l.yes).length;
    const rate = (hits + PRIOR * gRate) / (recent.length + PRIOR);
    const here = times(mine.filter((l) => device.has(l.t)));
    const everywhere = here ? null : times(mine);
    const got = here || everywhere;
    out[kind] = got ? { yes: got.yes, no: got.no, rate, n: got.n, from: here ? "device" : "log" }
      : { yes: gYes, no: gNo, rate, n: 0, from: "guess" };
  }
  // Few words have been missed yet: a return look is timed like a review (a quick second try),
  // which is closer than a guess.
  if (out.again.from === "guess" && out.review.from !== "guess") {
    const { yes, no, n, from } = out.review;
    out.again = { ...out.again, yes, no, n, from };
  }
  return out;
}

/** The ms one word costs from here on: a word not looked at yet today ("new" or "review"), or one
 * missed today and still to be remembered ("again"). Also how many looks that is, on average. */
export function wordCost(m, kind) {
  const a = m.again;
  const q = Math.min(1, Math.max(0.25, a.rate));                   // a word that keeps being missed still ends
  const back = { ms: a.yes + ((1 - q) / q) * a.no, looks: 1 / q };  // the looks until it is remembered
  if (kind === "again") return { ms: back.ms + back.looks * GAP_MS, looks: back.looks };
  const k = m[kind], p = k.rate;
  const looksN = 1 + (1 - p) * back.looks;
  return { ms: p * k.yes + (1 - p) * (k.no + back.ms) + looksN * GAP_MS, looks: looksN };
}

/** The reviews a day to expect in the long run for a new-words goal (about 10 per new word). */
export const expectedReviews = (goal) => Math.max(0, goal) * REVIEWS_PER_NEW;

/**
 * Today's numbers among `words` (every saved word, whatever folder is open: the goal is the day's).
 *   newDone   words first answered today and remembered since
 *   newLeft   new words still to do today: started but not yet remembered (newBusy), plus the
 *             unseen ones the day's allowance still lets in
 *   revDone   older words remembered today
 *   revLeft   older words due today, or missed today and still to be remembered (revBusy)
 * The targets are done + left, so a bar is full exactly when nothing is left.
 */
export function today(words, cards, day, goal) {
  const p = plan(words, cards, day, goal);
  let newDone = 0, newBusy = 0, revDone = 0, revLeft = 0, revBusy = 0;
  for (const v of (words || []).filter(reviewable)) {
    const c = cards.get(uidOf(v));
    if (!c) continue;
    if (c.first === day) { if (c.learning) newBusy++; else newDone++; } else if (c.day === day && !c.learning) revDone++;
    else if (c.learning || c.due <= day) { revLeft++; if (c.learning && c.day === day) revBusy++; }
  }
  const newLeft = newBusy + p.fresh.length;
  return { goal, newDone, newLeft, newBusy, newTarget: newDone + newLeft, revDone, revLeft, revBusy, revTarget: revDone + revLeft,
           waiting: p.waiting, expected: expectedReviews(goal) };
}

/**
 * About how long what is left today will take: {ms, lo, hi, guess}. `lo`/`hi` differ from `ms`
 * only while the estimate is uncertain: part of it is a guess, or rests on fewer than `FIRM` looks.
 */
export function estimate(t, m) {
  const parts = [
    ["new", t.newLeft - t.newBusy], ["review", t.revLeft - t.revBusy], ["again", t.newBusy + t.revBusy],
  ].filter(([, n]) => n > 0);
  let ms = 0;
  for (const [kind, n] of parts) ms += n * wordCost(m, kind).ms;
  // Which kinds' times the answer leans on: a fresh word may come back, so it leans on "again" too.
  const used = new Set(parts.flatMap(([kind]) => (kind === "again" ? ["again"] : [kind, "again"])));
  const from = [...used].map((k) => m[k]);
  const guess = from.some((k) => k.from === "guess");
  const spread = guess ? SPREAD.guess : from.some((k) => k.n < FIRM) ? SPREAD.few : 0;
  return { ms, lo: ms * (1 - spread), hi: ms * (1 + spread), guess };
}

/** Minutes rounded as people say them: to the minute under 15, to 5 under an hour, then to 10. */
export function roundMinutes(min) {
  if (min < 15) return Math.max(1, Math.round(min));
  if (min < 60) return Math.round(min / 5) * 5;
  return Math.round(min / 10) * 10;
}
const clock = (min) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ""}`);

/** "under a minute", "about 9 min", "8–12 min", "about 1 h 20 min", "50 min – 1 h 10 min"; "" for nothing. */
export function timeText({ ms, lo = ms, hi = ms }) {
  if (!(ms > 0)) return "";
  if (hi < 60000) return "under a minute";
  const a = roundMinutes(Math.max(lo, 60000) / 60000), b = roundMinutes(hi / 60000);
  if (a >= b) return `about ${clock(roundMinutes(ms / 60000))}`;
  return b < 60 ? `${a}–${b} min` : `${clock(a)} – ${clock(b)}`;
}

/** Seconds as the popup says them: "24 s". */
export const secondsText = (ms) => `${Math.max(1, Math.round(ms / 1000))} s`;

// ----- the answers given on this device (localStorage `reviewTimes`, never synced) -----
// Only their times ([t, ...]) are kept: the answers themselves are in the log. (An older version
// kept {new: [[t, ms]], review: [[t, ms]]}; those t are read too.)

const KEEP_HERE = 900;  // enough for the last 300 looks of each kind
const TIMES_KEY = "reviewTimes";

/** A stored record as a list of answer times, oldest first. */
export function recordTimes(record) {
  if (!record || typeof record !== "object") return [];
  if (Array.isArray(record.ts)) return record.ts.filter(Number.isFinite);
  return [...(record.new || []), ...(record.review || [])].map((s) => s && s[0]).filter(Number.isFinite).sort((a, b) => a - b);
}
/** The record with the answer at `t` added (the last `KEEP_HERE` kept) or, with `add` false, removed. */
export function withTime(record, t, add = true) {
  const ts = recordTimes(record).filter((x) => x !== t);
  if (add) ts.push(t);
  return { ts: ts.slice(-KEEP_HERE) };
}

/** The times of the answers given on this device, as a Set. */
export function deviceTimes() {
  try { return new Set(recordTimes(JSON.parse(localStorage.getItem(TIMES_KEY)))); } catch { return new Set(); }
}
function update(change) {
  try {
    const record = JSON.parse(localStorage.getItem(TIMES_KEY));
    localStorage.setItem(TIMES_KEY, JSON.stringify(change(record)));
  } catch { /* storage unavailable: the answers on record stand in */ }
}
/** After an answer (`entries` is the word's list, the new answer last): remember it was given here. */
export function noteAnswer(entries) {
  const last = entries && entries[entries.length - 1];
  if (last && Number.isFinite(last[0])) update((r) => withTime(r, last[0]));
}
/** After Undo: forget it. (The log marks it taken back too, so it would not count anyway.) */
export const forgetAnswer = (t) => update((r) => withTime(r, t, false));
