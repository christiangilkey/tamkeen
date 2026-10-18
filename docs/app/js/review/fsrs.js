// The memory model behind the vocab reviewer: FSRS-6, the scheduler Anki uses, with its
// published default parameters. Pure functions, shared with the phone; app/fsrs.py is the same
// thing in Python (the computer's Anki export needs it) and tests keep the two in step.
//
// FSRS keeps two numbers per word:
//   s  stability   days until the chance of recalling the word has dropped to 90%
//   d  difficulty  1 (easy) to 10 (hard)
// The reviewer has two answers, which are FSRS's "Good" and "Again":
//   Remembered      the word waits about `s` days before it is asked again
//   Not remembered  the word comes back the same day until it is remembered once
//
// What is stored (and synced) is the list of answers, never the two numbers: a word's state is
// worked out by replaying its answers, so answers given on two devices merge without conflict.
// One answer is [t, rating, day, ms]: when (milliseconds), GOOD / AGAIN (0 = taken back with
// Undo), the answering device's local day number, and how long the card was looked at.

export const W = [0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796,
  1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542];
export const RETENTION = 0.9;   // a word is asked again when the chance of recalling it falls to this
export const AGAIN = 1, GOOD = 3;
export const MAX_DAYS = 36500;
export const AGAIN_SECONDS = 60; // how soon a missed word returns (what the Anki export writes down)
const MIN_STABILITY = 0.001;
const DECAY = -W[20];
const FACTOR = Math.pow(0.9, 1 / DECAY) - 1;
const clamp = (x, low, high) => Math.min(high, Math.max(low, x));

/** A local calendar day as a count of days since 1970 (the same count the game uses). */
export const dayNumber = (d = new Date()) => Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000);

/** The chance (0..1) of recalling a word `days` after its last answer. */
export const recall = (days, s) => Math.pow(1 + (FACTOR * days) / s, DECAY);

/** Whole days to wait so that the chance of recall is `retention` when the word returns. */
export const waitFor = (s, retention = RETENTION) =>
  clamp(Math.floor((s / FACTOR) * (Math.pow(retention, 1 / DECAY) - 1) + 0.5), 1, MAX_DAYS);

const firstDifficulty = (rating) => W[4] - Math.exp(W[5] * (rating - 1)) + 1;

function nextDifficulty(d, rating) {
  const moved = d + (-W[6] * (rating - 3) * (10 - d)) / 9;          // hard words move less
  return clamp(W[7] * firstDifficulty(4) + (1 - W[7]) * moved, 1, 10); // and drift back to the middle
}

const afterRecall = (d, s, r) => s * (1 + Math.exp(W[8]) * (11 - d) * Math.pow(s, -W[9]) * (Math.exp((1 - r) * W[10]) - 1));

const afterForgetting = (d, s, r) => Math.min(
  W[11] * Math.pow(d, -W[12]) * (Math.pow(s + 1, W[13]) - 1) * Math.exp((1 - r) * W[14]),
  s / Math.exp(W[17] * W[18]));

/** A second answer on the same day: a smaller step than one after a real wait. */
function sameDay(s, rating) {
  const change = Math.exp(W[17] * (rating - 3 + W[18])) * Math.pow(s, -W[19]);
  return s * (rating >= GOOD ? Math.max(change, 1) : change);
}

/**
 * A word's state after one more answer on local day `day`. `card` is its state before, or null
 * for a word never answered. The state:
 *   s, d      stability and difficulty
 *   day       the day of this answer        due   the day it is next asked
 *   ivl       the wait in days (0 while it still has to be remembered today)
 *   reps      answers so far                lapses  times a known word was forgotten
 *   learning  the last answer was "not remembered"
 *   known     it has been remembered at least once
 *   first     the day of its first answer
 */
export function answer(card, rating, day) {
  const again = rating === AGAIN;
  let s, d;
  if (!card) {
    s = W[rating - 1];
    d = firstDifficulty(rating);
  } else {
    const days = Math.max(0, day - card.day);
    if (days === 0) s = sameDay(card.s, rating);
    else s = again ? afterForgetting(card.d, card.s, recall(days, card.s)) : afterRecall(card.d, card.s, recall(days, card.s));
    d = nextDifficulty(card.d, rating);
  }
  s = clamp(s, MIN_STABILITY, MAX_DAYS);
  d = clamp(d, 1, 10);
  const ivl = again ? 0 : waitFor(s);
  return {
    s, d, day, due: day + ivl, ivl,
    reps: (card ? card.reps : 0) + 1,
    lapses: (card ? card.lapses : 0) + (again && card && card.known && !card.learning ? 1 : 0),
    learning: again,
    known: !again || Boolean(card && card.known),
    first: card ? card.first : day,
  };
}

/** The answers that count, oldest first (ones taken back, and anything malformed, are dropped). */
export function answers(entries) {
  return (Array.isArray(entries) ? entries : [])
    .filter((e) => Array.isArray(e) && Number.isFinite(e[0]) && (e[1] === AGAIN || e[1] === GOOD) && Number.isFinite(e[2]))
    .sort((a, b) => a[0] - b[0]);
}

/** Every answer with the word's state before and after it: [{t, rating, ms, before, after}]. */
export function history(entries) {
  const out = [];
  let card = null;
  for (const [t, rating, day, ms] of answers(entries)) {
    // A clock set back, or a trip across time zones, must not make a day run backwards.
    const after = answer(card, rating, card ? Math.max(day, card.day) : day);
    out.push({ t, rating, ms: Number.isFinite(ms) ? ms : 0, before: card, after });
    card = after;
  }
  return out;
}

/** A word's state now, from its list of answers; null for a word never answered. */
export function replay(entries) {
  const steps = history(entries);
  return steps.length ? steps[steps.length - 1].after : null;
}

/** Days until the word would be asked again if it were remembered on `day`. */
export const nextWait = (card, day) => answer(card, GOOD, card ? Math.max(day, card.day) : day).ivl;

// ----- what the Anki export writes (app/anki_deck.py explains Anki's side) -----

const fixed = (x) => x.toFixed(4);

/** Anki's note of a card's memory state (its cards.data column). */
export const ankiData = (card) => `{"s":${fixed(card.s)},"d":${fixed(card.d)},"dr":${RETENTION},"decay":${W[20]}}`;

/** Anki's [type, queue, due, interval, ease, reviews, lapses] for a word with this state.
 * A word still to be remembered today goes over as due today. */
export const ankiSchedule = (card, today) =>
  [2, 2, card.learning ? 0 : Math.max(0, card.due - today), Math.max(1, card.ivl), 2500, card.reps, card.lapses];

/** Everything the Anki export needs for a word that has answers: {schedule, data, log}; null for
 * a word that has none. */
export function ankiCard(entries, today) {
  const card = replay(entries);
  return card ? { schedule: ankiSchedule(card, today), data: ankiData(card), log: ankiLog(entries) } : null;
}

/** Anki's review log for a word: [id, ease, interval, interval before, factor, time, type] per
 * answer. Intervals are days, or seconds as a negative number while a word is being learned;
 * type is 0 learning, 1 review, 2 relearning. */
export function ankiLog(entries) {
  const interval = (card) => (!card ? 0 : card.learning ? -AGAIN_SECONDS : card.ivl);
  return history(entries).map(({ t, rating, ms, before, after }) => [
    Math.floor(t), rating, interval(after), interval(before),
    Math.floor(((after.d - 1) / 9 + 0.1) * 1000),
    clamp(Math.floor(ms), 0, 60000),
    !before || !before.known ? 0 : before.learning ? 2 : 1,
  ]);
}
