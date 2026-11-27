// What has been listened to, watched and read, and how far, as the user's devices share it through the Drive sync:
// one record per episode uid, {kind, ts, pos, dur, frac, done, title, sub} (see app/listening.py, whose
// clean_state / merge_state these are the twins of; tests/fixtures/listening_cases.json keeps them in step).
// Used by the phone's own app (mobile/src/js/backend.js, sync.js) and the page's go-between (listensync.js).

export const KINDS = ["audio", "video", "page"];
const UID = /^[\w-]{1,64}$/;
const TEXT_MAX = 200;
export const UNFINISHED_KEPT = 1000; // the newest this many not-yet-finished items (finished ones are all kept)
export const MOST = 20000;           // and never more than this many in all (the newest)

// (only real numbers: a number written as text is read differently by the two languages)
const whole = (x) => (typeof x !== "number" || !(x > 0) || x === Infinity ? 0 : Math.trunc(Math.min(x, 9e15)));
const frac = (x) => (typeof x !== "number" || !(x > 0) ? 0 : x >= 1 ? 1 : x);
// (cut by characters as Python counts them, so a long title ends at the same place on both)
const text = (x) => (typeof x === "string" ? [...x.trim()].slice(0, TEXT_MAX).join("") : "");

/** One record made safe, or null when it says nothing (never played, never finished). */
export function cleanEntry(rec) {
  if (!rec || typeof rec !== "object" || Array.isArray(rec)) return null;
  const out = { kind: KINDS.includes(rec.kind) ? rec.kind : "audio", ts: whole(rec.ts), pos: whole(rec.pos), dur: whole(rec.dur),
    frac: frac(rec.frac), done: whole(rec.done), title: text(rec.title), sub: text(rec.sub) };
  return out.ts || out.done ? out : null;
}

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** All records made safe, in uid order: finished ones all kept, unfinished ones the newest UNFINISHED_KEPT, never
 *  more than MOST in all. */
export function cleanState(state) {
  if (!state || typeof state !== "object" || Array.isArray(state)) return {};
  const good = {};
  for (const [uid, rec] of Object.entries(state)) {
    if (!UID.test(uid)) continue;
    const entry = cleanEntry(rec);
    if (entry) good[uid] = entry;
  }
  const newest = Object.keys(good).sort((a, b) => cmp(good[b].ts, good[a].ts) || cmp(good[b].done, good[a].done) || cmp(b, a));
  const dropped = new Set([...newest.filter((u) => !good[u].done).slice(UNFINISHED_KEPT), ...newest.slice(MOST)]);
  const out = {};
  for (const uid of Object.keys(good).sort(cmp)) if (!dropped.has(uid)) out[uid] = good[uid];
  return out;
}

const RANK = ["ts", "done", "frac", "pos", "dur", "kind", "title", "sub"];
// (strings compared by code point, as Python does)
const cmpText = (a, b) => { const x = [...a].map((c) => c.codePointAt(0)), y = [...b].map((c) => c.codePointAt(0));
  for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return x[i] - y[i];
  return x.length - y.length; };
const rank = (a, b) => { for (const k of RANK) { const d = typeof a[k] === "string" ? cmpText(a[k], b[k]) : cmp(a[k], b[k]); if (d) return d; } return 0; };

/** Two clean records of one item as one: the one used last (on a tie, the larger, so every device agrees), with
 *  "finished" and the furthest point of a page kept from both. */
export function mergeEntry(a, b) {
  if (!a || !b) return a || b || null;
  const win = rank(a, b) >= 0 ? a : b;
  return { ...win, done: Math.max(a.done, b.done), frac: Math.max(a.frac, b.frac) };
}

export function mergeState(mine, theirs) {
  const a = cleanState(mine), b = cleanState(theirs);
  const out = { ...a };
  for (const [uid, rec] of Object.entries(b)) out[uid] = mergeEntry(out[uid], rec);
  return cleanState(out);
}

// ---------- the phone's own app (mobile/src/js/backend.js), where an episode's id is its uid ----------

/** GET /listening: what is kept, for the episodes still in the library (`live`: a Set of their uids). */
export const listItems = (state, live) => Object.entries(state || {}).filter(([uid]) => live.has(uid)).map(([uid, rec]) => ({ ...rec, id: uid, uid }));

/** POST /listening: the page's records merged into `state`, for the episodes in the library (`known`: a Set of their
 *  uids). Returns {state, saved}: the new state and how many items changed. */
export function takeItems(state, items, known) {
  const theirs = {};
  for (const item of items || []) if (item && typeof item === "object" && known.has(String(item.id))) theirs[String(item.id)] = item;
  const before = state || {};
  const after = mergeState(before, theirs);
  let saved = 0;
  for (const uid of new Set([...Object.keys(before), ...Object.keys(after)])) if (JSON.stringify(before[uid]) !== JSON.stringify(after[uid])) saved++;
  return { state: after, saved };
}
