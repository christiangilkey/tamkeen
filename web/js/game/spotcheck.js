// "Review while you play" (prototype "review_play"; the screens are game/reviewplay.js): the spot checks and the
// "memory calls" meter. Rules only, no page code (the tests run it without a browser).
//
// The owner, 2026-11-27: about 1 in 6 cards marked "Remembered" gets a quick check in the game's panel, the word with
// four meanings to pick from ("four meanings only for spot checks"), about 3 seconds. Right: "Sharp!", and the next
// catch or harvest is luckier. Wrong, or no answer in time: the card is regraded "Not remembered", with no other
// penalty. How often "Remembered" holds up is the memory calls meter; a high one raises the odds of rare fish and golden
// crops. A check comes a couple of cards after its card, not straight away: the card's back, with its meaning, has
// only just been shown.

import { prompt, reviewable, uidOf } from "../review/deck.js";

export const CHECK_EVERY = 6;      // about one "Remembered" card in this many is checked
export const CHECK_AFTER = 2;      // ...this many cards later
export const CHECK_SECONDS = 3;    // the time to pick its meaning
export const CALLS_KEPT = 40;      // the checks the meter remembers (the latest)
export const CALLS_MIN = 5;        // checks before the meter changes any luck
export const CALLS_FLOOR = 0.6;    // a share of right checks at or under this adds no luck...
export const CALLS_LUCK_MAX = 1.5; // ...and all of them right gives this much on every catch and harvest
export const SHARP_LUCK = 1.5;     // a check passed: the next catch or harvest

/** The meter's record in the saved game: the latest checks, oldest first, "1" right and "0" wrong. */
export function callsOf(state) {
  const r = state && typeof state.calls === "string" ? state.calls.replace(/[^01]/g, "") : "";
  return r.slice(-CALLS_KEPT);
}

/** A check answered: right (`ok`) or not. Kept in the saved game, so it travels with the game to other devices. */
export function noteCall(state, ok) {
  state.calls = (callsOf(state) + (ok ? "1" : "0")).slice(-CALLS_KEPT);
  return state.calls;
}

/** The share of checks answered right (0..1), or null before the first one. */
export function callShare(state) {
  const r = callsOf(state);
  return r.length ? [...r].filter((c) => c === "1").length / r.length : null;
}

/** The meter's luck on every catch and harvest: 1 until CALLS_MIN checks, then up to CALLS_LUCK_MAX with all right. */
export function callsLuck(state) {
  const r = callsOf(state);
  if (r.length < CALLS_MIN) return 1;
  const share = callShare(state);
  const over = Math.max(0, Math.min(1, (share - CALLS_FLOOR) / (1 - CALLS_FLOOR)));
  return Math.round((1 + over * (CALLS_LUCK_MAX - 1)) * 100) / 100;
}

/** Whether this "Remembered" card is one to check (`rand`: 0..1). */
export const wantsCheck = (rand = Math.random) => rand() < 1 / CHECK_EVERY;

const meaningOf = (v) => { const p = prompt(v); return p ? p.meaning.trim() : ""; };
const same = (a, b) => a.toLocaleLowerCase() === b.toLocaleLowerCase();

/**
 * A check on word `v`: {uid, word (its text), options (four meanings, its own among them), answer (that one's index)},
 * the other three from other cards in `words` with a meaning unlike its own. Null when there aren't three of those
 * (a check that couldn't be told apart is no check).
 */
export function checkFor(v, words, rand = Math.random) {
  const own = meaningOf(v);
  if (!own || !v.text) return null;
  const pool = [];
  for (const w of words || []) {
    if (w === v || uidOf(w) === uidOf(v) || !reviewable(w)) continue;
    const m = meaningOf(w);
    if (m && !same(m, own) && !pool.some((x) => same(x, m))) pool.push(m);
  }
  if (pool.length < 3) return null;
  const others = [];
  while (others.length < 3) others.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  const answer = Math.floor(rand() * 4);
  const options = [...others];
  options.splice(answer, 0, own);
  return { uid: uidOf(v), word: v.text, options, answer };
}

/**
 * The checks waiting (a list of {word, at}): after answer number `n` of the session (counting from 1), the first whose
 * turn has come, taken out of the list; else null.
 */
export function dueCheck(waiting, n) {
  const i = waiting.findIndex((c) => c.at <= n);
  return i < 0 ? null : waiting.splice(i, 1)[0];
}
