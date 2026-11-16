// The long-term goal (web/js/review/longgoal.js) and its setting (web/js/review/goalsetting.js), and the review
// calendar's numbers (web/js/review/heatmap.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AGAIN, GOOD } from "../../web/js/review/fsrs.js";
import { cleanGoals, cleanSetting, goalOf, mergeGoals, migrateGoal, settingWins, withGoal } from "../../web/js/review/goalsetting.js";
import { checkIn, dailyAmounts, friendly, goalNewWords, langLog, monday, newMilestone, niceTarget, progress, suggestTarget, sumDays } from "../../web/js/review/longgoal.js";
import { dailyCounts, stepper, streaks, weekday, yearEnd, yearOf, yearStart, yearStats, yearWeeks, years } from "../../web/js/review/heatmap.js";

const CASES = JSON.parse(readFileSync(new URL("../fixtures/studygoal_cases.json", import.meta.url), "utf8"));
const D = 20400; // a Saturday

test("the setting is cleaned the same as on the computer", () => {
  for (const c of CASES.clean) assert.deepEqual(cleanSetting(c.in), c.out, JSON.stringify(c.in));
  for (const c of CASES.wins) assert.equal(settingWins(c.theirs, c.mine), c.out, JSON.stringify(c));
});

// ----- the calendar -----

test("answers are counted by the day written in them, and Undo's take-backs don't count", () => {
  const log = {
    a: [[1, AGAIN, D, 5000], [2, GOOD, D, 4000], [3, GOOD, D + 2, 3000]],
    b: [[4, GOOD, D, 1000], [5, 0, D, 2000]],
  };
  assert.deepEqual([...dailyCounts(log)].sort(), [[D, 3], [D + 2, 1]]);
});

test("the streak counts days in a row, and today doesn't break it before it is over", () => {
  const counts = new Map([[D - 5, 1], [D - 4, 2], [D - 3, 1], [D - 1, 4], [D - 2, 0]]);
  assert.deepEqual(streaks(counts, D), { current: 1, longest: 3 });  // nothing yet today: yesterday's run of 1
  counts.set(D, 2);
  assert.deepEqual(streaks(counts, D), { current: 2, longest: 3 });
  counts.set(D - 2, 1);
  assert.deepEqual(streaks(counts, D), { current: 6, longest: 6 });
  assert.deepEqual(streaks(new Map(), D), { current: 0, longest: 0 });
  assert.equal(streaks(new Map([[D - 2, 1]]), D).current, 0);  // a day missed: it starts again
});

test("a year's squares run Monday to Sunday, with the days outside the year empty", () => {
  assert.equal(weekday(0), 3);  // 1 January 1970 was a Thursday
  assert.equal(yearOf(yearStart(2026)), 2026);
  assert.equal(yearEnd(2026) - yearStart(2026), 364);
  const weeks = yearWeeks(2026);  // 1 January 2026 was a Thursday
  assert.deepEqual(weeks[0].slice(0, 4), [null, null, null, yearStart(2026)]);
  assert.equal(weeks.flat().filter((d) => d !== null).length, 365);
  assert.ok(weeks.every((w) => w.length === 7));
  assert.equal(weekday(weeks[1][0]), 0);
});

test("the year's numbers count from the first answer to today, days off included", () => {
  const first = yearStart(2026) + 9;  // 10 January
  const counts = new Map([[first, 10], [first + 1, 20], [first + 5, 30], [yearStart(2025) + 3, 99]]);
  const today = first + 9;  // ten days from the first answer in 2026 (but 2025 had answers: from 1 January)
  const s = yearStats(counts, 2026, today);
  assert.equal(s.total, 60);
  assert.equal(s.studied, 3);
  assert.equal(s.days, today - yearStart(2026) + 1);
  assert.ok(Math.abs(s.average - 60 / s.days) < 1e-9);
  const alone = yearStats(new Map([[first, 10], [first + 1, 20]]), 2026, first + 9);
  assert.equal(alone.days, 10);
  assert.equal(alone.share, 0.2);
  assert.deepEqual(yearStats(new Map(), 2026, today), { total: 0, studied: 0, days: 0, share: 0, average: 0 });
  assert.deepEqual(years(counts, today), { first: 2025, last: 2026 });
});

