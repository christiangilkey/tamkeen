// My flashcard streak (the flame next to my name in the friends list), worked out from this
// device's saved words and answer log by review/streak.js. Shared by every version: the desktop
// answers /vocab and /reviews from its Python server, the phones and the web app from their own
// store (mobile/src/js/backend.js), and the log syncs, so a new device finds the same streak.

import { api } from "../app.js";
import { hasStudyLanguage, studyLanguage } from "../languages.js";
import { dayNumber } from "./fsrs.js";
import { keepDays, keptDays, streak, streakUntil } from "./streak.js";

let last = null;

/** Work it out now: {row: {streak, streak_until} (what friends are sent), result (streak.js `streak`)}. */
export async function myStreak() {
  // pages/review.js holds the "new words a day" setting; loaded here, not at the top, as it is the
  // whole reviewer.
  const [words, log, review] = await Promise.all([
    api("/vocab"), api("/reviews").then((r) => (r && r.reviews) || {}), import("../pages/review.js"),
  ]);
  const lang = hasStudyLanguage() ? studyLanguage() : "";
  const today = dayNumber();
  const result = streak(Array.isArray(words) ? words : [], log, { today, goal: review.newPerDay(), kept: keptDays(lang) });
  keepDays(lang, result, today);
  last = { row: { streak: result.days, streak_until: streakUntil(result.through) }, result };
  return last;
}

/** The last one worked out (null before the first), without waiting. */
export const lastStreak = () => last;
