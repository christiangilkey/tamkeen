// The day's goal under the Review banner (web/js/review/goal.js): the looks at each word, what a
// look of each kind costs, the day's counts, the estimate and how it is said.
import { test } from "node:test";
import assert from "node:assert/strict";
import { AGAIN, GOOD } from "../../web/js/review/fsrs.js";
import { states } from "../../web/js/review/deck.js";
import {
  AWAY_MS, GAP_MS, GUESS, KEEP, PRIOR_LOOKS, blend, cardGoal, estimate, evened, expectedReviews, looks, model, recordTimes,
  roundMinutes, timeText, today, withTime, wordCost,
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

test("a time evens out the fastest and slowest twentieth, and leans on a guess until there are looks", () => {
  const twenty = [100, ...new Array(18).fill(4000), 59000];
  assert.deepEqual(evened(twenty), new Array(20).fill(4000), "pulled in to the edge of the rest, not dropped");
  assert.deepEqual(evened([3000, 50000]), [3000, 50000], "too few to say what is unusual");
  assert.equal(blend([], 7000, PRIOR_LOOKS), 7000, "nothing measured: the guess");
  near(blend(new Array(PRIOR_LOOKS).fill(15000), 7000, PRIOR_LOOKS), 11000, "as many looks as the guess counts for: halfway");
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
const close = (a, b, share, what) => assert.ok(Math.abs(a - b) <= b * share, `${what}: ${a} vs ${b}`);

test("the model times remembered and missed looks apart, and leans on this device's own", () => {
  const log = { ...makeLog(150, { r1: GOOD, ms1: 6000 }), ...makeLog(150, { r1: AGAIN, ms1: 14000, ms2: 4000, t0: 5000 }) };
  const m = model(log);
  assert.equal(m.new.from, "log");
  close(m.new.yes, 6000, 0.03, "new remembered");
  close(m.new.no, 14000, 0.03, "new missed");
  near(m.new.rate, (150 + 5 * GUESS.new[2]) / (300 + 5), "share remembered: the last 300, nudged by the guess");
  close(m.again.yes, 4000, 0.03, "a return look");
  // This device gave only remembered new looks, twice as slow: its times win, a little at a time,
  // and the share remembered still comes from everything.
  const fast = makeLog(10, { ms1: 12000, t0: 90000 });
  const all = { ...log, ...fast };
  const here = new Set(Object.values(fast).map((e) => e[0][0]));
  const mine = model(all, here);
  assert.equal(mine.new.from, "device");
  assert.equal(mine.new.here, 10);
  assert.ok(mine.new.yes > model(all).new.yes + 1000 && mine.new.yes < 12000, `between all answers and this device's: ${mine.new.yes}`);
  near(mine.new.rate, model(all).new.rate, "share remembered");
  const lots = makeLog(300, { ms1: 12000, t0: 90000 });
  close(model({ ...log, ...lots }, new Set(Object.values(lots).map((e) => e[0][0]))).new.yes, 12000, 0.05, "plenty here: this device's");
  assert.equal(model({}).review.from, "guess");
  assert.deepEqual([model({}).review.yes, model({}).review.no], GUESS.review.slice(0, 2), "nothing yet: the guess");
});

test("the estimate moves toward the measured pace a little at a time, with no jump at any count", () => {
  // Every review takes 18 s. The old maths kept the guess for 9 looks, then jumped at the 10th.
  const t = { newLeft: 0, newBusy: 0, revLeft: 20, revBusy: 0 };
  const est = (n) => estimate(t, model(makeLog(n, { kind: "review", ms1: 18000 }))).ms;
  const steps = [0, 1, 2, 3, 5, 8, 9, 10, 11, 15, 20, 40, 80].map(est);
  for (let i = 1; i < steps.length; i++) {
    assert.ok(steps[i] >= steps[i - 1], `never back down toward the guess (${i})`);
    assert.ok(steps[i] - steps[i - 1] < steps[0] * 0.3, `no big step (${i}): ${steps[i - 1]} -> ${steps[i]}`);
  }
  close(est(300), 20 * (18000 + GAP_MS), 0.05, "in the end, the measured pace");
});

test("before any word has come back after a miss, a return look is timed like a review", () => {
  const log = makeLog(200, { kind: "review", ms1: 7000 });
  const m = model(log);
  assert.equal(m.again.n, 0);
  close(m.again.yes, GUESS.again[0] * (m.review.yes / GUESS.review[0]), 1e-9, "the guess, as much faster or slower as the reviews are");
  near(m.again.rate, GUESS.again[2], "its share remembered is still its own");
});

test("away looks don't count for time, and only the last KEEP looks of a kind do", () => {
  const log = { ...makeLog(300, { ms1: 5000 }), ...makeLog(20, { ms1: AWAY_MS, t0: 50000 }) };
  close(model(log).new.yes, 5000, 0.03, "away looks left out");
  const old = makeLog(KEEP, { ms1: 30000 });
  const recent = makeLog(KEEP, { ms1: 6000, t0: 10 * KEEP + 10 });
  close(model({ ...old, ...recent }).new.yes, 6000, 0.03, "only recent looks");
});

test("the moment between cards is measured from the answers", () => {
  const log = {};
  for (let i = 0; i < 30; i++) log[`g${i}`] = [[i * 10000, GOOD, DAY, 9700]];  // a look of 9.7 s every 10 s: 0.3 s between
  assert.equal(model(log).gap, 300);
  assert.equal(model({}).gap, GAP_MS, "nothing measured yet");
});

test("a card's time goal is a little over the learner's own time to remember one", () => {
  const m = { new: { yes: 16000 }, review: { yes: 7000 }, again: { yes: 3000 } };
  assert.equal(cardGoal(m, "new"), 20);      // 16 s x 1.2 = 19.2, rounded up to 5
  assert.equal(cardGoal(m, "review"), 10);   // 8.4 -> 10
  assert.equal(cardGoal(m, "again"), 5);     // never under 5 s
  assert.equal(cardGoal({ ...m, new: { yes: 90000 } }, "new"), 60, "never over a minute");
  assert.equal(cardGoal(model({}), "review"), 10, "a first guess");
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
  // Few looks behind the review times (most of the time left): a range, narrowing as looks come in.
  const width = (n) => { const x = estimate(t, { ...m, review: { ...m.review, n } }); return (x.hi - x.lo) / x.ms; };
  const few = estimate(t, { ...m, review: { ...m.review, n: PRIOR_LOOKS } });
  assert.ok(few.lo < few.ms && few.hi > few.ms && !few.guess);
  assert.ok(width(0) > width(4) && width(4) > width(PRIOR_LOOKS), "narrower with every look");
  assert.equal(width(60), 0, "enough looks: one number");
  // Still mostly a guess: a range, and said so. A kind with nothing left doesn't matter.
  const guessed = estimate(t, { ...m, new: { ...m.new, from: "guess", n: 0 } });
  assert.ok(guessed.guess && guessed.hi > guessed.lo);
  assert.equal(estimate({ newLeft: 0, newBusy: 0, revLeft: 4, revBusy: 0 }, { ...m, new: { ...m.new, from: "guess", n: 0 } }).guess, false);
  // Return looks with little measured behind them don't widen an estimate that is mostly firm.
  const big = { newLeft: 0, newBusy: 0, revLeft: 40, revBusy: 1 };
  assert.equal(estimate(big, { ...m, again: { ...m.again, n: 2 } }).hi, estimate(big, m).ms);
});

test("times are rounded as people say them", () => {
  assert.deepEqual([0.4, 7.4, 14.6, 23, 47, 58, 64, 86].map(roundMinutes), [1, 7, 15, 25, 45, 60, 60, 90]);
  assert.equal(timeText({ ms: 0 }), "");
  assert.equal(timeText({ ms: 20000 }), "under a minute");
  assert.equal(timeText({ ms: 9 * MIN }), "about 9 min");
  assert.equal(timeText({ ms: 9 * MIN }, true), "About 9 min", "written out with a capital, to be translated as shown");
  assert.equal(timeText({ ms: 20000 }, true), "Under a minute");
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
