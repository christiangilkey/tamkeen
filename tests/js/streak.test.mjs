// The flashcard streak (web/js/review/streak.js): which days count, gaps, today not finished yet,
// rest days, a raised goal, and days at midnight and across time zones.
import { test } from "node:test";
import assert from "node:assert/strict";
import { AGAIN, GOOD, dayNumber } from "../../web/js/review/fsrs.js";
import { plan, states } from "../../web/js/review/deck.js";
import { today as goalToday } from "../../web/js/review/goal.js";
import { dayCheck, prepare, streak, streakNow, streakUntil } from "../../web/js/review/streak.js";

const D = 20000; // a day number to start from
const word = (uid, created_at = 1) => ({ uid, id: uid, text: `كلمة${uid}`, meaning: `meaning ${uid}`, created_at });
const words = (n, created_at = 1) => Array.from({ length: n }, (_, i) => word(`w${i}`, created_at));

let clock = 1e12;
/** Answer on `day`: every due word and the day's new words (all of them, or `only` this many). */
function study(list, log, day, goal, { only = Infinity, miss = [] } = {}) {
  const p = plan(list, states(log), day, goal);
  let n = 0;
  for (const v of [...p.due, ...p.fresh]) {
    if (n++ >= only) break;
    const uid = v.uid;
    (log[uid] = log[uid] || []);
    if (miss.includes(uid)) log[uid].push([clock++, AGAIN, day, 5000]);
    else log[uid].push([clock++, GOOD, day, 5000]);
  }
  return log;
}

test("days in a row of finished flashcards; today counts once it is done", () => {
  const list = words(40);
  const log = {};
  for (let d = D; d < D + 5; d++) study(list, log, d, 5);
  let s = streak(list, log, { today: D + 4, goal: 5 });
  assert.equal(s.days, 5);
  assert.equal(s.through, D + 4);
  assert.equal(s.today, "met");
  // The next morning, nothing done yet: still 5, ending yesterday, today open.
  s = streak(list, log, { today: D + 5, goal: 5 });
  assert.deepEqual([s.days, s.through, s.today], [5, D + 4, "open"]);
  // Two days later without studying: gone.
  s = streak(list, log, { today: D + 6, goal: 5 });
  assert.equal(s.days, 0);
  assert.equal(s.through, null);
});

test("fewer new words than the goal, while more were waiting, doesn't count", () => {
  const list = words(40);
  const log = {};
  study(list, log, D, 5);
  study(list, log, D + 1, 5, { only: 3 }); // stopped early: the due ones, but not all the new ones
  study(list, log, D + 2, 5);
  const s = streak(list, log, { today: D + 2, goal: 5 });
  assert.equal(s.days, 1, "the day before broke it");
  assert.equal(dayCheck(prepare(list, log), D + 1, 5).kind, "missed");
});

test("reviews left due break it; a new word missed and never remembered too", () => {
  const list = words(30);
  const log = {};
  study(list, log, D, 5);
  // The day yesterday's five come due (a first "remembered" waits a day or more).
  const next = Math.min(...[...states(log).values()].map((x) => x.due));
  assert.ok(plan(list, states(log), next, 5).due.length > 0);
  study(list, log, next, 0, { only: 2 }); // two reviews, then stopped
  assert.equal(dayCheck(prepare(list, log), next, 0).kind, "missed", "reviews left due");
  study(list, log, next, 0); // the rest of the reviews, but no new words
  assert.equal(dayCheck(prepare(list, log), next, 5).kind, "missed", "the day's new words not done");
  assert.equal(dayCheck(prepare(list, log), next, 0).kind, "met", "with 0 new words a day, the reviews alone are the day");

  const log2 = {};
  study(list, log2, D, 5, { miss: ["w0"] }); // w0 missed and left at that
  const c = dayCheck(prepare(list, log2), D, 5);
  assert.equal(c.kind, "missed");
  assert.equal(c.newLeft, 1);
  log2.w0.push([clock++, GOOD, D, 4000]); // came back and remembered the same day
  assert.equal(dayCheck(prepare(list, log2), D, 5).kind, "met");
});

