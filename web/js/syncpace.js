// When to sync, and the small rules around it, shared by every version (the phone and web app's
// sync.js and app.js, the computer's web page). Pure: no Drive, no Supabase, no page; tested in
// tests/js/syncpace.test.mjs. The computer's own timings are in app/sync/__init__.py (same numbers).
//
// How a change reaches the learner's other devices:
//   1. Sending: a change asks for a sync after a short wait (a review answer: 20 s, so a session
//      isn't a sync per card). A later, longer request never pushes back a sooner one (SyncTimer).
//      Closing the reviewer, putting the app away or switching tabs sends at once (flush).
//   2. A nudge: once something was sent, a tiny "sync" ping goes to the learner's own other devices
//      that are open (syncnudge.js), and they sync within a second or two. Only when signed in to
//      Friends; it carries nothing but a random id for this run of the app.
//   3. Checking: while the app is on screen it looks at Drive every minute (every 5 minutes when
//      put away on a phone or the computer; not at all from a hidden web page), and at once on
//      coming back to it. A check that finds nothing new costs one small Drive request (canSkip).

export const CHECK_VISIBLE_MS = 60 * 1000;      // on screen: look at Drive every minute
export const CHECK_HIDDEN_MS = 5 * 60 * 1000;   // the apps, put away (if they still run at all)
export const RETURN_GAP_MS = 10 * 1000;         // coming back twice in a row: one check is enough
export const NUDGE_DELAY_MS = 1200;             // a nudge from another device: sync this soon
export const FULL_EVERY_MS = 15 * 60 * 1000;    // read the whole library at least this often anyway
export const NUDGE_EVENT = "sync";

/** How often to look at Drive: every minute on screen; put away, every 5 minutes in the apps and
 *  never from a web page (0 = don't). */
export function checkEvery({ visible, web = false }) {
  if (visible) return CHECK_VISIBLE_MS;
  return web ? 0 : CHECK_HIDDEN_MS;
}

/** When a sync asked for `delayMs` from `now` should run, given one already due at `current`
 *  (0 = none): the sooner of the two. (A game save asking for 90 s must not push back a review
 *  answer's 20 s, which used to delay an upload by minutes.) */
export function earliestDue(current, now, delayMs) {
  const due = now + Math.max(0, Number(delayMs) || 0);
  return current && current <= due ? current : due;
}

/** The pending sync on this device: asked for with a delay, run once when due, or at once (flush)
 *  when the app is put away or the reviewer closes. Timers are passed in for the tests. */
export class SyncTimer {
  constructor(run, { now = () => Date.now(), setTimer = (f, ms) => setTimeout(f, ms), clearTimer = (t) => clearTimeout(t) } = {}) {
    this.run = run;
    this.now = now;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.due = 0;
    this.handle = null;
  }

  get pending() { return this.due > 0; }

  /** Sync in `delayMs` (or sooner, if a sooner one is already asked for). */
  request(delayMs) {
    const due = earliestDue(this.due, this.now(), delayMs);
    if (due === this.due && this.handle !== null) return;
    if (this.handle !== null) this.clearTimer(this.handle);
    this.due = due;
    this.handle = this.setTimer(() => this.fire(), Math.max(0, due - this.now()));
  }

  fire() {
    if (this.handle !== null) this.clearTimer(this.handle);
    this.handle = null;
    this.due = 0;
    this.run();
  }

  /** Run a pending sync now (the app is being put away). True when there was one. */
  flush() {
    if (!this.pending) return false;
    this.fire();
    return true;
  }

  cancel() {
    if (this.handle !== null) this.clearTimer(this.handle);
    this.handle = null;
    this.due = 0;
  }
}

/** Coming back to the app (tab shown, window focused, phone app resumed): check Drive, unless the
 *  last check started under RETURN_GAP_MS ago. */
export function checkOnReturn(lastCheckAt, now) {
  return !lastCheckAt || now - lastCheckAt >= RETURN_GAP_MS;
}

// ---------- the cheap check ----------

/** What identifies one version of the library file in Drive. */
export function libraryFingerprint(meta) {
  if (!meta || !meta.id) return "";
  return [meta.id, meta.modifiedTime || "", meta.size || "", meta.md5Checksum || ""].join("|");
}

/** Can this sync skip downloading the library? Only when the file in Drive is exactly the one the
 *  last sync ended with, that sync finished everything (no transcript left to fetch), the library
 *  here hasn't changed since (same `hash`), and the whole library was read lately. `memo` is what
 *  the last sync left: {fp, hash, complete, fullAt}. */
export function canSkip(memo, fp, hash, now) {
  return !!(memo && memo.complete && fp && memo.fp === fp && memo.hash === hash && now - (memo.fullAt || 0) < FULL_EVERY_MS);
}

/** A quick fingerprint of a long text (53 bits; cyrb53). Used to notice "nothing changed here". */
export function hashText(text) {
  const s = String(text);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

// ---------- the nudge between the learner's own devices ----------

/** The text the nudge key is made from: the id of the learner's library file in their own Drive
 *  (the same on all their devices, seen by nobody else). */
export const nudgeSeed = (libraryId) => `tamkeen-nudge:${libraryId}`;

/** The nudge key: SHA-256 of nudgeSeed, first 32 hex digits (app/sync/__init__.py makes the same). */
export async function nudgeKey(libraryId) {
  if (!libraryId || !globalThis.crypto || !globalThis.crypto.subtle) return "";
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(nudgeSeed(libraryId)));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

/** The realtime channel only this learner's devices know: their Friends id plus the nudge key. The
 *  key can't be guessed (it comes from a file id in their own Drive), so nobody else can listen or
 *  send there; and all a nudge carries is a random id for this run of the app. "" = can't nudge. */
export function nudgeChannel(userId, key) {
  if (!userId || !/^[0-9a-f]{32}$/.test(String(key || ""))) return "";
  return `sync:${userId}:${key}`;
}

/** A random id for this run of the app (so it can tell its own nudges apart). */
export function runId() {
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** The whole of a nudge. */
export const nudgePayload = (me) => ({ d: me });

/** Should this nudge make this device sync? Not its own, and only a well-formed one. */
export function nudgeFromOther(payload, me) {
  const d = payload && typeof payload === "object" ? payload.d : null;
  return typeof d === "string" && /^[0-9a-f]{8,40}$/.test(d) && d !== me;
}

// ---------- after a sync ----------

/** The toast after the refresh button: "Up to date", or how many changes came. */
export function refreshMessage(received) {
  const n = Math.max(0, Math.floor(Number(received) || 0));
  if (!n) return "Up to date";
  return n === 1 ? "Got 1 change from your other devices" : `Got ${n} changes from your other devices`;
}

/** Should the page on screen be drawn again after a sync? Only when something arrived and nothing
 *  would be lost (no player, chat, first-run questions, reviewer, open box or typing). A sync made
 *  by itself redraws only the pages that show counts (Home, Vocab); the refresh button, any page. */
export function shouldRedraw({ received, hash = "", busy = false, manual = false }) {
  if (!(Number(received) > 0) || busy) return false;
  const path = String(hash).replace(/^#\/?/, "").split("?")[0];
  if (/^(episode|chat|welcome|setup|reels\/play)/.test(path)) return false;
  return manual || path === "" || path === "vocab";
}
