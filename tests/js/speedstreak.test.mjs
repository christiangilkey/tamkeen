// The speed streak (web/js/review/speedstreak.js): the countdown's rules, the bests and the boosts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { BOOST, answered, setSpeed, speedSettings, barState, cleanRecord, timedOut, todayBest, useBoost } from "../../web/js/review/speedstreak.js";

const DAY = 20400;

test("a new record starts with no streak and the starting boosts", () => {
  assert.deepEqual(cleanRecord(null), { streak: 0, best: 0, day: 0, dayBest: 0, boosts: BOOST.start, toward: 0 });
  assert.deepEqual(cleanRecord({ streak: 4.7, best: 2, boosts: 99, toward: -3 }), { streak: 4, best: 4, day: 0, dayBest: 0, boosts: BOOST.max, toward: 0 });
});

test("either answer in time adds to the streak; running out only resets it", () => {
  let r = cleanRecord(null);
  for (let i = 0; i < 3; i++) r = answered(r, true, DAY).rec;
  assert.equal(r.streak, 3);
  assert.equal(r.best, 3);
  assert.equal(todayBest(r, DAY), 3);
  r = timedOut(r);
  assert.equal(r.streak, 0);
  assert.equal(r.best, 3);  // the bests and the boosts stay
  r = answered(r, false, DAY).rec;  // the card whose bar ran out: answered, but no point
  assert.equal(r.streak, 0);
  const next = answered(r, true, DAY);
  assert.equal(next.rec.streak, 1);
  assert.equal(next.best, false);
});

test("a new day starts a new best for the day; the all-time best carries on", () => {
  let r = cleanRecord(null);
  for (let i = 0; i < 5; i++) r = answered(r, true, DAY).rec;
  const tomorrow = answered(r, true, DAY + 1);
  assert.equal(tomorrow.rec.streak, 6);  // the streak itself carries on from one session and day to the next
  assert.equal(tomorrow.rec.dayBest, 6);
  assert.equal(todayBest(tomorrow.rec, DAY + 2), 0);
  const fresh = answered(timedOut(tomorrow.rec), true, DAY + 2);
  assert.equal(fresh.rec.dayBest, 1);
  assert.equal(fresh.rec.best, 6);
  assert.equal(fresh.dayBest, true);
  assert.equal(fresh.best, false);
});

test("a boost is earned every few cards in time, up to the most that can be banked, and spent one at a time", () => {
  let r = { ...cleanRecord(null), boosts: 0 };
  let earned = 0;
  for (let i = 0; i < BOOST.every * (BOOST.max + 2); i++) { const a = answered(r, true, DAY); r = a.rec; if (a.boost) earned++; }
  assert.equal(earned, BOOST.max);
  assert.equal(r.boosts, BOOST.max);
  const spent = useBoost(r);
  assert.equal(spent.boosts, BOOST.max - 1);
  assert.equal(useBoost({ ...r, boosts: 0 }), null);
});

test("the bar's colour steps", () => {
  assert.deepEqual(barState(0, 10), { left: 1, step: "" });
  assert.equal(barState(6500, 10).step, "warn");
  assert.equal(barState(9000, 10).step, "low");
  assert.deepEqual(barState(10000, 10), { left: 0, step: "out" });
  assert.equal(barState(50, 0).step, "out");
});

test("the back's time: a chip's, or one typed in from 3 to 120 seconds", () => {
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
  try {
    assert.equal(speedSettings().back, 10);
    setSpeed("back", 45);
    assert.equal(speedSettings().back, 45);
    for (const bad of [2, 121, 7.5]) setSpeed("back", bad);
    assert.equal(speedSettings().back, 45);
  } finally {
    delete globalThis.localStorage;
  }
});

test("the countdown waits while typing, while a tool such as the Mnemonic maker is open, and when scrolled down to the tools", async () => {
  const { shouldHold } = await import("../../web/js/review/speedstreak.js");
  const back = { flipped: true, scrollTop: 0, lineTop: 300, viewHeight: 600 };
  assert.equal(shouldHold(back), false);  // reading the answer: time counts
  assert.equal(shouldHold({ ...back, typing: true }), true);  // a box has the keyboard (memo, notes, meaning…)
  assert.equal(shouldHold({ flipped: false, typing: true }), true);  // on the front too
  assert.equal(shouldHold({ ...back, editing: true }), true);
  assert.equal(shouldHold({ ...back, overlay: true }), true);
  assert.equal(shouldHold({ ...back, toolOpen: true }), true);  // mnemonics loading or shown to choose from
  assert.equal(shouldHold({ flipped: false, toolOpen: true }), false);  // (the front has no tools)
  assert.equal(shouldHold({ ...back, scrollTop: 260, lineTop: 40 }), true);  // scrolled down to the tools
  assert.equal(shouldHold({ ...back, scrollTop: 60, lineTop: 240 }), false);  // a little way down: still the answer
  assert.equal(shouldHold({ ...back, scrollTop: 0, lineTop: 100 }), false);  // a short answer, not scrolled
  assert.equal(shouldHold({ ...back, scrollTop: 83, lineTop: 195, atEnd: true }), true);  // a short back scrolled right down to its tools
  assert.equal(shouldHold({ ...back, scrollTop: 20, lineTop: 260, atEnd: true }), false);  // (a nudge at the end isn't looking for the tools)
});