test("the day's check agrees with the goal bar's counts", () => {
  const list = words(25);
  const log = {};
  for (let d = D; d < D + 6; d++) study(list, log, d, 4, { only: d === D + 5 ? 2 : Infinity, miss: d === D + 3 ? ["w1"] : [] });
  for (const d of [D + 5]) {
    const bar = goalToday(list, states(log), d, 4);
    const c = dayCheck(prepare(list, log), d, 4);
    assert.equal(c.newLeft, bar.newLeft);
    assert.equal(c.revLeft, bar.revLeft);
    assert.equal(c.newDone, bar.newDone);
  }
});

test("a gap starts the count again from after it", () => {
  const list = words(60);
  const log = {};
  for (const d of [D, D + 1, D + 2, /* D+3 missed */ D + 4, D + 5]) study(list, log, d, 5);
  const s = streak(list, log, { today: D + 5, goal: 5 });
  assert.equal(s.days, 2);
  assert.deepEqual(s.met, [D + 5, D + 4]);
});

test("a day with nothing to do neither adds nor breaks; doing nothing when new words waited breaks", () => {
  // Two words learned, then nothing due for a while and no new words left: rest days.
  const list = words(2);
  const log = {};
  study(list, log, D, 5);
  const c = dayCheck(prepare(list, log), D + 1, 5);
  assert.equal(c.kind, "rest");
  let s = streak(list, log, { today: D + 1, goal: 5 });
  assert.deepEqual([s.days, s.today], [1, "rest"]);
  // When they come due and are reviewed, the streak carries on over the rest days.
  const next = Math.min(...[...states(log).values()].map((x) => x.due));
  study(list, log, next, 5);
  s = streak(list, log, { today: next, goal: 5 });
  assert.equal(s.days, 2, `rest days from ${D + 1} to ${next - 1} are passed over`);

  // Nothing due, but new words were waiting: a day not studied is missed.
  const more = words(10);
  const log2 = {};
  study(more, log2, D, 2);
  assert.equal(dayCheck(prepare(more, log2), D + 1, 2).kind, "missed");
  // ...unless the goal is 0 new words a day.
  assert.equal(dayCheck(prepare(more, log2), D + 1, 0).kind, "rest");
  // Words saved later than that day weren't waiting then.
  const late = [...words(2), word("late", (D + 3) * 86400 + 43200 + new Date().getTimezoneOffset() * 60)];
  const log3 = {};
  study(late.slice(0, 2), log3, D, 5);
  assert.equal(dayCheck(prepare(late, log3), D + 1, 5).kind, "rest");
});

test("no words or no answers: no streak", () => {
  assert.deepEqual(streak([], {}, { today: D, goal: 5 }).days, 0);
  const s = streak(words(5), {}, { today: D, goal: 5 });
  assert.deepEqual([s.days, s.through, s.today], [0, null, "open"]);
});

test("a day already counted on this device stays counted when the goal is raised", () => {
  const list = words(60);
  const log = {};
  for (let d = D; d < D + 3; d++) study(list, log, d, 5);
  assert.equal(streak(list, log, { today: D + 3, goal: 10 }).days, 0, "worked out again with the bigger goal");
  const kept = new Set([D, D + 1, D + 2]);
  assert.equal(streak(list, log, { today: D + 3, goal: 10, kept }).days, 3);
  // Today is never taken from the note: it is checked against today's goal.
  study(list, log, D + 3, 5);
  const s = streak(list, log, { today: D + 3, goal: 10, kept });
  assert.equal(s.today, "open");
  assert.equal(s.days, 3);
});

