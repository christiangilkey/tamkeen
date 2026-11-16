// The long-term goal's maths (the bar on the Vocab page, review/longgoalview.js): how far along a goal
// is, where a steady pace would have it today, and the pace still needed. Pure, shared by every version,
// tested in tests/js/longgoal.test.mjs. The setting itself is review/goalsetting.js.
//
// Built on what is known to help people keep a goal: a goal of 1 to 3 months, a weekly part of it, the
// pace needed rather than a bare total, and a goal that bends instead of breaking. A missed day is never
// a failure: the rest is spread over the days left, so the needed pace simply goes up a little.
//
// Everything is worked out from the answer log (which syncs), taking only the answers to the words of the goal's own
// language (`langLog`): each language has its own goal (review/goalsetting.js).
//   learned  words remembered for the first time (a word's first "Remembered")
//   reviews  flashcard answers given
//   minutes  time spent looking at flashcards (a look counts 60 seconds at most, like the DLI weeks)

import { GOOD, history } from "./fsrs.js";

const LOOK_CAP = 60000;
export const MILESTONES = [25, 50, 75, 100];
/** A first suggestion for each measure, a day, when there is no pace on record yet. */
export const DEFAULT_PER_DAY = { learned: 10, reviews: 80, minutes: 15 };
/** The lengths offered (days); a month first, since that is the length people finish most. */
export const LENGTHS = [14, 30, 60, 90];

/** How much of `measure` each day brought: Map(day -> amount; minutes may be fractions). */
export function dailyAmounts(log, measure) {
  const out = new Map();
  const add = (day, n) => out.set(day, (out.get(day) || 0) + n);
  for (const entries of Object.values(log || {})) {
    let learned = false;
    for (const step of history(entries)) {
      const day = step.after.day;
      if (measure === "reviews") add(day, 1);
      else if (measure === "minutes") add(day, Math.min(Math.max(step.ms, 0), LOOK_CAP) / 60000);
      else if (measure === "learned" && !learned && step.rating === GOOD) { learned = true; add(day, 1); }
    }
  }
  return out;
}

/** The answers to `words` only (the words of the language being learned: a goal counts its own language). */
export function langLog(log, words) {
  const out = {};
  for (const v of words || []) {
    const uid = String(v.uid || v.id);
    if (log && log[uid]) out[uid] = log[uid];
  }
  return out;
}

/** The sum of `amounts` over days from … to (both included). */
export function sumDays(amounts, from, to) {
  let n = 0;
  for (const [day, v] of amounts) if (day >= from && day <= to) n += v;
  return n;
}

/** A number of "about …": exact up to 15, then to the nearest 5, then to the nearest 10. */
export function friendly(n) {
  if (!(n > 0)) return 0;
  if (n < 15) return Math.ceil(n);
  if (n < 100) return Math.round(n / 5) * 5;
  return Math.round(n / 10) * 10;
}

/** A target that reads well: to the nearest 5 under 100, 10 under 1000, else 50. */
export function niceTarget(n) {
  if (!(n > 0)) return 1;
  if (n < 20) return Math.max(1, Math.round(n));
  if (n < 100) return Math.round(n / 5) * 5;
  if (n < 1000) return Math.round(n / 10) * 10;
  return Math.round(n / 50) * 50;
}

/**
 * A target to suggest for `days` days of `measure`: the learner's pace over the last 4 weeks, a little
 * higher (a stretch, not a leap), or a first suggestion when there is no pace yet.
 */
export function suggestTarget(amounts, measure, today, days) {
  const recent = sumDays(amounts, today - 28, today - 1) / 28;
  const perDay = recent > 0 ? recent * 1.15 : DEFAULT_PER_DAY[measure] || 10;
  return niceTarget(perDay * days);
}

/** The Monday of the week day number `day` is in (day 0 was a Thursday). */
export const monday = (day) => day - ((((day + 3) % 7) + 7) % 7);

/**
 * Where a goal stands on day `today`:
 *   status     "upcoming" (not started), "active", "ended" (its last day is over) or "reached"
 *   done       the amount so far (doneToday of it today); left = what is still to do
 *   pct        done / target, 0..1 (never more)
 *   planToday  where a steady pace from the first day would have it by the end of today (the bar's mark)
 *   ahead      done − planToday (more than 0: ahead of the steady pace)
 *   behind     how far it is behind where a steady pace had it at the end of yesterday (0 if not)
 *   daysLeft   days left, today included
 *   pace       the amount a day still needed, worked out from the start of today: what was left this
 *              morning spread over the days left. Steady through the day, so doing today's part doesn't
 *              move it; tomorrow it is worked out again from what is left then.
 *   todayTarget, todayLeft   today's part (pace rounded up) and what is left of it
 *   strain     pace / the goal's own steady pace (2 = twice the pace it started with)
 *   week       {done, target, days, fresh}: this week's part. Weeks are counted from the goal's first day
 *              (days 1–7, 8–14, …; the last may be shorter), so the first week is a whole week whatever day
 *              the goal was set on. Fixed for the week like the pace for the day; fresh = today starts a
 *              week after the first
 *   milestone  the last of 25/50/75/100 % passed (0 for none)
 */
