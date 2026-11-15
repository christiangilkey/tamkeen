// The long-term goal (web/js/review/longgoal.js) and its setting (web/js/review/goalsetting.js), and the review
// calendar's numbers (web/js/review/heatmap.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AGAIN, GOOD } from "../../web/js/review/fsrs.js";
import { cleanSetting, settingWins } from "../../web/js/review/goalsetting.js";
import { checkIn, dailyAmounts, friendly, monday, newMilestone, niceTarget, progress, suggestTarget, sumDays } from "../../web/js/review/longgoal.js";
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
  assert.equal(checkIn(p), "bent");
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
