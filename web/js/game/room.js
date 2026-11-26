// The creature's room (prototype "habitat_room", the owner's design of 2026-11-25): Home's habitat window turned into a
// room the creature walks about in, with its door out to the village. Pure: no screen code (habitat.js draws it).
//
// The owner: "I dont want it to openin a new window after tapping it but just move the creature aroaund ... things that
// should be outside like the inkwell should go outside". So the window itself is the room: a tap on the floor walks the
// creature there (round the furniture); indoor decorations stand in the room, everything else (outdoor and planted
// decorations, the garden's plots and buildings) stays outside, where the door leads. The plan, and the slices still to
// come (carrying decorations, the village, the market): side-session notes, habitat-revamp-plan.md.
//
// The art is web/game-art/room/ (tools/game_art/room.py); the numbers below are the same as there.

import { HABITAT } from "./data.js";

const [W] = HABITAT.size;
export const ROOM = {
  floorTop: 84,                         // where the floor starts (the wall's foot)
  walk: { x0: 14, x1: W - 14, y0: 94, y1: 138 }, // where the creature's feet may be
  door: { x0: 262, y0: 20, x1: 299, y1: 83 },     // the doorway (the door piece is drawn at x0, y0)
  doorSpot: { x: 280, y: 95 },          // where it stands to go out
  window: { x0: 116, y0: 18, x1: 198, y1: 60 },
  backScale: 0.84,                      // how big the creature is drawn at the back of the floor (1 at the front)
  egg: { x: W / 2, y: 126 },            // where an egg sits
};
/** Outside, where the house's door stands (by the left edge of today's outdoor scene, the village to come). */
export const YARD_DOOR = { x: 25, w: 38, h: 64 };