test("the colour steps follow the learner's own busy days", () => {
  const counts = new Map(Array.from({ length: 20 }, (_, i) => [D + i, (i + 1) * 10]));  // 10 … 200
  const step = stepper(counts);
  assert.equal(step(0), 0);
  assert.equal(step(1), 1);
  assert.equal(step(200), 4);
  assert.ok(step(100) >= 2 && step(100) <= 3);
  assert.equal(stepper(new Map([[D, 1]]))(1), 1);  // one quiet day is not the darkest square
});

// ----- the goal -----

const goal = (o) => ({ measure: "learned", target: 300, start: D, end: D + 29, made: 1, ...o });
const amounts = (pairs) => new Map(pairs);

test("words learned count a word once, on the day it was first remembered", () => {
  const log = {
    a: [[1, AGAIN, D, 1000], [2, GOOD, D + 1, 90000], [3, GOOD, D + 5, 1000]],
    b: [[4, GOOD, D, 30000]],
    c: [[5, AGAIN, D, 1000]],
  };
  assert.deepEqual([...dailyAmounts(log, "learned")].sort(), [[D, 1], [D + 1, 1]]);
  assert.deepEqual([...dailyAmounts(log, "reviews")].sort(), [[D, 3], [D + 1, 1], [D + 5, 1]]);
  const minutes = dailyAmounts(log, "minutes");
  assert.ok(Math.abs(minutes.get(D) - 32000 / 60000) < 1e-9);
  assert.equal(minutes.get(D + 1), 1);  // a look counts a minute at most
});

test("on a steady pace the goal is on track, and the pace is the goal's own", () => {
  const a = amounts(Array.from({ length: 10 }, (_, i) => [D + i, 10]));
  const p = progress(goal(), a, D + 9);
  assert.equal(p.status, "active");
  assert.equal(p.done, 100);
  assert.equal(p.doneToday, 10);
  assert.equal(p.daysLeft, 21);
  assert.equal(p.pace, 10);
  assert.equal(p.todayTarget, 10);
  assert.equal(p.todayLeft, 0);
  assert.ok(Math.abs(p.planToday - 100) < 1e-9);
  assert.equal(p.behind, 0);
  assert.equal(checkIn(p), "today-done");
  assert.equal(p.milestone, 25);
});

test("missed days bend the goal: the rest is spread over the days left, it never breaks", () => {
  const a = amounts([[D, 10], [D + 1, 10]]);  // then five days off
  const p = progress(goal(), a, D + 7);
  assert.equal(p.done, 20);
  assert.equal(p.daysLeft, 23);
  assert.ok(Math.abs(p.pace - 280 / 23) < 1e-9);  // about 12 a day instead of 10
  assert.equal(p.todayTarget, 13);
  assert.ok(Math.abs(p.behind - (300 * 7) / 30 + 20) < 1e-9);
  assert.equal(p.week.fresh, true);  // day 8 starts the goal's second week: a fresh start after falling behind
  assert.equal(checkIn(p), "fresh-week");
  assert.equal(checkIn(progress(goal(), a, D + 8)), "bent");
  // The pace is worked out from the start of the day: doing today's part doesn't move it.
  a.set(D + 7, 13);
  const q = progress(goal(), a, D + 7);
  assert.equal(q.pace, p.pace);
  assert.equal(q.todayLeft, 0);
  // Far behind: more than twice the goal's own pace. Honest, never a reproach.
  const far = progress(goal(), amounts([[D, 5]]), D + 20);
  assert.ok(far.strain > 2);
  assert.equal(checkIn(far), "rethink");
});

test("a fresh week, ahead of plan, reached, ended and not started", () => {
  const mon = monday(D + 10);
  assert.equal(weekday(mon), 0);
  const behind = progress(goal({ start: mon - 7, end: mon + 22 }), amounts([[mon - 7, 10]]), mon);
  assert.equal(behind.week.fresh, true);
  assert.equal(checkIn(behind), "fresh-week");
  // This week's part: what was left on Monday morning over the days left then, times this week's days.
  assert.equal(behind.week.target, Math.ceil((290 * 7) / 23));
  const ahead = progress(goal(), amounts([[D, 60]]), D + 1);
  assert.equal(checkIn(ahead), "ahead");
  assert.equal(checkIn(progress(goal(), amounts([[D, 300]]), D + 3)), "reached");
  const ended = progress(goal(), amounts([[D, 150]]), D + 30);
  assert.equal(ended.status, "ended");
  assert.equal(ended.pct, 0.5);
  assert.equal(checkIn(ended), "ended");
  const later = progress(goal({ start: D + 5, end: D + 34 }), amounts([[D, 50]]), D);
  assert.equal(later.status, "upcoming");
  assert.equal(later.done, 0);
  assert.equal(checkIn(later), "upcoming");
});

