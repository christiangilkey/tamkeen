// Which videos have been watched to the end on this device (YouTube videos and Instagram reels), for the
// "Watched" label in the brand's purple at the top right of their picture in the Library and on the Reels
// page (the owner's wish), and everything else finished (a podcast to its end, a page or book read). Kept in this
// browser, and shared with the user's other devices like progress.js (listensync.js). Shared by the desktop app,
// the phone and the web app.

import { noteChanged } from "./progress.js";

const KEY = "watched";
const OLD_REELS = "reels:watched";  // the Reels page's own list before this one (taken over the first time)
export const KEPT = 20000;                 // the newest this many are remembered (finished on any device: they add up)

function load() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || "null");
    if (Array.isArray(list)) return list.map(String);
    const old = JSON.parse(localStorage.getItem(OLD_REELS) || "[]");
    const taken = Array.isArray(old) ? old.map(String) : [];
    localStorage.setItem(KEY, JSON.stringify(taken));
    return taken;
  } catch { return []; }
}

/** The ids of the episodes watched to the end, as a Set (read it once for a whole list). */
export const watchedIds = () => new Set(load());

/** Note that episode `id` was watched to the end. */
export function markWatched(id) {
  const key = String(id);
  const list = load();
  if (list[list.length - 1] === key) return;
  const next = [...list.filter((x) => x !== key), key].slice(-KEPT);
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
  noteChanged(key);
}

/** Note these finished on another device (listensync.js): not noted as changed here, so not sent back. Returns how
 *  many were new here. */
export function takeWatched(ids) {
  const list = load();
  const have = new Set(list);
  const fresh = [...new Set((ids || []).map(String))].filter((x) => !have.has(x));
  if (!fresh.length) return 0;
  try { localStorage.setItem(KEY, JSON.stringify([...fresh, ...list].slice(-KEPT))); } catch { /* storage unavailable */ }
  return fresh.length;
}

/** Has playback at `t` seconds reached the end of something `dur` seconds long? Its last 5%, but never more
 * than the last 20 seconds nor less than the last 2 (the end credits of a long video, a reel's last words). */
export const atEnd = (t, dur) => dur > 0 && t >= dur - Math.min(20, Math.max(2, dur * 0.05));

/** The label on a watched video's picture (put inside a `.thumb` with the picture). */
export const watchedPill = () => `<span class="watched-pill">Watched</span>`;
