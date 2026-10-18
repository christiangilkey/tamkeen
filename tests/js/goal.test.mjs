// The day's goal under the Review banner (web/js/review/goal.js): the looks at each word, what a
// look of each kind costs, the day's counts, the estimate and how it is said.
import { test } from "node:test";
import assert from "node:assert/strict";
import { AGAIN, GOOD } from "../../web/js/review/fsrs.js";
import { states } from "../../web/js/review/deck.js";
import {
  AWAY_MS, ENOUGH, GAP_MS, GUESS, KEEP, estimate, expectedReviews, looks, model, recordTimes, roundMinutes,
  timeText, today, typical, withTime, wordCost,
} from "../../web/js/review/goal.js";

const DAY = 20000;
const MIN = 60000;
const word = (uid, created_at = 1) => ({ uid, id: uid, text: `كلمة${uid}`, meaning: `meaning ${uid}`, created_at });
const near = (a, b, what) => assert.ok(Math.abs(a - b) < 1e-6, `${what}: ${a} vs ${b}`);

test("each look is new, review or again, and a look at the cap is marked away", () => {
  const entries = [
    [1000, AGAIN, DAY, 9000], [2000, AGAIN, DAY, 7000], [3000, GOOD, DAY, 5000],  // new: missed twice, then remembered
    [4000, GOOD, DAY + 2, 6000],                                                  // a review two days later
    [5000, AGAIN, DAY + 9, AWAY_MS], [5500, 0, DAY + 9, 3000],                    // left open while away; one taken back
  ];
  assert.deepEqual(looks({ w: entries }).map((l) => [l.kind, l.yes, l.ms, l.away]), [
    ["new", false, 9000, false], ["again", false, 7000, false], ["again", true, 5000, false],
    ["review", true, 6000, false], ["review", false, AWAY_MS, true],
  ]);
});

test("a typical time leaves out the fastest and slowest twentieth, and needs enough looks", () => {
  assert.equal(typical(new Array(ENOUGH - 1).fill(5000)), null);
  assert.equal(typical(new Array(ENOUGH).fill(5000)), 5000);
  const twenty = [100, ...new Array(18).fill(4000), 59000];
  assert.equal(typical(twenty), 4000);
});

/** A log of `n` words with the same day: each a first look (rating r1, ms1) and, if missed, a return look (GOOD, ms2). */
function makeLog(n, { day = DAY - 1, kind = "new", r1 = GOOD, ms1 = 8000, ms2 = 5000, t0 = 0 } = {}) {
  const log = {};
  for (let i = 0; i < n; i++) {
    const before = kind === "review" ? [[t0 + i * 10 + 1, GOOD, day - 3, 9000]] : [];
    const first = [t0 + i * 10 + 2, r1, day, ms1];
    log[`${kind}${t0}-${i}`] = r1 === GOOD ? [...before, first] : [...before, first, [t0 + i * 10 + 3, GOOD, day, ms2]];
  }
  return log;
}

test("the model times remembered and missed looks apart, and prefers this device's own", () => {
  const log = { ...makeLog(20, { r1: GOOD, ms1: 6000 }), ...makeLog(20, { r1: AGAIN, ms1: 14000, ms2: 4000, t0: 1000 }) };
  const m = model(log);
  assert.equal(m.new.from, "log");
  near(m.new.yes, 6000, "new remembered");
  near(m.new.no, 14000, "new missed");
  near(m.new.rate, (20 + 5 * GUESS.new[2]) / (40 + 5), "share remembered, nudged by the guess");
  near(m.again.yes, 4000, "a return look");
  // This device gave only the remembered ones: its times win, the share still comes from everything.
  const here = new Set(looks(log).filter((l) => l.yes && l.kind === "new").map((l) => l.t));
  const mine = model(log, here);
  assert.equal(mine.new.from, "device");
  near(mine.new.no, 6000, "too few misses here: all of this device's looks stand in");
  near(mine.new.rate, m.new.rate, "share remembered");
  assert.equal(model({}).review.from, "guess");
});

test("before any word has come back after a miss, a return look is timed like a review", () => {
  const log = makeLog(ENOUGH, { kind: "review", ms1: 7000 });
  const m = model(log);
  assert.equal(m.again.from, "log");
  near(m.again.yes, 7000, "borrowed from the reviews");
  near(m.again.rate, GUESS.again[2], "its share remembered is still its own");
});

test("away looks don't count for time, and only the last KEEP looks of a kind do", () => {
  const log = { ...makeLog(ENOUGH, { ms1: 5000 }), ...makeLog(5, { ms1: AWAY_MS, t0: 500 }) };
  near(model(log).new.yes, 5000, "away looks left out");
  const old = makeLog(KEEP, { ms1: 30000 });
  const recent = makeLog(KEEP, { ms1: 6000, t0: 10 * KEEP + 10 });
  near(model({ ...old, ...recent }).new.yes, 6000, "only recent looks");
});

