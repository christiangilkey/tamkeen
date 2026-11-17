// Time a DLI student spends listening, watching and reading in their DLI language, for the weekly numbers their
// teachers and Tamkeen's developer see (dliclass.js sends it, supabase/v11-dli-activity.sql adds up each
// device's share). Counted only while sharing is on for this device (dliclass.js SHARE_KEY), and only in
// minutes: never what was played or read.
//
// On this device (localStorage, not synced: each device sends its own time and the database adds them up):
//   tamkeenDliTime    { language: { day number: [listen, watch, read] seconds } }, the last few weeks only
//   tamkeenDliDevice  16 random hex digits naming this device's share of a week (nothing else about it)
//
// Flashcard time is not counted here: it comes from the answers themselves (dliweeks.js weekNumbers).
// Shared by the computer, the phones and the web app; tested in tests/js/dlitime.test.mjs.

import { hasStudyLanguage, studyLanguage } from "./languages.js";
import { dayNumber } from "./review/fsrs.js";

export const TIME_KEY = "tamkeenDliTime";
const DEVICE_KEY = "tamkeenDliDevice";
const SHARE_KEY = "tamkeenDliShare"; // (dliclass.js SHARE_KEY: read here directly, so the game needn't load the DLI code)
export const KINDS = ["listen", "watch", "read"];
const KEEP_DAYS = 21;
const DAY_MOST = 16 * 3600; // (seconds a day, at most, for any one kind: a player left running all night isn't study)

const read = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key, value) => { try { localStorage.setItem(key, value); } catch { /* storage off */ } };

/** The time log as kept, or an empty one. */
export function timeLog() {
  try { const v = JSON.parse(read(TIME_KEY) || "{}"); return v && typeof v === "object" && !Array.isArray(v) ? v : {}; } catch { return {}; }
}

/** `seconds` of `kind` ("listen", "watch" or "read") on day `day` in `language`, added to `log` (changed and returned).
 *  Days older than three weeks before `day` are dropped. Pure: tested. */
export function addTime(log, kind, seconds, language, day) {
  const i = KINDS.indexOf(kind);
  const s = Math.max(0, Math.min(600, Number(seconds) || 0));
  if (i < 0 || !s || !language || !Number.isInteger(day)) return log;
  const days = log[language] && typeof log[language] === "object" ? log[language] : (log[language] = {});
  const row = Array.isArray(days[day]) ? days[day] : (days[day] = [0, 0, 0]);
  row[i] = Math.min(DAY_MOST, (Number(row[i]) || 0) + s);
  for (const lang of Object.keys(log)) {
    for (const d of Object.keys(log[lang] || {})) if (Number(d) < day - KEEP_DAYS) delete log[lang][d];
    if (!Object.keys(log[lang] || {}).length) delete log[lang];
  }
  return log;
}

/** The week starting on day `start` in `language`: { listening, watching, reading } minutes and `days`, the set of
 *  day numbers with any of that time. Pure: tested. */
export function weekTime(log, language, start) {
  const out = { listening: 0, watching: 0, reading: 0, days: new Set() };
  const days = (log && log[language]) || {};
  const secs = [0, 0, 0];
  for (let d = start; d <= start + 6; d++) {
    const row = days[d];
    if (!Array.isArray(row)) continue;
    let any = false;
    row.forEach((v, i) => { const n = Math.max(0, Number(v) || 0); if (i < 3) { secs[i] += n; if (n >= 60) any = true; } });
    if (any) out.days.add(d); // (a day counts as studied with a minute or more of one kind)
  }
  [out.listening, out.watching, out.reading] = secs.map((v) => Math.min(10080, Math.round(v / 60)));
  return out;
}

/** A week's studied days as seven bits, Monday first (bit 0), from day numbers. */
export const dayMask = (days, start) => [...days].reduce((m, d) => (d >= start && d <= start + 6 ? m | (1 << (d - start)) : m), 0);

/** This device's name for its share of a week: made once, random, nothing about the device in it. */
export function deviceId() {
  let id = read(DEVICE_KEY);
  if (!/^[0-9a-f]{16}$/.test(id || "")) {
    const bytes = new Uint8Array(8);
    (globalThis.crypto || {}).getRandomValues ? crypto.getRandomValues(bytes) : bytes.forEach((_, i) => { bytes[i] = Math.floor(Math.random() * 256); });
    id = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
    write(DEVICE_KEY, id);
  }
  return id;
}

/** Study time happened (game.js trackStudy, every 5 seconds of it). Kept only while this device shares as a DLI
 *  student; the language is the one being studied (dliclass.js sends only the DLI language's). */
export function noteStudy(kind, seconds) {
  if (!read(SHARE_KEY) || !hasStudyLanguage()) return;
  write(TIME_KEY, JSON.stringify(addTime(timeLog(), kind, seconds, studyLanguage(), dayNumber())));
}
