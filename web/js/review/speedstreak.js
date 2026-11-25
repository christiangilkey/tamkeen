// Speed streak: the reviewer's time bar as a countdown (the owner asked for it to work like the Anki add-on
// "Speed Streak"; written for Tamkeen from scratch, none of its code or art is used). Each side of a card has
// its own time: the front the card's time goal (review/goal.js cardGoal, or the seconds chosen), the back a
// few seconds to read it and answer. Answering before the bar runs out, either answer, adds one to the speed
// streak: not knowing a word is an honest answer and keeps the streak going. Letting the bar run out resets
// it to 0, and that is all: nothing is answered for the learner, the card stays. Every few cards answered in
// time earn a time boost, which adds seconds to the bar on the table.
//
// The calm bar from before (it fills toward the time goal and never hurries) stays as a choice in the
// reviewer's settings, for anyone a countdown stresses. The streak and the best ones are kept on this device
// (localStorage, like the reviewer's other settings) and carry on from one session to the next.
//
// Pure apart from the storage helpers at the end; tested in tests/js/speedstreak.test.mjs; drawn by review.js.

export const MODES = ["speed", "calm"];
export const BACK_CHOICES = [5, 10, 20, 30];   // seconds on the back
export const BACK_MIN = 3, BACK_MAX = 120;      // seconds that can be typed in instead (review/customchip.js)
const goodBack = (n) => Number.isInteger(n) && n >= BACK_MIN && n <= BACK_MAX;
export const BOOST = { every: 10, max: 3, start: 1, seconds: 10 };

/** A record as it may be kept: {streak, best, day, dayBest, boosts, toward}. */
export function cleanRecord(raw) {
  const n = (x, most = 1e9) => (Number.isFinite(x) ? Math.min(most, Math.max(0, Math.floor(x))) : 0);
  const r = raw && typeof raw === "object" ? raw : {};
  return {
    streak: n(r.streak), best: Math.max(n(r.best), n(r.streak)), day: n(r.day), dayBest: n(r.dayBest),
    boosts: Number.isFinite(r.boosts) ? n(r.boosts, BOOST.max) : BOOST.start, toward: n(r.toward, BOOST.every - 1),
  };
}

/** Today's best, as kept for `day` (0 when the record is from another day). */
export const todayBest = (rec, day) => (rec.day === day ? rec.dayBest : 0);

/**
 * A card answered on `day`, in time or not. Returns {rec, best, dayBest, boost}: the new record, and whether
 * this answer set a new all-time best, a new best for today, or earned a boost.
 */
export function answered(record, inTime, day) {
  const rec = cleanRecord(record);
  if (rec.day !== day) { rec.day = day; rec.dayBest = 0; }
  if (!inTime) { rec.streak = 0; return { rec, best: false, dayBest: false, boost: false }; }
  rec.streak += 1;
  const best = rec.streak > rec.best;
  const dayBest = rec.streak > rec.dayBest;
  if (best) rec.best = rec.streak;
  if (dayBest) rec.dayBest = rec.streak;
  let boost = false;
  rec.toward += 1;
  if (rec.toward >= BOOST.every) {
    rec.toward = 0;
    if (rec.boosts < BOOST.max) { rec.boosts += 1; boost = true; }
  }
  return { rec, best, dayBest, boost };
}

/** The bar ran out: the streak goes back to 0 (the boosts and the bests stay). */
export function timedOut(record) {
  return { ...cleanRecord(record), streak: 0 };
}

/** Spend a boost: the record without it, or null when there is none to spend. */
export function useBoost(record) {
  const rec = cleanRecord(record);
  return rec.boosts > 0 ? { ...rec, boosts: rec.boosts - 1 } : null;
}

/** How full the countdown is (1 .. 0) after `ms` of a side that has `seconds`, and its colour step:
 * "" while there is time, "warn" in the last 40%, "low" in the last 15%, "out" when it has run out. */
export function barState(ms, seconds) {
  const left = seconds > 0 ? Math.max(0, 1 - ms / (seconds * 1000)) : 0;
  return { left, step: left <= 0 ? "out" : left <= 0.15 ? "low" : left <= 0.4 ? "warn" : "" };
}

// ----- this device's settings and record (localStorage) -----

const KEYS = { mode: "reviewTimerMode", back: "reviewBackSeconds", boosts: "reviewBoosts", record: "reviewSpeed" };
function pref(key, fallback) {
  try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; }
}
function setPref(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
}

/** {mode, back, boosts}: the countdown or the calm bar, seconds on the back, boosts on or off. */
export function speedSettings() {
  const mode = pref(KEYS.mode, "speed"), back = pref(KEYS.back, 10);
  return { mode: MODES.includes(mode) ? mode : "speed", back: goodBack(back) ? back : 10, boosts: pref(KEYS.boosts, true) !== false };
}
export function setSpeed(name, value) {
  if (name === "mode" && MODES.includes(value)) setPref(KEYS.mode, value);
  if (name === "back" && goodBack(value)) setPref(KEYS.back, value);
  if (name === "boosts") setPref(KEYS.boosts, Boolean(value));
}
export const loadRecord = () => cleanRecord(pref(KEYS.record, null));
export const saveRecord = (rec) => setPref(KEYS.record, cleanRecord(rec));

/**
 * Should the countdown (and the card's own clock, which times the answer) wait? Only while recalling the word
 * holds the learner's attention does time count. `s`, gathered by pages/review.js:
 *   overlay    a box, a question, a tour or the Luck sheet over the cards, or the reviewer's settings open
 *   editing    a text of the card open for typing (a tap on it)
 *   typing     the keyboard's focus in any text box in the reviewer (meaning, notes, memo, a tool's box): on a
 *              phone that is when its keyboard is up
 *   flipped    the back is showing
 *   toolOpen   a tool open under the back: the Mnemonic maker (from asking for mnemonics until one is chosen
 *              or it is closed), a sentence, a recording, the folders
 *   scrollTop  how far the back is scrolled down; lineTop: where the line over its notes and tools is, from the
 *              top of the card's view; viewHeight: the view's height; atEnd: scrolled to the bottom
 * Scrolled down so that line is in the top quarter of the card, or scrolled right down to the end, means the notes
 * and tools, not the answer, are what is being looked at: choosing a mnemonic below. The owner, 2026-11-25: "when typing in a box or when waiting on mnemonics to
 * load or scrolling below that line to choose a mnemonic, the streak timer should freeze."
 */
export function shouldHold(s) {
  if (s.overlay || s.editing || s.typing) return true;
  if (!s.flipped) return false;
  if (s.toolOpen) return true;
  if (!(s.scrollTop > 8)) return false;
  return Boolean(s.atEnd && s.scrollTop > 40) || (s.viewHeight > 0 && s.lineTop <= s.viewHeight * 0.25);
}