test("milestones are each passed once, in order", () => {
  const p = progress(goal(), amounts([[D, 160]]), D + 1);
  assert.equal(p.milestone, 50);
  assert.equal(newMilestone(p, 0), 50);
  assert.equal(newMilestone(p, 25), 50);
  assert.equal(newMilestone(p, 50), 0);
});

test("numbers read as 'about …', and a target is suggested from the learner's own pace", () => {
  assert.deepEqual([0, 0.2, 12.1, 14.9, 16, 47, 101, 134].map(friendly), [0, 1, 13, 15, 15, 45, 100, 130]);
  assert.deepEqual([3.4, 47, 333, 4321].map(niceTarget), [3, 45, 330, 4300]);
  assert.equal(suggestTarget(new Map(), "learned", D, 30), 300);  // no pace yet: 10 a day
  const recent = amounts(Array.from({ length: 28 }, (_, i) => [D - 1 - i, 20]));
  assert.equal(sumDays(recent, D - 28, D - 1), 560);
  assert.equal(suggestTarget(recent, "reviews", D, 30), 690);  // 20 a day, a little higher: 23 a day
});

// ----- 2026-11-15, the owner on v0.56.0: "1200 new words by Jan 13", set today, 3 learned, 1 new word a day in
// the reviewer's own setting: "Today 3 of 20", "This week 3 of 20", "Right on track", and nothing to learn -----

test("a goal's weeks are counted from its first day, so the first week is a whole week", () => {
  const big = goal({ target: 1200, end: D + 59 });  // D was a Saturday: a Monday-to-Sunday week would be 2 days
  const p = progress(big, amounts([[D, 3]]), D);
  assert.equal(p.todayTarget, 20);
  assert.deepEqual([p.week.done, p.week.target, p.week.days], [3, 140, 7]);
  const later = progress(big, amounts([[D, 3]]), D + 9);  // week 2: days 8 to 14
  assert.equal(later.week.days, 7);
  assert.equal(later.week.target, Math.ceil((1197 * 7) / 53));
  const last = progress(goal({ target: 100, end: D + 9 }), amounts([]), D + 8);  // a 10-day goal: its second week is 3 days
  assert.equal(last.week.days, 3);
});

test("'on track' only at or past the gold mark; before it, what is left of today", () => {
  const big = goal({ target: 1200, end: D + 59 });
  const p = progress(big, amounts([[D, 3]]), D);
  assert.ok(p.ahead < 0 && p.behind === 0);
  assert.equal(checkIn(p), "today-left");
  assert.equal(p.todayLeft, 17);
  assert.equal(checkIn(progress(big, amounts([[D, 20]]), D)), "today-done");
  // At the mark exactly (yesterday's and today's parts done, nothing more) is on track.
  const steady = progress(goal({ target: 30, end: D + 29 }), amounts([[D, 1], [D + 1, 1]]), D + 1);
  assert.equal(steady.ahead, 0);
  assert.equal(checkIn({ ...steady, todayTarget: 0 }), "on-track");
});

test("a new-words goal asks the reviewer for the new words today's part needs, never more than are waiting", () => {
  const big = goal({ target: 1200, end: D + 59 });
  const p = progress(big, amounts([[D, 3]]), D);  // 17 to go today
  // The setting lets in 1 a day and 1 was started: the goal asks for 17 more; the allowance is raised to 17 for the session.
  assert.deepEqual(goalNewWords(big, p, 50, 1, 1), { need: 17, waiting: 50, extra: 17, bonus: 17, none: false });
  // New words a day 0: the same 17, the bonus covering the word already started.
  assert.deepEqual(goalNewWords(big, p, 50, 1, 0), { need: 17, waiting: 50, extra: 17, bonus: 18, none: false });
  // Only 5 waiting: those 5.
  assert.equal(goalNewWords(big, p, 5, 1, 1).extra, 5);
  // The day's own allowance already brings enough: nothing extra.
  assert.equal(goalNewWords(big, p, 50, 0, 20).extra, 0);
  // Nothing waiting: say so (and offer Add words).
  assert.deepEqual(goalNewWords(big, p, 0, 1, 1), { need: 17, waiting: 0, extra: 0, bonus: 0, none: true });
  // Today's part done, another measure, or a goal not running today: nothing to ask.
  assert.equal(goalNewWords(big, progress(big, amounts([[D, 20]]), D), 50, 1, 1).extra, 0);
  assert.equal(goalNewWords(goal({ measure: "reviews" }), p, 50, 1, 1), null);
  assert.equal(goalNewWords(big, progress(big, amounts([]), D + 60), 50, 1, 1), null);
});

