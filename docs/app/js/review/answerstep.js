// One answer to a word's card, as the vocab reviewer records it (pages/review.js grade). The full-screen reviewer and
// the one docked beside a game (prototype "review_play": game/reviewplay.js) answer through this one function, so a
// card answered either way changes the same: its entry in the record and its memory state (review/fsrs.js).
// No page code here (the tests run it without a browser).

import { AGAIN, answer } from "./fsrs.js";

export const MS_KEPT = 60000; // the longest look at a card that is kept as its time

/**
 * Record one answer: `rating` (fsrs GOOD or AGAIN) to the word `uid`, looked at for `ms`, at `now` (milliseconds) on
 * day `today`. Adds [now, rating, day, ms] to `log[uid]` and sets the word's memory state in `cards` (a Map, uid to
 * state). A word answered ahead of its day keeps its day. Returns {before (its state before), entry}.
 */
export function recordAnswer({ cards, log, uid, rating, ms, now, today }) {
  const before = cards.get(uid) || null;
  const day = before ? Math.max(today, before.day) : today;
  const entry = [now, rating, day, Math.min(MS_KEPT, Math.max(0, Math.round(Number(ms) || 0)))];
  (log[uid] = log[uid] || []).push(entry);
  cards.set(uid, answer(before, rating, day));
  return { before, entry };
}

/**
 * A spot check (review_play) found that an answer "Remembered" wasn't: `step` ({before, entry} from recordAnswer) is
 * taken back (its rating 0, which every device's sync keeps: app/sync/engine.py, mobile sync.js) and "Not remembered"
 * is given in its place a moment later on the same day. The word's state is then exactly what "Not remembered" would
 * have made it. Only the word's latest answer can be regraded (null otherwise). Returns the new entry.
 */
export function regradeAnswer({ cards, log, uid, step, now }) {
  const list = log[uid] || [];
  const latest = [...list].reverse().find((e) => e[1] !== 0);
  if (!step || latest !== step.entry || step.entry[1] === AGAIN) return null;
  step.entry[1] = 0;
  const entry = [Math.max(Math.floor(now), step.entry[0] + 1), AGAIN, step.entry[2], step.entry[3]];
  list.push(entry);
  log[uid] = list;
  cards.set(uid, answer(step.before, AGAIN, step.entry[2]));
  return entry;
}