test("words deleted since, and answers taken back, don't count", () => {
  const list = words(10);
  const p = plan(list, states({}), D, 3).fresh.map((v) => v.uid);
  const log2 = {};
  study(list, log2, D, 3, { miss: [p[0]] });
  assert.equal(dayCheck(prepare(list, log2), D, 3).kind, "missed");
  const gone = list.map((v) => (v.uid === p[0] ? { ...v, deleted: 1 } : v));
  assert.equal(dayCheck(prepare(gone, log2), D, 3).kind, "met", "the missed word was deleted");
  log2[p[0]].push([clock++, 0, D, 1000]); // a taken-back entry (rating 0) changes nothing
  assert.equal(dayCheck(prepare(gone, log2), D, 3).kind, "met");
});

// ----- midnight and time zones -----

function inZone(tz, fn) {
  const old = process.env.TZ;
  process.env.TZ = tz;
  try { return fn(); } finally { if (old === undefined) delete process.env.TZ; else process.env.TZ = old; }
}

test("an answer belongs to the day written into it: 23:59 is that day, 00:01 the next", () => {
  inZone("Asia/Manila", () => {
    const late = new Date(2026, 9, 14, 23, 59);
    const early = new Date(2026, 9, 15, 0, 1);
    assert.equal(dayNumber(early) - dayNumber(late), 1);
    const list = words(4);
    const log = {};
    // Day 1 at 23:59: all new words done. Day 2 at 00:01: day 2's work done (nothing due, no new words: rest).
    for (const v of list) log[v.uid] = [[late.getTime(), GOOD, dayNumber(late), 3000]];
    const s = streak(list, log, { today: dayNumber(early), goal: 5 });
    assert.equal(s.days, 1);
    assert.equal(s.through, dayNumber(late));
    assert.equal(s.today, "rest");
  });
});

test("flown west after studying: the latest answered day is today", () => {
  const list = words(10);
  const log = {};
  study(list, log, D, 5);
  study(list, log, D + 1, 5);
  // The clock now says D (the day before the last answers' day).
  const s = streak(list, log, { today: D, goal: 5 });
  assert.equal(s.days, 2);
  assert.equal(s.through, D + 1);
});

test("a friend's streak lasts until the end of the day after the last day counted, at their midnight", () => {
  inZone("America/New_York", () => {
    const thu = dayNumber(new Date(2026, 9, 15, 12)); // Thursday 15 October 2026
    const until = streakUntil(thu);
    assert.equal(until, new Date(2026, 9, 17, 0, 0).toISOString(), "midnight starting Saturday in New York");
    assert.equal(until, "2026-10-17T04:00:00.000Z");
  });
  inZone("Asia/Manila", () => {
    const thu = dayNumber(new Date(2026, 9, 15, 12));
    assert.equal(streakUntil(thu), "2026-10-16T16:00:00.000Z", "midnight starting Saturday in Manila");
  });
  // Across a clock change (Europe, 25 October 2026): still midnight.
  inZone("Europe/Madrid", () => {
    const sat = dayNumber(new Date(2026, 9, 24, 12));
    const u = new Date(streakUntil(sat));
    assert.deepEqual([u.getDate(), u.getHours(), u.getMinutes()], [26, 0, 0]);
  });
  assert.equal(streakUntil(null), null);
});

test("what a friend sees: the number while it lasts, wherever the viewer is", () => {
  const p = { streak: 12, streak_until: "2026-10-17T04:00:00.000Z" }; // a New Yorker's, through Thursday
  // Seen from Manila on Saturday morning (Friday evening in New York): still alive.
  assert.equal(streakNow(p, new Date("2026-10-16T23:30:00Z")), 12);
  // Saturday 00:00 in New York: gone.
  assert.equal(streakNow(p, new Date("2026-10-17T04:00:00Z")), 0);
  assert.equal(streakNow({ streak: 3 }, new Date()), 0, "no end time (an older app): nothing shown");
  assert.equal(streakNow({ streak: 0, streak_until: "2099-01-01T00:00:00Z" }), 0);
  assert.equal(streakNow(null), 0);
  assert.equal(streakNow({ streak: 5, streak_until: "nonsense" }), 0);
});
