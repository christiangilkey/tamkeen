// The reviewer's timers (web/js/review/cardtimer.js): the stopwatch that stops while the app is
// hidden, the session clock's text, and the timer settings.
import { test } from "node:test";
import assert from "node:assert/strict";
import { GOAL_CHOICES, clockText, goalSeconds, setTimer, stopwatch, timerSettings } from "../../web/js/review/cardtimer.js";

test("the stopwatch counts only while it runs and the app is in front", () => {
  let now = 0;
  const w = stopwatch(() => now);
  w.start();
  now = 5000;
  assert.equal(w.ms(), 5000);
  w.pause();             // the app hidden for 20 s
  now = 25000;
  assert.equal(w.ms(), 5000);
  w.resume();
  now = 27000;
  assert.equal(w.ms(), 7000);
  w.stop();              // the card answered
  now = 40000;
  assert.equal(w.ms(), 7000);
  w.pause(); w.resume(); // coming back to the app doesn't start a stopped stopwatch
  now = 50000;
  assert.equal(w.ms(), 7000);
  w.go();                // carry on from there ("Learn more" after the end of a session)
  now = 51000;
  assert.equal(w.ms(), 8000);
  w.start();             // the next card: from zero
  assert.equal(w.ms(), 0);
});

test("a stopwatch started while the app is hidden waits for it to come back", () => {
  let now = 0;
  const w = stopwatch(() => now);
  w.pause();
  w.start();
  now = 9000;
  assert.equal(w.ms(), 0);
  w.resume();
  now = 10000;
  assert.equal(w.ms(), 1000);
});

test("the session clock reads like a clock", () => {
  assert.deepEqual([0, 999, 42000, 65000, 12 * 60000 + 5000, 3600000 + 2 * 60000 + 10000].map(clockText),
    ["0:00", "0:00", "0:42", "1:05", "12:05", "1:02:10"]);
  assert.equal(clockText(-5), "0:00");
});

test("timer settings: on at first, 'Auto' goal, only the offered goals kept", () => {
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
  try {
    assert.deepEqual(timerSettings(), { bar: true, clock: true, goal: "auto" });
    setTimer("bar", false);
    setTimer("goal", 20);
    assert.deepEqual(timerSettings(), { bar: false, clock: true, goal: 20 });
    setTimer("goal", 17);  // not one of the choices: ignored
    assert.equal(timerSettings().goal, 20);
    store.set("reviewCardGoal", "\"soon\"");
    assert.equal(timerSettings().goal, "auto", "a stored value that makes no sense");
  } finally {
    delete globalThis.localStorage;
  }
  assert.ok(GOAL_CHOICES.includes("auto"));
  assert.equal(goalSeconds("auto", 15), 15);
  assert.equal(goalSeconds(30, 15), 30);
});
