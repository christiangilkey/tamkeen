// Shares what has been listened to, watched and read, and how far, with the user's other devices (the owner,
// 2026-11-27: "yes sync what I've listened to between devices"; before, a podcast finished on the phone still counted
// as new on the computer, "Listened to 0").
//
// The page keeps its own lists (progress.js: how far; watched.js: finished), keyed by the episode's id on this device.
// What changes is sent to the app (POST /api/listening: app/api/listening.py on the computer, backend.js on the phone
// and in the web app), which keeps it by the episode's uid and syncs it through the user's Google Drive. After each
// sync the page takes in what the other devices did (GET /api/listening). The first time, everything this device
// already had is sent, so nothing from before is lost. Shared by every version.

import { allProgress, changedIds, clearChanged, takeProgress } from "./progress.js";
import { takeWatched, watchedIds } from "./watched.js";

const SENT_ALL = "listenSentAll"; // this device's lists were sent in full once
const BATCH = 500;                // records in one request
const RECENT = 500;               // how many of the others' latest positions are taken in (progress.js keeps 500)

// The app's api() (each version's app.js passes its own to startListenSync: the computer's server, or the phone's
// stand-in), so this file loads without a page around it (tests/js/listening.test.mjs).
let api = () => Promise.reject(new Error());
export function useApi(fn) { api = fn; }

/** The record sent for item `id`: how far it got here (progress.js) and whether it was finished (watched.js). */
export function recordOf(id, p, finished) {
  return { id, kind: (p && p.kind) || "video", ts: (p && p.ts) || 0, pos: (p && p.pos) || 0, dur: (p && p.dur) || 0,
    frac: (p && p.frac) || 0, done: finished ? (p && p.ts) || 1 : 0, title: (p && p.title) || "", sub: (p && p.sub) || "" };
}

let sending = null;

/** Send what changed here (everything, the first time). */
export function sendListening() {
  if (sending) return sending;
  sending = (async () => {
    const all = !localStorage.getItem(SENT_ALL);
    const progress = new Map(allProgress().map((p) => [String(p.id), p]));
    const watched = watchedIds();
    const ids = all ? [...new Set([...progress.keys(), ...watched])] : changedIds();
    for (let i = 0; i < ids.length; i += BATCH) {
      const chunk = ids.slice(i, i + BATCH);
      await api("/listening", { method: "POST", body: { items: chunk.map((id) => recordOf(id, progress.get(id), watched.has(id))) } });
      clearChanged(chunk);
    }
    if (all) try { localStorage.setItem(SENT_ALL, "1"); } catch { /* storage unavailable */ }
  })().finally(() => { sending = null; });
  return sending;
}

/** Take in what the app keeps (this device's and the others'). Resolves to how many changed here. */
export async function takeListening() {
  const { items } = await api("/listening");
  if (!Array.isArray(items)) return 0;
  const latest = items.filter((x) => x && x.ts > 0).sort((a, b) => b.ts - a.ts).slice(0, RECENT);
  const n = takeProgress(latest) + takeWatched(items.filter((x) => x && x.done > 0).map((x) => String(x.id)));
  if (n) window.dispatchEvent(new CustomEvent("tamkeen:listening")); // an open Library may draw its marks again
  return n;
}

/** Start: send and take in now, again after each sync, and send what changes as it changes (at most every 30 s). */
export function startListenSync(appApi, on) {
  useApi(appApi);
  const quiet = (p) => p.catch(() => {}); // (an older app without the routes, or no connection: next time)
  setTimeout(() => quiet(sendListening().then(takeListening)), 4000);
  on("sync", (s) => { if (!s || !s.state || s.state === "idle") quiet(takeListening()); });
  setInterval(() => { if (changedIds().length) quiet(sendListening()); }, 30000);
  document.addEventListener("visibilitychange", () => { if (document.hidden && changedIds().length) quiet(sendListening()); });
}
