// The long-term goal as it is stored and synced: the setting "study_goal" (review/longgoal.js has the
// maths, review/longgoalview.js the screen). It travels with the library between devices, where the one
// changed last wins (mobile/src/js/sync.js; app/studygoal.py is the computer's twin, and
// tests/fixtures/studygoal_cases.json is run against both).
//
//   { at: <ms, when it was last changed>, goal: null | {
//       measure: "learned" | "reviews" | "minutes",   what counts
//       target:  whole number, 1 … 1 000 000           how many by the end
//       start:   day number (review/fsrs.js dayNumber)  the first day that counts
//       end:     day number, start … start + 366       the last day that counts
//       made:    <ms>                                   when it was set (tells one goal from the next)
//   } }
//
// No imports: the phone's sync reads it too.

export const MEASURES = ["learned", "reviews", "minutes"];
export const MAX_TARGET = 1000000;
export const MAX_DAYS = 366;

const whole = (x) => (typeof x === "number" && Number.isFinite(x) ? Math.floor(x) : NaN);

/** A goal as it may be kept, or null. */
export function cleanGoal(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const measure = MEASURES.includes(raw.measure) ? raw.measure : null;
  const target = whole(raw.target), start = whole(raw.start), end = whole(raw.end);
  const made = whole(raw.made);
  if (!measure || !(target >= 1 && target <= MAX_TARGET)) return null;
  if (!(start > 0) || !(end >= start) || end - start > MAX_DAYS) return null;
  return { measure, target, start, end, made: made > 0 ? made : 0 };
}

/** The setting as stored and synced. */
export function cleanSetting(raw) {
  const at = raw && typeof raw === "object" ? whole(raw.at) : NaN;
  return { at: at > 0 ? at : 0, goal: raw && typeof raw === "object" ? cleanGoal(raw.goal) : null };
}

/** Does another device's goal replace this one's? The one changed last wins. */
export const settingWins = (theirs, mine) => cleanSetting(theirs).at > cleanSetting(mine).at;