export function progress(goal, amounts, today) {
  const { target: N, start: S, end: E } = goal;
  const total = E - S + 1;
  const last = Math.min(today, E);
  const done = S <= last ? sumDays(amounts, S, last) : 0;
  const doneToday = today >= S && today <= E ? amounts.get(today) || 0 : 0;
  const doneBefore = done - doneToday;
  const elapsed = Math.min(total, Math.max(0, today - S + 1));
  const planToday = (N * elapsed) / total;
  const planYesterday = (N * Math.max(0, elapsed - 1)) / total;
  const left = Math.max(0, N - done);
  const pct = Math.min(1, done / N);
  const status = done >= N ? "reached" : today < S ? "upcoming" : today > E ? "ended" : "active";
  const daysLeft = today < S ? total : Math.max(0, E - today + 1);
  const pace = daysLeft ? Math.max(0, N - doneBefore) / daysLeft : 0;
  const todayTarget = status === "active" ? Math.ceil(pace - 1e-9) : 0;
  const steady = N / total;
  // This week's part: what was left on the week's first morning, spread over the days left then, times
  // this week's days. (Before 2026-11-15 weeks ran Monday to Sunday, so a goal set on a Sunday had a
  // first "week" of one day: "This week 3 of 20".)
  const ws = S + 7 * Math.floor((Math.min(Math.max(today, S), E) - S) / 7);
  const weekDays = Math.min(ws + 6, E) - ws + 1;
  const beforeWeek = ws > S ? sumDays(amounts, S, ws - 1) : 0;
  const weekLeftDays = E - ws + 1;
  const week = {
    done: today >= ws ? sumDays(amounts, ws, Math.min(today, E)) : 0,
    target: weekLeftDays > 0 ? Math.ceil((Math.max(0, N - beforeWeek) * weekDays) / weekLeftDays - 1e-9) : 0,
    days: weekDays,
    fresh: today === ws && ws > S && status === "active",
  };
  return {
    status, done, doneToday, left, pct, planToday,
    ahead: done - planToday,
    behind: Math.max(0, planYesterday - done),
    daysLeft, pace, todayTarget, todayLeft: Math.max(0, todayTarget - doneToday),
    strain: steady ? pace / steady : 0,
    week,
    milestone: MILESTONES.filter((m) => pct * 100 >= m - 1e-9).pop() || 0,
  };
}

/**
 * What the check-in line says, as a kind (review/longgoalview.js words it). In order: reached; ended;
 * not started; today's part done; a fresh week after falling behind; ahead; on track (at or past the bar's
 * gold mark, never before: "on track" with today's part still to do read as untrue); today's part still to
 * do but not behind ("17 to go today"); a little behind (the pace bent); behind enough that the goal may be
 * worth changing (never a reproach: a goal you finish beats a bigger one you drop).
 */
export function checkIn(p) {
  if (p.status === "reached") return "reached";
  if (p.status === "ended") return "ended";
  if (p.status === "upcoming") return "upcoming";
  if (p.todayTarget > 0 && p.todayLeft === 0) return "today-done";
  if (p.week.fresh && p.behind > 0) return "fresh-week";
  if (p.ahead >= Math.max(1, p.pace)) return "ahead";
  if (p.ahead >= -1e-9) return "on-track";
  if (p.behind <= 0) return "today-left";
  return p.strain > 2 ? "rethink" : "bent";
}

/**
 * A "new words" goal and the reviewer's day: how many new words the goal wants offered today beyond what the
 * day's own allowance (Settings: new words a day) already lets in. Never changes that setting: the extra is
 * asked for one session at a time (pages/review.js `bonus`, as "Learn 10 more new words" does).
 *   p           progress() of the goal today
 *   waiting     words never answered yet that can be asked (deck.js plan().waiting)
 *   started     words first answered today (plan().startedToday)
 *   perDay      the new-words-a-day setting
 * Returns {need, waiting, extra, bonus}: need = what is left of today's part; extra = how many more new words
 * than today's plan would bring (enough for today's part, as far as there are words waiting); bonus = what to
 * add to the allowance so the plan brings them; none = today's part wants words and none are waiting (time to
 * add some). Null for other measures, or a goal not running today.
 */
export function goalNewWords(goal, p, waiting, started, perDay) {
  if (!goal || goal.measure !== "learned" || p.status !== "active") return null;
  const need = p.todayLeft;
  const planned = Math.min(waiting, Math.max(0, perDay - started));
  const want = Math.min(waiting, Math.max(planned, need));
  const extra = want - planned;
  return { need, waiting, extra, bonus: extra > 0 ? started + want - perDay : 0, none: need > 0 && waiting === 0 };
}

/** A milestone passed since `seen` (the last one celebrated), or 0. */
export const newMilestone = (p, seen) => (p.milestone > (seen || 0) ? p.milestone : 0);