test("a word's cost counts the looks it takes coming back after a miss", () => {
  const m = {
    new: { yes: 10000, no: 20000, rate: 0.5 }, review: { yes: 5000, no: 9000, rate: 0.9 },
    again: { yes: 4000, no: 6000, rate: 0.8 },
  };
  // Back after a miss: 1/0.8 = 1.25 looks on average, the last remembered: 4000 + 0.25 * 6000.
  const back = 4000 + (0.2 / 0.8) * 6000;
  near(wordCost(m, "again").ms, back + 1.25 * GAP_MS, "again");
  near(wordCost(m, "new").ms, 0.5 * 10000 + 0.5 * (20000 + back) + (1 + 0.5 * 1.25) * GAP_MS, "new");
  near(wordCost(m, "new").looks, 1.625, "new looks");
  near(wordCost(m, "review").ms, 0.9 * 5000 + 0.1 * (9000 + back) + (1 + 0.1 * 1.25) * GAP_MS, "review");
  // A word that is almost never remembered on return still has an end.
  assert.ok(Number.isFinite(wordCost({ ...m, again: { yes: 1, no: 1, rate: 0 } }, "new").ms));
});

test("today's counts: new done and left against the goal, reviews done and left against what is due", () => {
  const words = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => word(`w${n}`, n));
  const log = {
    w1: [[1, GOOD, DAY, 5000]],                            // new today, remembered
    w2: [[2, AGAIN, DAY, 5000]],                           // new today, still to remember
    w3: [[3, GOOD, DAY - 5, 5000], [4, GOOD, DAY, 5000]],  // a review done today
    w4: [[5, GOOD, DAY - 5, 5000], [6, AGAIN, DAY, 5000]], // a review missed today: still to do
    w5: [[7, GOOD, DAY - 3, 5000]],                        // due today (its first wait is 2 days)
    w6: [[8, GOOD, DAY - 1, 5000]],                        // not due yet
  };
  const t = today(words, states(log), DAY, 3);
  assert.deepEqual(t, { goal: 3, newDone: 1, newLeft: 2, newBusy: 1, newTarget: 3, revDone: 1, revLeft: 2, revBusy: 1, revTarget: 3,
                        waiting: 4, expected: 30 });
  assert.equal(today(words, states(log), DAY, 0).newTarget, 2, "a goal of 0 still counts the words started today");
  assert.equal(today(words, states(log), DAY, 50).newTarget, 2 + 4, "fewer unseen words than the goal");
});

test("the estimate adds up what each word left costs, and is a range while uncertain", () => {
  const firm = (yes, no, rate) => ({ yes, no, rate, n: 100, from: "log" });
  const m = { new: firm(10000, 20000, 0.5), review: firm(5000, 9000, 0.9), again: firm(4000, 6000, 0.8) };
  const t = { newLeft: 3, newBusy: 1, revLeft: 10, revBusy: 2 };
  const want = 2 * wordCost(m, "new").ms + 8 * wordCost(m, "review").ms + 3 * wordCost(m, "again").ms;
  const e = estimate(t, m);
  near(e.ms, want, "total");
  assert.equal(e.lo, e.ms);
  assert.equal(e.hi, e.ms);
  assert.equal(estimate({ newLeft: 0, newBusy: 0, revLeft: 0, revBusy: 0 }, m).ms, 0);
  // Few looks behind the review times: a range.
  const few = estimate(t, { ...m, review: { ...m.review, n: 12 } });
  assert.ok(few.lo < few.ms && few.hi > few.ms && !few.guess);
  // A guess: a wider range, and said so. A kind with nothing left doesn't matter.
  const guessed = estimate(t, { ...m, new: { ...m.new, from: "guess", n: 0 } });
  assert.ok(guessed.guess && guessed.hi - guessed.lo > few.hi - few.lo);
  assert.equal(estimate({ newLeft: 0, newBusy: 0, revLeft: 4, revBusy: 0 }, { ...m, new: { ...m.new, from: "guess", n: 0 } }).guess, false);
});

test("times are rounded as people say them", () => {
  assert.deepEqual([0.4, 7.4, 14.6, 23, 47, 58, 64, 86].map(roundMinutes), [1, 7, 15, 25, 45, 60, 60, 90]);
  assert.equal(timeText({ ms: 0 }), "");
  assert.equal(timeText({ ms: 20000 }), "under a minute");
  assert.equal(timeText({ ms: 9 * MIN }), "about 9 min");
  assert.equal(timeText({ ms: 23 * MIN }), "about 25 min");
  assert.equal(timeText({ ms: 80 * MIN }), "about 1 h 20 min");
  assert.equal(timeText({ ms: 10 * MIN, lo: 8 * MIN, hi: 12 * MIN }), "8–12 min");
  assert.equal(timeText({ ms: 60 * MIN, lo: 48 * MIN, hi: 72 * MIN }), "50 min – 1 h 10 min");
  assert.equal(timeText({ ms: 2 * MIN, lo: 1.8 * MIN, hi: 2.2 * MIN }), "about 2 min", "a range that rounds to one number");
});

test("reviews to expect: about 10 a day for each new word a day", () => {
  assert.equal(expectedReviews(20), 200);
  assert.equal(expectedReviews(0), 0);
});

test("this device keeps the times of its answers; Undo takes one back; the older record is still read", () => {
  let rec = null;
  for (let t = 1; t <= 905; t++) rec = withTime(rec, t);
  assert.equal(rec.ts.length, 900);
  assert.equal(rec.ts[0], 6, "the oldest went first");
  assert.deepEqual(withTime({ ts: [1, 2, 3] }, 2, false), { ts: [1, 3] });
  assert.deepEqual(withTime({ ts: [1, 2] }, 2), { ts: [1, 2] }, "the same answer twice is kept once");
  assert.deepEqual(recordTimes({ new: [[5, 9000]], review: [[3, 4000]] }), [3, 5]);
  assert.deepEqual(recordTimes("nonsense"), []);
});
