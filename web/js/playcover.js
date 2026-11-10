// How much of an episode was really played: for the creature game's colourings earned by watching Netflix episodes
// and listening to podcast episodes "to the end" (game/data.js FEATS). Skipping to the end mustn't count, so an
// episode counts only when both hold:
//   - playback reached near its end (nearEnd: its last 10%, but at most the last 3 minutes and at least the last
//     20 seconds; Netflix often moves on to the next episode during the credits), and
//   - at least DONE_SHARE of it was actually played, at any speed: the episode is cut into STEP-second pieces and a
//     piece counts once steady playback has passed its middle. A jump (a seek, the skip buttons) marks nothing;
//     playing a part again doesn't count it twice.
// No screen code: pages/player.js (podcasts, Netflix on the computer) and the Netflix extension's subtitle bar
// (extension/src/js/ext/panel.js) feed it the player's time. What was played is kept on the device (localStorage) so
// an episode can be finished on another day.

export const STEP = 5;          // seconds in a piece
export const DONE_SHARE = 0.8;  // the share of an episode that must really have played
const KEPT = 40;                // episodes remembered on the device (the newest)
const INDEX = "cover:index";

/** Has playback at `t` seconds reached near the end of something `dur` seconds long? */
export const nearEnd = (t, dur) => dur > 0 && t >= dur - Math.min(180, Math.max(20, dur * 0.1));

/** A fresh record of what was played of an episode `dur` seconds long. */
export function newCover(dur) {
  const d = Number(dur) > 0 && Number.isFinite(Number(dur)) ? Number(dur) : 0;
  const n = Math.max(1, Math.ceil(d / STEP));
  return { d, n, bits: new Uint8Array(Math.ceil(n / 8)), last: null, done: false };
}

const set = (c, k) => { if (k >= 0 && k < c.n) c.bits[k >> 3] |= 1 << (k & 7); };
const has = (c, k) => (c.bits[k >> 3] >> (k & 7)) & 1;

/** The share (0..1) of the episode that has really played. */
export function share(c) {
  let on = 0;
  for (let k = 0; k < c.n; k++) on += has(c, k);
  return on / c.n;
}

/**
 * The player said where it is: `t` seconds in, `playing` or not, at speed `rate`, at wall-clock time `wall` (ms).
 * When it played steadily since the last time it said (it moved forward about as far as that much time at that speed
 * allows), the pieces in between count as played. Returns true the first time the episode counts as finished.
 */
export function track(c, t, playing, rate = 1, wall = Date.now()) {
  if (!c || !(c.d > 0) || !Number.isFinite(t)) return false;
  if (!playing) { c.last = null; return false; }
  const last = c.last;
  c.last = { t, w: wall };
  if (last) {
    const dt = t - last.t;
    const dw = Math.max(0, (wall - last.w) / 1000);
    const speed = Math.max(0.25, Math.min(4, Number(rate) || 1));
    if (dt > 0 && dt <= dw * speed * 1.5 + 1) {
      // every piece whose middle this steady stretch played through
      for (let k = Math.max(0, Math.floor(last.t / STEP)); k <= Math.floor(t / STEP) && k < c.n; k++) {
        const mid = (k * STEP + Math.min((k + 1) * STEP, c.d)) / 2;
        if (last.t < mid && mid <= t) set(c, k);
      }
    }
  }
  if (!c.done && nearEnd(t, c.d) && share(c) >= DONE_SHARE) { c.done = true; return true; }
  return false;
}

// ---------- kept on the device ----------
const toText = (bits) => { let s = ""; for (const b of bits) s += b.toString(16).padStart(2, "0"); return s; };
const fromText = (s, size) => {
  const out = new Uint8Array(size);
  for (let i = 0; i < size && i * 2 + 1 < s.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16) || 0;
  return out;
};

/** What was played of episode `key` ("podcast:<id>", "netflix:<id>") before, for an episode `dur` seconds long
 * (a fresh record when there is none or its length changed). */
export function loadCover(key, dur, store = globalThis.localStorage) {
  const c = newCover(dur);
  try {
    const saved = JSON.parse(store.getItem(`cover:${key}`) || "null");
    if (saved && Math.abs(Number(saved.d) - c.d) < 2 && typeof saved.b === "string") {
      c.bits = fromText(saved.b, c.bits.length);
      c.done = saved.done === true;
    }
  } catch { /* storage unavailable: start afresh */ }
  return c;
}

/** Keep what was played of episode `key` (the newest KEPT episodes are kept). */
export function saveCover(key, c, store = globalThis.localStorage) {
  if (!c || !(c.d > 0)) return;
  try {
    store.setItem(`cover:${key}`, JSON.stringify({ d: c.d, b: toText(c.bits), done: c.done }));
    let index = [];
    try { index = JSON.parse(store.getItem(INDEX) || "[]"); } catch { index = []; }
    if (!Array.isArray(index)) index = [];
    index = [...index.filter((k) => k !== key), key];
    for (const old of index.slice(0, Math.max(0, index.length - KEPT))) store.removeItem(`cover:${old}`);
    store.setItem(INDEX, JSON.stringify(index.slice(-KEPT)));
  } catch { /* storage full or off */ }
}
