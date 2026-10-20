// The languages being learned: the ticked tiles in Settings → Languages and the top bar's switch
// (components/langswitch.js). Plain functions, no page code, so the phone's sync and the tests can
// use them; app/learning.py is the computer's copy (tests/learning_cases.json keeps them the same).
//
// Settings:  learning_languages  the list, in the order it was built (study_language is always on it)
//            learning_times      {code: ms}: when each language was last ticked or unticked, on any
//                                device. Two devices' lists merge language by language: the newer
//                                change wins, so ticking French on the phone and unticking Arabic on
//                                the computer both survive. Unticking never deletes anything: a
//                                language's podcasts, words and reviews stay and come back when re-ticked.

import { isLanguage } from "./languages.js";

const whole = (x) => Math.max(0, Math.floor(Number(x) || 0));

/** A list of language codes: known ones only, each once, order kept. */
export function cleanList(raw) {
  return [...new Set((Array.isArray(raw) ? raw : []).filter(isLanguage))];
}

/** {code: ms} with only known codes and whole, positive times. */
export function cleanTimes(raw) {
  const out = {};
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [code, t] of Object.entries(raw)) if (isLanguage(code) && whole(t) > 0) out[code] = whole(t);
  }
  return out;
}

/** The languages being learned, with the one studied now on it (first, if it wasn't there yet). */
export function effectiveList(s = {}) {
  const list = cleanList(s.learning_languages);
  if (isLanguage(s.study_language) && !list.includes(s.study_language)) list.unshift(s.study_language);
  return list;
}

/** `times` with every language that went on or off between `before` and `after` stamped `now`. */
export function stampTimes(before, after, times, now) {
  const out = cleanTimes(times);
  const was = new Set(before), is = new Set(after);
  for (const code of new Set([...before, ...after])) if (was.has(code) !== is.has(code)) out[code] = whole(now);
  return out;
}

/** `values` about to be saved, with the list (and when each language changed) filled in.
 *  - `learning_languages` given: that is the new list; the language studied now is added if missing.
 *  - only `study_language` given: switching to a language puts it on the list.
 *  Anything else is returned as it is. */
export function withLearning(values, s = {}, now = Date.now()) {
  const hasList = "learning_languages" in values;
  const study = isLanguage(values.study_language) ? values.study_language : "";
  if (!hasList && !study) return values;
  const before = effectiveList(s);
  const list = hasList ? cleanList(values.learning_languages) : [...before];
  const current = study || s.study_language;
  if (isLanguage(current) && !list.includes(current)) list.push(current);
  if (!list.length) return values; // never an empty list
  return { ...values, learning_languages: list, learning_times: stampTimes(before, list, s.learning_times, now) };
}

/** What goes into the synced library file: the list (sorted, so two devices with the same languages
 *  in a different order don't keep re-uploading) and the times. */
export function learningPayload(s = {}) {
  return { list: [...effectiveList(s)].sort(), times: cleanTimes(s.learning_times) };
}

/** A library file's {list, times}, as compared to decide whether to upload (none = empty). */
export function cleanPayload(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  return { list: cleanList(r.list).sort(), times: cleanTimes(r.times) };
}

/** Two devices' {list, times} as one. For each language the side that changed it last decides
 *  whether it's on; with no newer change on either side, on wins. Order: mine first, then new ones. */
export function mergeLearning(mine, theirs) {
  const a = { list: cleanList(mine && mine.list), times: cleanTimes(mine && mine.times) };
  const b = { list: cleanList(theirs && theirs.list), times: cleanTimes(theirs && theirs.times) };
  const times = { ...a.times };
  const on = new Set();
  const all = [...new Set([...a.list, ...b.list, ...Object.keys(a.times), ...Object.keys(b.times)])];
  for (const code of all) {
    const ta = a.times[code] || 0, tb = b.times[code] || 0;
    const inA = a.list.includes(code), inB = b.list.includes(code);
    if (tb > ta) { times[code] = tb; if (inB) on.add(code); }
    else if (ta > tb) { if (inA) on.add(code); }
    else if (inA || inB) on.add(code);
  }
  let list = [...a.list, ...b.list].filter((c, i, l) => on.has(c) && l.indexOf(c) === i);
  if (!list.length) {
    // Both devices unticked the other's last language at once: keep the one changed last (the same
    // answer on both devices, so they agree), or failing that the first in alphabetical order.
    const pool = [...new Set([...a.list, ...b.list])].sort();
    const best = pool.reduce((x, c) => ((times[c] || 0) > (times[x] || 0) ? c : x), pool[0]);
    list = best ? [best] : [];
  }
  return { list, times };
}

/** Another device's {list, times} taken into these settings: the settings that change (nothing if
 *  the list is the same). If the language studied here was unticked there, the first one left
 *  becomes the one studied now. */
export function takeLearning(s, remote) {
  if (!remote || typeof remote !== "object" || !Array.isArray(remote.list)) return {};
  const before = effectiveList(s);
  if (!before.length) return {}; // this device hasn't chosen a language yet: the first-run screen does
  const merged = mergeLearning({ list: before, times: s.learning_times }, remote);
  if (!merged.list.length) return {};
  const out = {};
  if (JSON.stringify(merged.list) !== JSON.stringify(cleanList(s.learning_languages))) out.learning_languages = merged.list;
  if (JSON.stringify(merged.times) !== JSON.stringify(cleanTimes(s.learning_times))) out.learning_times = merged.times;
  if (isLanguage(s.study_language) && !merged.list.includes(s.study_language)) out.study_language = merged.list[0];
  return out;
}

/** The list after ticking (`on`) or unticking `code`, and the language to study now. Unticking the
 *  last language does nothing (`kept: true`); unticking the one studied now moves to the first one left. */
export function toggleLearning(s, code, on) {
  const list = effectiveList(s);
  const now = s.study_language;
  if (!isLanguage(code)) return { list, now, kept: false };
  if (on) return { list: list.includes(code) ? list : [...list, code], now, kept: false };
  if (!list.includes(code)) return { list, now, kept: false };
  if (list.length === 1) return { list, now, kept: true };
  const left = list.filter((c) => c !== code);
  return { list: left, now: code === now ? left[0] : now, kept: false };
}
