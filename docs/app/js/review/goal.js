// The day's goal under the Review banner: how many new words and reviews are done today out of
// how many, and about how long the rest will take. Pure functions apart from the last few (which
// keep the list of answers given on this device in localStorage); shared with the phone and tested
// in tests/js/goal.test.mjs. The bar itself is review/goalbar.js.
//
// Timing. The reviewer writes how long each card was looked at into every answer ([t, rating, day,
// ms], ms from the card being shown to the answer, at most 60 s, not counting time the app spent
// hidden behind another window or app). The estimate is built from those looks, not from whole
// words, because what a word costs depends on whether it is remembered:
//   - each look belongs to a group: "new" (a word's first look on the day of its first answer),
//     "review" (an older word's first look of the day) or "again" (a later look the same day, after
//     "Not remembered");
//   - per group: how often it ends in "Remembered", and how long a look takes when it does and when
//     it doesn't (a miss is usually slower: the learner searches, then reads the back);
//   - a word still to do costs its first look, plus, if it is missed, the looks it takes coming back
//     until it is remembered (on average 1 / the "again" rate of them);
//   - a word already missed today costs only those return looks;
//   - each look also costs the moment between cards, as measured between answers.
// A look at the 60 s cap is left out of the times (the card was most likely left open while the
// learner was away) but still counts for remembered-or-not. Times are means of the last 300 looks
// of a kind, the fastest and slowest twentieth pulled in to the edge of the rest (a 59 s look then
// can't pull the mean up far, and the slow end, which is real time, still counts).
//
// Where the numbers come from, without jumps. Remembered-or-not is about memory, so it comes from
// every answer on record (which sync). Speed is about the device: a phone answered by swiping and a
// computer answered with keys differ, so this device's own looks (localStorage `reviewTimes`, the
// times of the answers given here, NOT synced) count over all answers on record, and those over a
// fixed guess. Each step is a weighted mean, not a switch: the guess counts as a few looks, so the
// first real looks move the estimate a little at a time instead of replacing the guess all at once
// at some count; on a new device the answers on record give way to its own the same way. While the
// estimate rests on few looks it is shown as a range, which narrows as looks come in.

import { GOOD, history } from "./fsrs.js";
import { plan, reviewable, uidOf } from "./deck.js";

export const KEEP = 300;           // the last this many looks of each kind count
export const ENOUGH = 10;          // looks of a kind before it counts as measured (said in the popup)
export const AWAY_MS = 60000;      // a look this long: the learner was away
export const GAP_MS = 400;         // between cards (one leaving, the next arriving) until measured
export const REVIEWS_PER_NEW = 10; // Anki's manual: 20 new a day -> about 200 reviews a day
export const GUESS = {             // before anything is measured: [ms remembered, ms not remembered, share remembered]
  new: [11000, 15000, 0.6],
  review: [7000, 11000, 0.85],     // the reviewer aims at 90% remembered
  again: [6000, 9000, 0.75],
};
export const PRIOR_LOOKS = 8;      // a guessed time counts as this many looks against measured ones
export const DEVICE_LOOKS = 20;    // the time from all answers counts as this many looks against this device's own
const PRIOR = 5;                   // the guessed share remembered counts as this many answers
const EDGE = 0.05;                 // the fastest and slowest twentieth are pulled in to the edge of the rest
const SPREAD = 0.35;               // how wide the range is on a guess alone; it narrows as looks come in
const SHOW_RANGE = 0.15;           // narrower than this: shown as one number

/** Every look at every word: [{t, day, kind, yes, ms, away}], all words together, oldest first. */
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

/** `ms` with the fastest and slowest twentieth pulled in to the edge of the rest (from 20 looks on). */
export function evened(ms) {
  const list = (ms || []).filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
  if (list.length < 20) return list;
  const cut = Math.floor(list.length * EDGE);
  const lo = list[cut], hi = list[list.length - 1 - cut];
  return list.map((x) => Math.min(hi, Math.max(lo, x)));
}

/** The mean of `ms` (evened), pulled toward `prior` as if that were `weight` more looks. */
export function blend(ms, prior, weight) {
  const list = evened(ms);
  return (list.reduce((a, b) => a + b, 0) + weight * prior) / (list.length + weight);
}

/** The typical moment between one answer and the next card's start, from the last answers. */
function gapOf(all) {
  const gaps = [];
  for (let i = Math.max(1, all.length - 200); i < all.length; i++) {
    const g = all[i].t - all[i - 1].t - all[i].ms;
    if (!all[i].away && g >= 0 && g < 5000) gaps.push(g);
  }
  gaps.sort((a, b) => a - b);
  return gaps.length >= ENOUGH ? gaps[Math.floor(gaps.length / 2)] : GAP_MS;
}

/**
 * What a look of each kind is like: {new, review, again, gap}, each kind {yes, no, rate, n, here,
 * from}: ms when remembered and when not, the share remembered, how many looks the times rest on
 * (all on record, and of those given on this device), and where they mostly come from ("device",
 * "log" or "guess"); `gap` = ms between cards. `device` is the set of answer times given on this
 * device (see deviceTimes).
 */
export function model(log, device = new Set()) {
  return fromLooks(looks(log), device);
}

