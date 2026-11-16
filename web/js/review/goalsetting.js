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

// ----- one goal per language (2026-11-15, the owner: "a user can have Spanish goals as well as an Arabic goal") -----
// The setting "study_goals" (library.json key "goals"):
//   { goals: { <language code>: { at, goal } }, legacy: <ms> }
// Each language's entry is the single-goal setting above, so a goal removed is { at, goal: null } (kept, so the
// removal wins over an older copy on another device). Two devices' maps merge language by language, the entry
// changed last winning. `legacy` notes the one goal from before (the setting "study_goal", which older versions
// still read and write, and which is left as it is) once it has been given to a language, so it moves only once.

/** A language code a goal may be kept under (2 or 3 small letters: any code a newer version knows is kept too). */
export const isLang = (code) => typeof code === "string" && /^[a-z]{2,3}$/.test(code);

/** The per-language setting as it may be kept. */
export function cleanGoals(raw) {
  const r = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const goals = {};
  const given = r.goals && typeof r.goals === "object" && !Array.isArray(r.goals) ? r.goals : {};
  for (const code of Object.keys(given).sort()) if (isLang(code)) goals[code] = cleanSetting(given[code]);
  const legacy = whole(r.legacy);
  return { goals, legacy: legacy > 0 ? legacy : 0 };
}

/** Two devices' maps as one: for each language the entry changed last (on a tie, `mine`); the later `legacy`. */
export function mergeGoals(mine, theirs) {
  const a = cleanGoals(mine), b = cleanGoals(theirs);
  const goals = { ...a.goals };
  for (const [code, entry] of Object.entries(b.goals)) if (!goals[code] || entry.at > goals[code].at) goals[code] = entry;
  return cleanGoals({ goals, legacy: Math.max(a.legacy, b.legacy) });
}

/** The goal of language `lang`, or null. */
export const goalOf = (all, lang) => (cleanGoals(all).goals[lang] || { goal: null }).goal;

/** The map with language `lang`'s goal set to `goal` (null removes it) at time `at`. */
export function withGoal(all, lang, goal, at) {
  const c = cleanGoals(all);
  if (!isLang(lang)) return c;
  return cleanGoals({ ...c, goals: { ...c.goals, [lang]: { at, goal } } });
}

/**
 * The goal from before goals had a language (`legacySetting`, the setting "study_goal") given to `lang`, the
 * language being learned, the first time a version with goals per language shows it: the new map, or null when
 * there is nothing to do. If `lang` already has an entry of its own, the old goal is only marked as dealt with.
 * Done once: `legacy` then holds the old goal's `made` (or `at`), and a later old goal (set again on an older
 * version) moves the same way.
 */
export function migrateGoal(all, legacySetting, lang) {
  const c = cleanGoals(all), old = cleanSetting(legacySetting);
  if (!old.goal || !isLang(lang)) return null;
  const mark = old.goal.made || old.at;
  if (!(mark > c.legacy)) return null;
  if (c.goals[lang]) return cleanGoals({ ...c, legacy: mark });
  return cleanGoals({ goals: { ...c.goals, [lang]: { at: old.at, goal: old.goal } }, legacy: mark });
}