// Where each decoration belongs (the owner: indoor things in the room, outdoor ones outside, plants planted).
export const INDOOR = ["bed", "bookshelf", "radio", "food_bowl", "toy_ball", "nest", "lantern_small"];
export const PLANTED = ["flower_red", "flower_blue", "mushroom", "grass_tuft", "bush", "tree_fruit"];
const bare = (id) => String(id || "").replace(/^decor\//, "");
/** "indoor", "planted" or "outdoor" for a decoration id ("decor/bed" or "bed"). */
export const placeOf = (id) => (INDOOR.includes(bare(id)) ? "indoor" : PLANTED.includes(bare(id)) ? "planted" : "outdoor");
export const isIndoor = (id) => placeOf(id) === "indoor";

/** How big the creature is drawn with its feet at `y`: smaller at the back of the floor. */
export const depthScale = (y) => {
  const { y0, y1 } = ROOM.walk;
  const k = Math.max(0, Math.min(1, (y - y0) / (y1 - y0)));
  return ROOM.backScale + (1 - ROOM.backScale) * k;
};

// Where indoor decorations stand until the owner places them (slice 2 lets the creature carry them anywhere): against
// the back wall first (clear of the hearth, x 12-80), then out on the floor, never in front of the door.
const SLOTS = [
  { x: 104, y: 95 }, { x: 226, y: 94 }, { x: 60, y: 128 }, { x: 246, y: 128 }, { x: 150, y: 136 }, { x: 22, y: 132 },
  { x: 196, y: 120 }, { x: 88, y: 116 },
];

/** The indoor decorations out in the habitat, each with its spot: [{id, x, y}] (`y` is where it stands: its base). */
export function roomLayout(decor, spots = {}) {
  const inside = (Array.isArray(decor) ? decor : []).filter((d) => d && isIndoor(d.id));
  return inside.slice(0, SLOTS.length).map((d, i) => {
    // where the creature put it down (home.js), kept on the floor; or its own spot
    const s = spots && spots[d.id];
    const at = s && Number.isFinite(s.x) && Number.isFinite(s.y) ? clampToFloor(s) : SLOTS[i];
    return { id: d.id, x: at.x, y: at.y };
  });
}

// ---------- walking: the shortest way round the furniture ----------
// Every function takes the walking area last (the room's floor unless said: the yard outside has its own, yard.js).
const CELL = 6;
const cols = (A) => Math.floor((A.x1 - A.x0) / CELL) + 1;
const rows = (A) => Math.floor((A.y1 - A.y0) / CELL) + 1;
const cellOf = (p, A) => ({
  c: Math.max(0, Math.min(cols(A) - 1, Math.round((p.x - A.x0) / CELL))),
  r: Math.max(0, Math.min(rows(A) - 1, Math.round((p.y - A.y0) / CELL))),
});
const pointOf = (c, r, A) => ({ x: A.x0 + c * CELL, y: A.y0 + r * CELL });
/** The grid square a point is in, as the blocked sets name them ("c,r"). */
export const cellKey = (p, A = ROOM.walk) => { const { c, r } = cellOf(p, A); return `${c},${r}`; };

/** The squares furniture stands on: a piece `w` wide blocks a strip at its base, about a third as deep as it is wide. */
export function blockedCells(items, sizeOf = () => 32, A = ROOM.walk) {
  const out = new Set();
  for (const it of items) {
    const w = sizeOf(it.id);
    const depth = Math.max(6, Math.round(w / 3));
    for (let r = 0; r < rows(A); r++) {
      for (let c = 0; c < cols(A); c++) {
        const p = pointOf(c, r, A);
        if (Math.abs(p.x - it.x) < w / 2 - 2 && p.y <= it.y + 2 && p.y >= it.y - depth) out.add(`${c},${r}`);
      }
    }
  }
  return out;
}

/** The nearest free spot to `p` on the floor (itself when it is free). */
export function freeSpot(p, blocked, A = ROOM.walk) {
  const start = cellOf(p, A);
  if (!blocked.has(`${start.c},${start.r}`)) return pointOf(start.c, start.r, A);
  let best = null;
  for (let r = 0; r < rows(A); r++) {
    for (let c = 0; c < cols(A); c++) {
      if (blocked.has(`${c},${r}`)) continue;
      const d = (c - start.c) ** 2 + ((r - start.r) * 1.5) ** 2;
      if (!best || d < best.d) best = { c, r, d };
    }
  }
  return best ? pointOf(best.c, best.r, A) : pointOf(start.c, start.r, A);
}

/** The way from `a` to `b` round the furniture: a list of points ending at `b` (or at the nearest free spot to it).
 * Steps go along rows, columns and diagonals; the list is thinned to its corners. */
export function findPath(a, b, blocked, A = ROOM.walk) {
  const goal = cellOf(freeSpot(b, blocked, A), A);
  const from = cellOf(a, A);
  const key = (c, r) => `${c},${r}`;
  const open = [{ c: from.c, r: from.r, g: 0, f: 0 }];
  const came = new Map();
  const cost = new Map([[key(from.c, from.r), 0]]);
  while (open.length) {
    open.sort((x, y) => x.f - y.f);
    const cur = open.shift();
    if (cur.c === goal.c && cur.r === goal.r) {
      const cells = [cur];
      let k = key(cur.c, cur.r);
      while (came.has(k)) { const p = came.get(k); cells.unshift(p); k = key(p.c, p.r); }
      // keep only where the direction changes, then the end exactly where asked (if that spot was free)
      const pts = [];
      for (let i = 1; i < cells.length; i++) {
        const prev = cells[i - 1], here = cells[i], next = cells[i + 1];
        if (!next || next.c - here.c !== here.c - prev.c || next.r - here.r !== here.r - prev.r) pts.push(pointOf(here.c, here.r, A));
      }
      const end = blocked.has(key(cellOf(b, A).c, cellOf(b, A).r)) ? freeSpot(b, blocked, A) : clampToFloor(b, A);
      if (pts.length) pts[pts.length - 1] = end; else pts.push(end);
      return pts;
    }
    for (let dc = -1; dc <= 1; dc++) {
      for (let dr = -1; dr <= 1; dr++) {
        if (!dc && !dr) continue;
        const c = cur.c + dc, r = cur.r + dr;
        if (c < 0 || r < 0 || c >= cols(A) || r >= rows(A) || blocked.has(key(c, r))) continue;
        if (dc && dr && (blocked.has(key(cur.c + dc, cur.r)) || blocked.has(key(cur.c, cur.r + dr)))) continue; // no cutting corners
        const g = cur.g + (dc && dr ? 1.414 : 1);
        if (g >= (cost.get(key(c, r)) ?? Infinity)) continue;
        cost.set(key(c, r), g);
        came.set(key(c, r), cur);
        open.push({ c, r, g, f: g + Math.hypot(goal.c - c, goal.r - r) });
      }
    }
  }
  return [clampToFloor(b, A)]; // (walled in: it just goes)
}

/** A point kept on the floor. */
export const clampToFloor = (p, A = ROOM.walk) => ({
  x: Math.max(A.x0, Math.min(A.x1, p.x)),
  y: Math.max(A.y0, Math.min(A.y1, p.y)),
});

/** What a tap at (x, y) in the room means: "door", "floor" (walk there) or "wall" (walk to the floor below it). */
export function tapIn(x, y) {
  const d = ROOM.door;
  if (x >= d.x0 && x <= d.x1 && y >= d.y0 && y <= d.y1 + 6) return "door";
  return y >= ROOM.floorTop ? "floor" : "wall";
}

// ---------- where the creature is (this device only: which side of its door, and where it stands) ----------
const KEY = "tamkeen.game.roomView";
/** "room" or "yard" (outside), remembered on this device. */
export function savedView() {
  try { return localStorage.getItem(KEY) === "yard" ? "yard" : "room"; } catch { return "room"; }
}
export function saveView(view) {
  try { localStorage.setItem(KEY, view === "yard" ? "yard" : "room"); } catch { /* not kept: it starts in its room */ }
}