/** model() from a list of looks (as looks() makes them). */
export function fromLooks(all, device = new Set()) {
  const out = { gap: gapOf(all) };
  for (const kind of ["new", "review", "again"]) {
    const mine = all.filter((l) => l.kind === kind);
    const recent = mine.slice(-KEEP);
    const rate = (recent.filter((l) => l.yes).length + PRIOR * GUESS[kind][2]) / (recent.length + PRIOR);
    // The starting point. A return look with few of its own is like a review (a quick second try),
    // in proportion: closer than a guess once reviews are measured.
    let [gYes, gNo] = GUESS[kind];
    if (kind === "again" && out.review.n >= ENOUGH) {
      gYes *= out.review.yes / GUESS.review[0];
      gNo *= out.review.no / GUESS.review[1];
    }
    // All answers on record: first how fast this kind is overall, then remembered and missed looks
    // apart, each starting from that pace (a few misses can't say much on their own).
    const timed = mine.filter((l) => !l.away).slice(-KEEP);
    const mix = rate * gYes + (1 - rate) * gNo;
    const pace = blend(timed.map((l) => l.ms), mix, PRIOR_LOOKS) / mix;
    let yes = blend(timed.filter((l) => l.yes).map((l) => l.ms), gYes * pace, PRIOR_LOOKS);
    let no = blend(timed.filter((l) => !l.yes).map((l) => l.ms), gNo * pace, PRIOR_LOOKS);
    // This device's own looks, the same way, starting from all of them.
    const here = timed.filter((l) => device.has(l.t));
    if (here.length) {
      const mixHere = rate * yes + (1 - rate) * no;
      const paceHere = blend(here.map((l) => l.ms), mixHere, DEVICE_LOOKS) / mixHere;
      yes = blend(here.filter((l) => l.yes).map((l) => l.ms), yes * paceHere, PRIOR_LOOKS);
      no = blend(here.filter((l) => !l.yes).map((l) => l.ms), no * paceHere, PRIOR_LOOKS);
    }
    out[kind] = { yes, no, rate, n: timed.length, here: here.length,
                  from: here.length >= ENOUGH ? "device" : timed.length >= ENOUGH ? "log" : "guess" };
  }
  return out;
}

/** The ms one word costs from here on: a word not looked at yet today ("new" or "review"), or one
 * missed today and still to be remembered ("again"). Also how many looks that is, on average. */
export function wordCost(m, kind) {
  const a = m.again, gap = m.gap ?? GAP_MS;
  const q = Math.min(1, Math.max(0.25, a.rate));                   // a word that keeps being missed still ends
  const back = { ms: a.yes + ((1 - q) / q) * a.no, looks: 1 / q };  // the looks until it is remembered
  if (kind === "again") return { ms: back.ms + back.looks * gap, looks: back.looks };
  const k = m[kind], p = k.rate;
  const looksN = 1 + (1 - p) * back.looks;
  return { ms: p * k.yes + (1 - p) * (k.no + back.ms) + looksN * gap, looks: looksN };
}

/** A goal for one card of a kind ("new", "review" or "again"), in seconds: a little over the time
 * this learner usually takes to remember one, rounded up to 5 s, between 5 and 60 s. */
export function cardGoal(m, kind) {
  const k = m[kind] || m.review;
  return Math.min(60, Math.max(5, Math.ceil((k.yes * 1.2) / 5000) * 5));
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

/** How sure a kind's times are, as a share either way: wide on a guess, narrowing as looks come in. */
const spreadOf = (n) => SPREAD * Math.sqrt(PRIOR_LOOKS / (PRIOR_LOOKS + n));

/**
 * About how long what is left today will take: {ms, lo, hi, guess}. `lo`/`hi` differ from `ms`
 * only while the estimate is uncertain; how uncertain is each part's own, weighted by how much of
 * the time it is (a few return looks with little measured behind them don't widen the whole).
 * `guess`: some part still rests mostly on the starting guess.
 */
export function estimate(t, m) {
  const parts = [
    ["new", t.newLeft - t.newBusy], ["review", t.revLeft - t.revBusy], ["again", t.newBusy + t.revBusy],
  ].filter(([, n]) => n > 0);
  let ms = 0, wide = 0;
  for (const [kind, n] of parts) {
    const cost = n * wordCost(m, kind).ms;
    ms += cost;
    wide += cost * spreadOf(m[kind].n);
  }
  const spread = ms ? wide / ms : 0;
  const shown = spread >= SHOW_RANGE ? spread : 0;
  return { ms, lo: ms * (1 - shown), hi: ms * (1 + shown), guess: parts.some(([kind]) => m[kind].n < PRIOR_LOOKS) };
}

/** Minutes rounded as people say them: to the minute under 15, to 5 under an hour, then to 10. */
export function roundMinutes(min) {
  if (min < 15) return Math.max(1, Math.round(min));
  if (min < 60) return Math.round(min / 5) * 5;
  return Math.round(min / 10) * 10;
}
const clock = (min) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ""}`);

/** "under a minute", "about 9 min", "8–12 min", "about 1 h 20 min", "50 min – 1 h 10 min"; "" for nothing.
 *  `capital`: "Under a minute", "About 9 min" (written out, so each is translated as it is shown). */
export function timeText({ ms, lo = ms, hi = ms }, capital = false) {
  if (!(ms > 0)) return "";
  if (hi < 60000) return capital ? "Under a minute" : "under a minute";
  const a = roundMinutes(Math.max(lo, 60000) / 60000), b = roundMinutes(hi / 60000);
  if (a >= b) return capital ? `About ${clock(roundMinutes(ms / 60000))}` : `about ${clock(roundMinutes(ms / 60000))}`;
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
