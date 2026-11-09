// Which videos have been watched to the end on this device (YouTube videos and Instagram reels), for the
// "Watched" label in the brand's purple at the top right of their picture in the Library and on the Reels
// page (the owner's wish). Kept in this browser only, like Home's "Continue" (progress.js). Shared by the
// desktop app, the phone and the web app.

const KEY = "watched";
const OLD_REELS = "reels:watched";  // the Reels page's own list before this one (taken over the first time)
const KEPT = 3000;                  // the newest this many are remembered

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
}

/** Has playback at `t` seconds reached the end of something `dur` seconds long? Its last 5%, but never more
 * than the last 20 seconds nor less than the last 2 (the end credits of a long video, a reel's last words). */
export const atEnd = (t, dur) => dur > 0 && t >= dur - Math.min(20, Math.max(2, dur * 0.05));

/** The label on a watched video's picture (put inside a `.thumb` with the picture). */
export const watchedPill = () => `<span class="watched-pill">Watched</span>`;
