// Where the decorations stand in the creature's home (prototype "habitat_room", slice 2 of the owner's design of
// 2026-11-25: "the creature carries decorations to where the player taps, and sometimes moves small things by itself").
// Pure: no screen code (habitat.js does the carrying).
//
// state.home = { at, spots: { <decoration id>: {x, y} } }: each decoration's spot in the room (indoor ones) or in the
// yard (the rest), in scene pixels, set when the creature puts it down. A decoration with no spot stands where it
// always did (room.js SLOTS, yard.js decorSpot). `at` (seconds) is when the layout last changed: when two copies of a
// game meet, the later layout is kept whole (merge.js joinHome, app/sync/gamemerge.py _join_home), as a room is
// arranged as a whole.

import { placeDecor } from "./rules.js";

const bare = (id) => String(id || "").replace(/^decor\//, "");
/** The small things the creature moves about by itself now and then (indoor ones it can carry easily). */
export const SMALL = ["toy_ball", "food_bowl", "lantern_small", "radio"];
export const isSmall = (id) => SMALL.includes(bare(id));

/** The home's layout, made whole if missing or odd. */
export function homeOf(state) {
  const h = state.home && typeof state.home === "object" && !Array.isArray(state.home) ? state.home : {};
  if (!Number.isFinite(h.at)) h.at = 0;
  if (!h.spots || typeof h.spots !== "object" || Array.isArray(h.spots)) h.spots = {};
  state.home = h;
  return h;
}

/** A decoration's chosen spot, or null (it stands where it always did). */
export function spotOf(state, id) {
  const s = homeOf(state).spots[id];
  return s && Number.isFinite(s.x) && Number.isFinite(s.y) ? { x: s.x, y: s.y } : null;
}

/** The creature has put a decoration down at `p`. */
export function setSpot(state, id, p, now = Date.now()) {
  const h = homeOf(state);
  h.spots[id] = { x: Math.round(p.x), y: Math.round(p.y) };
  h.at = Math.floor(now / 1000);
}

/** Put a decoration away (back to My things): out of the habitat, its spot forgotten. */
export function putAway(state, id, now = Date.now()) {
  placeDecor(state, id, false);
  const h = homeOf(state);
  delete h.spots[id];
  h.at = Math.floor(now / 1000);
}

/** Two copies' layouts: the one changed later, whole (the first on a tie). */
export function joinHome(x, y) {
  const ok = (v) => v && typeof v === "object" && !Array.isArray(v);
  if (!ok(x) || !ok(y)) return ok(x) ? x : ok(y) ? y : undefined;
  return (Number(y.at) || 0) > (Number(x.at) || 0) ? y : x;
}
