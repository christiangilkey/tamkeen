// The reviewer's timers (an ADHD-friendly aid the owner asked for): a slim bar on each card that
// fills toward a time goal for that card, and a clock for the whole session in the top bar. They
// only show the time going by: nothing happens when a card runs over its goal, apart from the bar
// turning a calmer colour, and no answer is ever timed out. Both can be switched off in the
// reviewer's settings (they are on at first).
//
// The time counted is the time the reviewer was in front: while the app is hidden behind another
// window, or the phone shows another app, no clock runs. The answer log's times (review.js) are
// counted the same way, so a card left open while away no longer reads as a slow answer.
//
// The pure parts (the stopwatch, the clock's text, the settings' values) are tested in
// tests/js/cardtimer.test.mjs; review.js draws them.

export const GOAL_CHOICES = ["auto", 10, 20, 30, 60];  // a card's time goal: from the learner's own pace, or seconds
const KEYS = { bar: "reviewCardTimer", clock: "reviewSessionTimer", goal: "reviewCardGoal" };

function pref(key, fallback) {
  try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; }
}
function setPref(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
}

/** This device's timer settings: {bar, clock, goal} (bar and clock on/off; goal "auto" or seconds). */
export function timerSettings() {
  const goal = pref(KEYS.goal, "auto");
  return { bar: pref(KEYS.bar, true) !== false, clock: pref(KEYS.clock, true) !== false, goal: GOAL_CHOICES.includes(goal) ? goal : "auto" };
}
/** Change one of them: setTimer("bar", false), setTimer("goal", 20). */
export function setTimer(name, value) {
  if (!(name in KEYS)) return;
  if (name === "goal" && !GOAL_CHOICES.includes(value)) return;
  setPref(KEYS[name], name === "goal" ? value : Boolean(value));
}

/** The seconds a card has for its goal: the chosen number, or `auto` (worked out from the learner's pace). */
export const goalSeconds = (choice, auto) => (choice === "auto" ? auto : choice);

/**
 * A stopwatch that can be paused (the app hidden) and stopped (the card answered): {start(),
 * pause(), resume(), stop(), ms(), running}. pause/resume are separate from start/stop, so the app
 * coming back to the front never restarts a stopwatch that was stopped.
 */
export function stopwatch(now = () => Date.now()) {
  let total = 0, since = null, started = false, paused = false;
  const sw = {
    get running() { return since !== null; },
    /** Start from zero. */
    start() { total = 0; started = true; since = paused ? null : now(); return sw; },
    /** Keep counting from where it was (after stop(), say: "Learn more" at the end of a session). */
    go() { started = true; if (since === null && !paused) since = now(); return sw; },
    stop() { if (since !== null) total += now() - since; since = null; started = false; return sw; },
    pause() { if (since !== null) total += now() - since; since = null; paused = true; return sw; },
    resume() { paused = false; if (started && since === null) since = now(); return sw; },
    ms() { return total + (since !== null ? now() - since : 0); },
  };
  return sw;
}

/** The session clock's text: "0:42", "12:05", "1:02:10". */
export function clockText(ms) {
  const s = Math.max(0, Math.floor((ms || 0) / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const two = (n) => String(n).padStart(2, "0");
  return h ? `${h}:${two(m)}:${two(sec)}` : `${m}:${two(sec)}`;
}
