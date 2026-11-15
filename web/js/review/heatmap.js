// The review calendar on the Vocab page: one square per day, coloured by how many flashcard answers
// were given that day, with the streaks and averages under it. Written for Tamkeen from scratch (the idea
// is the well-known "review heatmap"; no code or art of any add-on is used). Pure functions, shared by
// every version and tested in tests/js/heatmap.test.mjs; the drawing is heatmapview.js.
//
// Everything comes from the answer log ({ uid: [[t, rating, day, ms], …] }, which syncs), so the calendar
// is the same on every device and survives a reinstall. Every answer counts, in every language, also for
// words deleted since: it is a record of the studying that happened. Answers taken back with Undo don't.
//
// Days are fsrs.js day numbers (local calendar days, day 0 = 1 January 1970, a Thursday).

import { history } from "./fsrs.js";

/** How many answers were given on each day: Map(day -> count). */
export function dailyCounts(log) {
  const out = new Map();
  for (const entries of Object.values(log || {})) {
    for (const step of history(entries)) {
      const day = step.after.day;
      out.set(day, (out.get(day) || 0) + 1);
    }
  }
  return out;
}

/**
 * The streaks, in days with at least one answer: {current, longest}. Today doesn't break the current
 * streak while it lasts: with nothing answered yet today, the streak is the one that ended yesterday.
 */
export function streaks(counts, today) {
  const days = [...counts.keys()].filter((d) => counts.get(d) > 0 && d <= today).sort((a, b) => a - b);
  let longest = 0, run = 0, prev = null;
  for (const d of days) {
    run = prev !== null && d === prev + 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = d;
  }
  let current = 0;
  for (let d = counts.get(today) > 0 ? today : today - 1; counts.get(d) > 0; d--) current++;
  return { current, longest };
}

/** The day number of 1 January of `year`, and of 31 December. */
export const yearStart = (year) => Math.round(Date.UTC(year, 0, 1) / 86400000);
export const yearEnd = (year) => Math.round(Date.UTC(year, 11, 31) / 86400000);
/** The year a day number is in. */
export const yearOf = (day) => new Date(day * 86400000).getUTCFullYear();
/** 0 = Monday … 6 = Sunday (weeks start on Monday, as the DLI weeks do). */
export const weekday = (day) => (((day + 3) % 7) + 7) % 7;

/**
 * The numbers under the calendar for `year`: {total, studied, days, share, average}.
 * `days` = the days of that year that count: from the first answer ever (or 1 January) to today (or
 * 31 December); `studied` = those with an answer; `share` = studied / days (0..1); `average` = answers a
 * day over those days (the days off included, so it is an honest pace). All 0 before the first answer.
 */
export function yearStats(counts, year, today) {
  const answered = [...counts.keys()].filter((d) => counts.get(d) > 0);
  const first = answered.length ? Math.min(...answered) : null;
  const from = Math.max(yearStart(year), first ?? Infinity);
  const to = Math.min(yearEnd(year), today);
  let total = 0, studied = 0;
  for (const d of answered) if (d >= yearStart(year) && d <= to) { total += counts.get(d); studied++; }
  const days = first === null || to < from ? 0 : to - from + 1;
  return { total, studied, days, share: days ? studied / days : 0, average: days ? total / days : 0 };
}

/**
 * The colour step (0 = nothing, 1..4) of each count, measured against the learner's own busy days: the
 * busiest tenth of the days studied (or 4 answers, whichever is more) fills the darkest step. So a
 * learner doing 20 a day and one doing 200 both see the full range. Returns a function count -> step.
 */
export function stepper(counts) {
  const values = [...counts.values()].filter((n) => n > 0).sort((a, b) => a - b);
  const top = Math.max(4, values.length ? values[Math.floor(values.length * 0.9)] || values[values.length - 1] : 4);
  return (n) => (n > 0 ? Math.min(4, Math.max(1, Math.ceil((n / top) * 4))) : 0);
}

/**
 * The squares of a year, week by week (columns), Monday to Sunday (rows): [[day | null ×7], …].
 * null = a place before 1 January or after 31 December, left empty.
 */
export function yearWeeks(year) {
  const first = yearStart(year), last = yearEnd(year);
  const out = [];
  for (let monday = first - weekday(first); monday <= last; monday += 7) {
    out.push(Array.from({ length: 7 }, (_, i) => (monday + i >= first && monday + i <= last ? monday + i : null)));
  }
  return out;
}

/** The years that can be shown: from the first answer's year (or this year) to this year. */
export function years(counts, today) {
  const answered = [...counts.keys()].filter((d) => counts.get(d) > 0);
  const now = yearOf(today);
  const first = answered.length ? Math.min(yearOf(Math.min(...answered)), now) : now;
  return { first, last: now };
}
