// The day's goal under the Review banner (web/js/review/goal.js): the time each word takes, the
// typical time, the day's counts, the estimate and the reviews to expect.
import { test } from "node:test";
import assert from "node:assert/strict";
import { AGAIN, GOOD } from "../../web/js/review/fsrs.js";
import { states } from "../../web/js/review/deck.js";
import {
  AWAY_MS, ENOUGH, GUESS_MS, KEEP, addSample, dropSample, expectedReviews, finishedSample, logTimes,
  minutesText, pace, timeLeft, today, typical, wordDays,
} from "../../web/js/review/goal.js";

const DAY = 20000;
const word = (uid, created_at = 1) => ({ uid, id: uid, text: `كلمة${uid}`, meaning: `meaning ${uid}`, created_at });
const samples = (list) => list.map((ms, i) => [i + 1, ms]);

test("a word's day adds up every look at it, and knows new from review", () => {
  const entries = [
    [1000, AGAIN, DAY, 9000], [2000, AGAIN, DAY, 7000], [3000, GOOD, DAY, 5000],  // new: missed twice, then remembered
    [4000, GOOD, DAY + 2, 6000],                                                  // a review two days later
    [5000, AGAIN, DAY + 9, 8000],                                                 // missed on a later day, not yet remembered
  ];
  assert.deepEqual(wordDays(entries), [
    { day: DAY, t: 3000, kind: "new", ms: 21000, done: true, away: false },
    { day: DAY + 2, t: 4000, kind: "review", ms: 6000, done: true, away: false },
    { day: DAY + 9, t: 5000, kind: "review", ms: 8000, done: false, away: false },
  ]);
  assert.deepEqual(finishedSample(entries, DAY), { kind: "new", t: 3000, ms: 21000 });
  assert.equal(finishedSample(entries, DAY + 9), null, "not finished that day");
  assert.equal(finishedSample(entries, DAY + 5), null, "not answered that day");
});

test("answers taken back don't count, and a card left open while away drops the whole day", () => {
  const undone = [[1000, 0, DAY, 50000], [2000, GOOD, DAY, 4000]];
  assert.deepEqual(finishedSample(undone, DAY), { kind: "new", t: 2000, ms: 4000 });
  const away = [[1000, AGAIN, DAY, AWAY_MS], [2000, GOOD, DAY, 4000]];
  assert.equal(finishedSample(away, DAY), null);
  assert.equal(finishedSample([[1000, GOOD, DAY, 0]], DAY), null, "no time on record");
});

test("the log's times are sorted by kind, oldest first", () => {
  const log = {
    a: [[5000, GOOD, DAY, 10000], [9000, GOOD, DAY + 3, 3000]],
    b: [[1000, GOOD, DAY, 20000]],
    c: [[2000, AGAIN, DAY, 4000]],  // never finished
  };
  assert.deepEqual(logTimes(log), { new: [[1000, 20000], [5000, 10000]], review: [[9000, 3000]] });
});

test("the typical time leaves out the fastest and slowest tenth, and needs enough to go on", () => {
  assert.equal(typical(samples(new Array(ENOUGH - 1).fill(5000))), null);
  assert.equal(typical(samples(new Array(ENOUGH).fill(5000))), 5000);
  // 10 answers: one very slow one is trimmed away, so it doesn't drag the average.
  assert.equal(typical(samples([1000, 4000, 4000, 4000, 4000, 4000, 4000, 4000, 4000, 59000])), 4000);
  // Only the last KEEP count: 100 old slow ones, then 100 fast ones.
  assert.equal(typical(samples([...new Array(KEEP).fill(30000), ...new Array(KEEP).fill(6000)])), 6000);
});

test("pace: this device first, then the answers on record, then a guess", () => {
  const mine = { new: samples(new Array(ENOUGH).fill(12000)), review: [] };
  const log = {};
  for (let i = 0; i < ENOUGH; i++) log[`w${i}`] = [[i + 1, GOOD, DAY, 18000], [100 + i, GOOD, DAY + 4, 7000]];
  assert.deepEqual(pace(mine, log), { new: { ms: 12000, from: "device" }, review: { ms: 7000, from: "log" } });
  assert.deepEqual(pace(null, {}), { new: { ms: GUESS_MS.new, from: "guess" }, review: { ms: GUESS_MS.review, from: "guess" } });
});

test("today's counts: new done and left against the goal, reviews done and left against what is due", () => {
  const words = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => word(`w${n}`, n));
  const log = {
    w1: [[1, GOOD, DAY, 5000]],                          // new today, remembered
    w2: [[2, AGAIN, DAY, 5000]],                         // new today, still to remember
    w3: [[3, GOOD, DAY - 5, 5000], [4, GOOD, DAY, 5000]],  // a review done today
    w4: [[5, GOOD, DAY - 5, 5000], [6, AGAIN, DAY, 5000]], // a review missed today: still to do
    w5: [[7, GOOD, DAY - 3, 5000]],                      // due today (its first wait is 2 days)
    w6: [[8, GOOD, DAY - 1, 5000]],                      // not due yet
  };
  const t = today(words, states(log), DAY, 3);
  // Goal 3, two started today: one more unseen word may start (w7..w10 wait; the newest first).
  assert.deepEqual(t, { goal: 3, newDone: 1, newLeft: 2, newTarget: 3, revDone: 1, revLeft: 2, revTarget: 3, waiting: 4, expected: 30 });
  // A goal of 0 still counts the new words already started today.
  assert.equal(today(words, states(log), DAY, 0).newTarget, 2);
  // Fewer unseen words than the goal: the target is what can be done.
  assert.equal(today(words, states(log), DAY, 50).newTarget, 2 + 4);
});

test("the estimate is new words left x new time + reviews left x review time", () => {
  const p = { new: { ms: 20000 }, review: { ms: 8000 } };
  assert.equal(timeLeft({ newLeft: 3, revLeft: 10 }, p), 3 * 20000 + 10 * 8000);
  assert.equal(timeLeft({ newLeft: 0, revLeft: 0 }, p), 0);
});

test("reviews to expect: about 10 a day for each new word a day", () => {
  assert.equal(expectedReviews(20), 200);
  assert.equal(expectedReviews(5), 50);
  assert.equal(expectedReviews(0), 0);
});

test("time left in words", () => {
  assert.equal(minutesText(0), "");
  assert.equal(minutesText(20000), "under a minute");
  assert.equal(minutesText(9 * 60000), "about 9 min");
  assert.equal(minutesText(60 * 60000), "about 1 h");
  assert.equal(minutesText(80 * 60000), "about 1 h 20 min");
});

test("this device's record keeps the last 100 of each kind, and Undo takes a sample back", () => {
  let rec = { new: [], review: [] };
  for (let i = 1; i <= KEEP + 5; i++) rec = addSample(rec, { kind: "review", t: i, ms: 1000 });
  rec = addSample(rec, { kind: "new", t: 999, ms: 15000 });
  assert.equal(rec.review.length, KEEP);
  assert.deepEqual(rec.review[0], [6, 1000], "the oldest went first");
  assert.deepEqual(rec.new, [[999, 15000]]);
  assert.deepEqual(addSample(rec, { kind: "new", t: 999, ms: 16000 }).new, [[999, 16000]], "the same answer again replaces it");
  assert.deepEqual(dropSample(rec, 999).new, []);
  assert.deepEqual(addSample(undefined, { kind: "new", t: 1, ms: 2 }), { new: [[1, 2]], review: [] });
});