// ----- one goal per language (the owner: "a user can have Spanish goals as well as an Arabic goal") -----

test("goals per language are cleaned and merged the same as on the computer", () => {
  for (const c of CASES.clean_all) assert.deepEqual(cleanGoals(c.in), c.out, JSON.stringify(c.in));
  for (const c of CASES.merge_all) assert.deepEqual(mergeGoals(c.mine, c.theirs), c.out, JSON.stringify(c));
});

test("an Arabic goal and a Spanish goal side by side, each counting only its own language's answers", () => {
  const ar = goal({ target: 300 }), es = goal({ measure: "reviews", target: 500, made: 2 });
  let all = withGoal({}, "ar", ar, 10);
  all = withGoal(all, "es", es, 11);
  assert.deepEqual(goalOf(all, "ar"), ar);
  assert.deepEqual(goalOf(all, "es"), es);
  assert.equal(goalOf(all, "fr"), null);
  // Removing the Spanish goal leaves the Arabic one, and the removal is kept (it wins over an older copy).
  const removed = withGoal(all, "es", null, 12);
  assert.equal(goalOf(removed, "es"), null);
  assert.deepEqual(goalOf(removed, "ar"), ar);
  assert.equal(goalOf(mergeGoals(removed, all), "es"), null);
  // The log holds both languages' answers; each goal counts its own words only.
  const log = {
    a1: [[1, GOOD, D, 1000]], a2: [[2, GOOD, D, 1000]],                // Arabic: 2 learned, 2 reviews
    e1: [[3, GOOD, D, 1000], [4, GOOD, D + 1, 1000]], e2: [[5, AGAIN, D, 1000]],  // Spanish: 3 reviews
  };
  const arWords = [{ uid: "a1" }, { uid: "a2" }], esWords = [{ uid: "e1" }, { id: "e2" }];
  assert.deepEqual(Object.keys(langLog(log, arWords)), ["a1", "a2"]);
  assert.equal(progress(ar, dailyAmounts(langLog(log, arWords), "learned"), D + 1).done, 2);
  assert.equal(progress(es, dailyAmounts(langLog(log, esWords), "reviews"), D + 1).done, 3);
  assert.equal(progress(ar, dailyAmounts(log, "learned"), D + 1).done, 3);  // (what counting every language would say)
});

test("the goal from before goals had a language becomes the language being learned's, once", () => {
  const old = { at: 50, goal: goal({ made: 40 }) };
  const moved = migrateGoal({}, old, "ar");
  assert.deepEqual(goalOf(moved, "ar"), old.goal);
  assert.equal(moved.legacy, 40);
  assert.equal(moved.goals.ar.at, 50);
  // Done once: switching to Spanish later doesn't move it again, nor does another device that synced the map.
  assert.equal(migrateGoal(moved, old, "es"), null);
  // Nothing from before, or a removed one: nothing to do.
  assert.equal(migrateGoal({}, { at: 9, goal: null }, "ar"), null);
  assert.equal(migrateGoal({}, {}, "ar"), null);
  // The language already has a goal of its own (set on this version): the old one is only marked as dealt with.
  const own = withGoal({}, "ar", goal({ target: 77, made: 60 }), 70);
  const marked = migrateGoal(own, old, "ar");
  assert.equal(goalOf(marked, "ar").target, 77);
  assert.equal(marked.legacy, 40);
  // A goal set again later on an older version (newer "made") moves to the language being learned then.
  const again = migrateGoal(moved, { at: 90, goal: goal({ target: 600, made: 80 }) }, "es");
  assert.equal(goalOf(again, "es").target, 600);
  assert.equal(goalOf(again, "ar").target, 300);
});
