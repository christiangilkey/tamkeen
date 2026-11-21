// The Library's order and its Filter popup's choices (prototype library_feed; the owner, 2026-11-21: "watched things
// to be sent to the bottom of the list by default, in progress things to be at the top and below those should be not
// yet watched things set by date with newest added on the top. There should also be a filter button allowing you to
// choose if you want to see watched, new, or in progress, filter by time added, length. This should be for every tab").
// No screen code here: the tests run it as it is.
//
// Where something is up to, read on this device (as Home's Continue is): progress.js (how far into a podcast, video,
// web page or book) and watched.js (played to the end). Each kind's own "finished":
//   - something played (podcasts, audiobooks, YouTube, Netflix, reels, your own audio and videos): played to the end
//     (watched.js), or stopped within its last bit (watched.js atEnd);
//   - a web page: read 70% of the way (progress.js PAGE_DONE_FRACTION, as Home counts it);
//   - a book: its last page reached.
// Started and not finished is "in progress"; never started is "new".

import { PAGE_DONE_FRACTION } from "./progress.js";
import { atEnd } from "./watched.js";

export const STATES = ["progress", "new", "done"];
export const SORTS = ["suggested", "newest", "oldest", "shortest", "longest"];
export const DEFAULT_CHOICE = Object.freeze({ show: STATES, sort: "suggested" });

const isBook = (ep) => (ep.audio_type || "") === "text/book";

/** Where `ep` is up to: "progress", "new" or "done". `p`: its progress.js entry (or none); `watched`: watched.js ids. */
export function stateOf(ep, p, watched) {
  const id = String(ep.id);
  if (watched && watched.has(id)) return "done";
  if (!p) return "new";
  if (p.kind === "page") {
    const frac = Number(p.frac) || 0;
    if (frac <= 0) return "new";
    return frac >= (isBook(ep) ? 0.999 : PAGE_DONE_FRACTION) ? "done" : "progress";
  }
  const pos = Number(p.pos) || 0;
  const dur = Number(p.dur) || Number(ep.duration) || 0;
  if (pos <= 2) return "new";
  return dur > 0 && atEnd(pos, dur) ? "done" : "progress";
}

/** When it was added (for a podcast's episode: when it came out), in seconds. */
export const addedAt = (ep) => Number(ep.published) || Number(ep.created_at) || 0;

/**
 * The list as the Filter popup asks: only the states in `choice.show`, in `choice.sort`'s order. "suggested" (the
 * default): in progress first (the one used last on top), then new (newest added first), then finished (the one
 * finished last on top). The others are by date added or by length (what has no length goes last); ties stay newest
 * first. `progress`: a Map of id -> progress.js entry.
 */
export function arrange(items, choice, progress, watched) {
  const show = new Set(choice && Array.isArray(choice.show) && choice.show.length ? choice.show : STATES);
  const sort = SORTS.includes(choice && choice.sort) ? choice.sort : "suggested";
  const rows = [];
  for (const ep of items) {
    const p = progress.get(String(ep.id)) || null;
    const state = stateOf(ep, p, watched);
    if (show.has(state)) rows.push({ ep, state, used: (p && p.ts) || 0, added: addedAt(ep), len: Number(ep.duration) || 0 });
  }
  const newest = (a, b) => b.added - a.added || Number(b.ep.id) - Number(a.ep.id) || 0;
  const rank = { progress: 0, new: 1, done: 2 };
  const by = {
    suggested: (a, b) => rank[a.state] - rank[b.state] || (a.state === "new" ? 0 : b.used - a.used) || newest(a, b),
    newest,
    oldest: (a, b) => a.added - b.added || -newest(a, b),
    shortest: (a, b) => (!a.len - !b.len) || a.len - b.len || newest(a, b),
    longest: (a, b) => (!a.len - !b.len) || b.len - a.len || newest(a, b),
  }[sort];
  return rows.sort(by).map((r) => r.ep);
}

/** A remembered choice made safe (a list kept from an older version, or something odd in storage). */
export function cleanChoice(raw) {
  const show = Array.isArray(raw && raw.show) ? STATES.filter((s) => raw.show.includes(s)) : [...STATES];
  return { show: show.length ? show : [...STATES], sort: SORTS.includes(raw && raw.sort) ? raw.sort : "suggested" };
}

/** Whether `choice` differs from the default (the Filter button then says how many things are changed). */
export function changedCount(choice, status = "") {
  const c = cleanChoice(choice);
  return (c.show.length < STATES.length ? 1 : 0) + (c.sort !== "suggested" ? 1 : 0) + (status ? 1 : 0);
}
