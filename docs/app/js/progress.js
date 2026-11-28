// Remembers how far you got in each podcast, video and web page on this device, so the Home
// screen can offer "Continue".
//
// The rules for what counts as unfinished:
//   - a podcast or video you've started with MORE than 3 minutes left;
//   - a web page you've opened and scrolled LESS than 70% of the way through.
//
// Kept in this browser, and shared with the user's other devices: what changes here is noted (noteChanged) and sent
// to the app, and what the sync brings from the others is taken in (takeProgress), by listensync.js.

const KEY = "progress";
const MAX_ITEMS = 500; // (the Library's order reads this too, libsort.js; it was 40, for Home's Continue alone)
export const MIN_LEFT_SECONDS = 180;
export const PAGE_DONE_FRACTION = 0.7;

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}
function store(all) {
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* storage unavailable */ }
}

/**
 * Record progress. `entry`: {id, kind: "audio" | "video" | "page", title, sub, image,
 * pos, dur} for audio/video (seconds) or {frac} for pages (0..1, furthest point seen).
 */
export function saveProgress(entry) {
  if (entry == null || entry.id == null) return;
  const all = load();
  const key = String(entry.id);
  const prev = all[key] || {};
  const next = { ...prev, ...entry, id: entry.id, ts: Date.now() };
  // A page's progress is the furthest you've read, even if you scroll back up.
  if (entry.kind === "page") next.frac = Math.max(prev.frac || 0, entry.frac || 0);
  all[key] = next;
  store(trimmed(all));
  noteChanged(key);
}

/** The newest MAX_ITEMS only. */
function trimmed(all) {
  const keys = Object.keys(all);
  if (keys.length > MAX_ITEMS) {
    keys.sort((a, b) => (all[a].ts || 0) - (all[b].ts || 0)).slice(0, keys.length - MAX_ITEMS).forEach((k) => delete all[k]);
  }
  return all;
}

/**
 * Take in what another device last did with these items ({id, kind, title, sub, pos, dur, frac, ts}; listensync.js):
 * each one replaces this device's when it was used later there (a page keeps the furthest point seen either way).
 * Not noted as changed here, so it isn't sent back. Returns how many changed.
 */
export function takeProgress(items) {
  const all = load();
  let n = 0;
  for (const item of items || []) {
    if (!item || item.id == null || !(Number(item.ts) > 0)) continue;
    const key = String(item.id);
    const prev = all[key];
    if (prev && (prev.ts || 0) >= item.ts) continue;
    const next = { ...(prev || {}), id: item.id, kind: item.kind, title: item.title || (prev && prev.title) || "",
      sub: item.sub || (prev && prev.sub) || "", ts: item.ts };
    if (item.kind === "page") next.frac = Math.max((prev && prev.frac) || 0, Number(item.frac) || 0);
    else Object.assign(next, { pos: Number(item.pos) || 0, dur: Number(item.dur) || (prev && prev.dur) || 0 });
    all[key] = next;
    n++;
  }
  if (n) store(trimmed(all));
  return n;
}

// ---------- what changed here and is still to be sent to the app (listensync.js) ----------
const CHANGED = "listenChanged";
const CHANGED_MOST = 5000;

/** Note that item `id` changed here (how far, or finished: watched.js). */
export function noteChanged(id) {
  const key = String(id);
  const list = changedIds();
  if (list[list.length - 1] === key) return;
  try { localStorage.setItem(CHANGED, JSON.stringify([...list.filter((x) => x !== key), key].slice(-CHANGED_MOST))); } catch { /* storage unavailable */ }
}

/** The items changed here since they were last sent. */
export function changedIds() {
  try { const list = JSON.parse(localStorage.getItem(CHANGED) || "[]"); return Array.isArray(list) ? list.map(String) : []; } catch { return []; }
}

/** These were sent. */
export function clearChanged(ids) {
  const sent = new Set((ids || []).map(String));
  try { localStorage.setItem(CHANGED, JSON.stringify(changedIds().filter((x) => !sent.has(x)))); } catch { /* storage unavailable */ }
}

export function forgetProgress(id) {
  const all = load();
  delete all[String(id)];
  store(all);
}

/** True when an item is unfinished by the rules above. */
export function isUnfinished(item) {
  if (!item) return false;
  if (item.kind === "page") return (item.frac || 0) < PAGE_DONE_FRACTION;
  const dur = item.dur || 0;
  const pos = item.pos || 0;
  return dur > 0 && pos > 2 && dur - pos > MIN_LEFT_SECONDS;
}

/** Everything remembered (finished or not), in no particular order. */
export function allProgress() {
  return Object.values(load());
}

/** Unfinished items, most recently used first. */
export function continueItems() {
  return Object.values(load()).filter(isUnfinished).sort((a, b) => b.ts - a.ts);
}

/** Short description of what's left, e.g. "24 min left" or "35% read". */
export function leftLabel(item) {
  if (item.kind === "page") return `${Math.round((item.frac || 0) * 100)}% read`;
  const left = Math.max(0, (item.dur || 0) - (item.pos || 0));
  const min = Math.round(left / 60);
  return min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min left` : `${min} min left`;
}

/** How far through, 0..1, for a progress bar. */
export function fraction(item) {
  if (item.kind === "page") return Math.min(1, item.frac || 0);
  return item.dur ? Math.min(1, (item.pos || 0) / item.dur) : 0;
}
