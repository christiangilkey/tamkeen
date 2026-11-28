// The farm as a place (prototype "farm"): west of the cottage, through the gate at the yard's left edge. Pure: no
// screen code (habitat.js draws it as it draws the yard and the hall: the battle terrain's own tiles, from above).
//
// 36 tiles long (the camera follows the creature) and 9 high, entered from the yard at its right end (the owner, 2026-11-27:
// "the farm should be closer to the right side, and the buildings ... more compact together; less space the player
// needs to walk ... The upgraded farm can expand towards the left"). By the entrance: the barn at the top right (its
// door opens the barn), the seed stand beside it, the buildings' six spots below them, and the fenced field just west
// of them (farm.js: 3 x 3 at first, 12 x 6 at most, its fence redrawn as it grows WEST, a gap in it at the bottom); a
// path along the bottom to the yard. The upgrades (windmill, compost bin, scarecrow) stand west of the biggest field.
// Field spot (c, r) counts its column from the field's RIGHT edge, so the spots already planted stay put as it grows.

import { TILE } from "./battlemap.js";
import { HABITAT } from "./data.js";

const [W, H] = HABITAT.size;
export const FARM_COLS = 36; // (32 until slice 5: the windmill and the compost bin stand at the far end)
export const FARM_W = FARM_COLS * TILE;
const ROWS = H / TILE; // 9
/** The field's top left tile (its first plant), and where the fence ring around it starts. */
export const FIELD = { right: 19, y: 1 };
/** The row of the pen's entrance: a gap in its east fence, facing the buildings and the way in (the seed stand in front). */
export const GAP_ROW = FIELD.y + 1;
/** The field's leftmost column, for a field `w` wide. */
export const fieldLeft = (w) => FIELD.right - w + 1;
/** The barn (walls under a roof), its door, and the seed stand (world px of its foot's middle). */
export const BARN = { x0: 0, y0: 0, w: 4, h: 3, door: { tx: 2, ty: 2 } };
export const SEED_STAND = { x: (FIELD.right + 3) * TILE, y: (GAP_ROW + 3) * TILE };
/** The gate back to the yard (its foot's middle), and where the creature comes in. */
export const FARM_GATE = { x: (FARM_COLS - 1) * TILE, y: 8 * TILE + 12 };
export const FARM_IN = { x: (FARM_COLS - 2) * TILE, y: 8 * TILE + 8 };
/** Where its feet may be. */
export const FARM_WALK = { x0: 8, x1: FARM_W - 8, y0: 10, y1: H - 4 };
/** The middle of field spot (c, r), world px. */
export const spotXY = (c, r) => ({ x: (FIELD.right - c) * TILE + TILE / 2, y: (FIELD.y + r) * TILE + TILE / 2 });
/** The middle column of a field `w` wide (where the sprinkler stands, below it). */
export const gapCol = (w) => FIELD.right - Math.floor(w / 2);

const made = new Map();
/** The farm as a battle map for a field `w` x `h` (battlemap.drawCorners draws its ground). */
export function farmMap(w, h) {
  const key = `${w}x${h}`;
  if (made.has(key)) return made.get(key);
  const tiles = new Array(FARM_COLS * ROWS).fill("grass");
  const set = (x, y, t) => { if (x >= 0 && y >= 0 && x < FARM_COLS && y < ROWS) tiles[y * FARM_COLS + x] = t; };
  for (let x = 0; x < FARM_COLS; x++) set(x, ROWS - 1, "dirt"); // the path along the bottom
  for (let y = 0; y < ROWS - 1; y++) set(FARM_COLS - 1, y, "fence"); // the fence line along its edge with the yard (its gap: the path, and the gate)
  // the fence ring round the field (its entrance a gap in the east side, the seed stand in front), the field itself tilled
  const x0 = fieldLeft(w) - 1, y0 = FIELD.y - 1, x1 = FIELD.right + 1, y1 = FIELD.y + h;
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
    const ring = x === x0 || x === x1 || y === y0 || y === y1;
    set(x, y, ring ? "fence" : "dirt");
  }
  set(x1, GAP_ROW, "dirt");
  set(x1 + 1, GAP_ROW, "dirt");
  for (let x = BARN.x0; x < BARN.x0 + BARN.w; x++) for (let y = BARN.y0; y < BARN.y0 + BARN.h; y++) set(x, y, "house_wall");
  const props = [
    { id: "barrel", x: 34, y: 7, w: 1 },
    { id: "bush_flower", x: 26, y: 0, w: 1 }, { id: "bush_flower", x: 33, y: 0, w: 1 }, { id: "bush", x: 5, y: 5, w: 1 },
  ].filter((p) => p.x > x1 || p.y > y1 || p.x + p.w <= x0 || p.y < y0); // (never inside the fence, however big)
  const propTiles = tiles.map(() => null);
  for (const p of props) for (let k = 0; k < p.w; k++) propTiles[p.y * FARM_COLS + p.x + k] = p.id;
  const m = {
    seed: "farm", seedNum: 20261126 + w * 13 + h, theme: "village", cols: FARM_COLS, rows: ROWS, width: FARM_W, height: H, base: "grass",
    light: "day", tiles, propTiles, under: tiles.map(() => null), props: props.sort((a, b) => a.y - b.y || a.x - b.x),
    decals: [], ornaments: [], hazards: [], secrets: [],
    roofs: [{ x0: BARN.x0, y0: BARN.y0, w: BARN.w, h: BARN.h, style: "shingle", extras: [], alpha: 1 }],
  };
  made.set(key, m);
  return m;
}

const WALKABLE = new Set(["grass", "dirt", "flowers", "tall_grass"]);
/** The grid squares (room.js cells over FARM_WALK) the creature can't walk on: the barn, the fence, the props. */
export function farmBlocked(w, h, cellKeyOf, extra = new Set()) {
  const out = new Set(extra);
  const m = farmMap(w, h);
  for (let y = FARM_WALK.y0; y <= FARM_WALK.y1; y += 2) {
    for (let x = FARM_WALK.x0; x <= FARM_WALK.x1; x += 2) {
      const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
      const id = m.tiles[ty * FARM_COLS + tx];
      if (!WALKABLE.has(id) || m.propTiles[ty * FARM_COLS + tx]) out.add(cellKeyOf({ x, y }));
    }
  }
  return out;
}

/** Where the camera stands (its left edge) for the creature at x. */
export const farmCamera = (x) => Math.max(0, Math.min(FARM_W - W, x - W / 2));

/** How far outside the field (world px) a tap still counts for its nearest spot: a spot is 16 px, about 18 screen px
 * on a phone, far less than a finger, so a near miss counts (the fence and a little beyond). */
export const PLOT_SLACK = 8; // (half the fence: its outer half still opens the fence card)
/** The field spot nearest a tap at (x, y), for a field `w` x `h`: {c, r}, or null when the tap is not in the field
 * nor within PLOT_SLACK of it. */
export function plotAt(x, y, w, h) {
  const x0 = fieldLeft(w) * TILE, y0 = FIELD.y * TILE, x1 = (FIELD.right + 1) * TILE, y1 = (FIELD.y + h) * TILE;
  if (x < x0 - PLOT_SLACK || x >= x1 + PLOT_SLACK || y < y0 - PLOT_SLACK || y >= y1 + PLOT_SLACK) return null;
  const c = Math.max(0, Math.min(w - 1, FIELD.right - Math.floor(x / TILE)));
  const r = Math.max(0, Math.min(h - 1, Math.floor((y - y0) / TILE)));
  return { c, r };
}

/** Is (x, y) anywhere in the farm's pen: the field, the paths between its plots, or its fence ring (the owner: "clicking
 * anywhere within the farming pen should open up a whole pop-up")? For a field `w` x `h`. */
export function inPen(x, y, w, h) { // (half a tile of slack all round: the terrain's fence is drawn on the tiles' corners)
  const half = TILE / 2;
  return x >= (fieldLeft(w) - 1) * TILE - half && x < (FIELD.right + 2) * TILE + half && y >= (FIELD.y - 1) * TILE - half && y < (FIELD.y + h + 1) * TILE + half;
}

/** What a tap on the farm means: {kind: "plot", c, r} (a spot of the field, or the nearest one to a near miss),
 * "fence", "barn", "seeds", "gate" or "ground". */
export function tapFarm(x, y, w, h) {
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  const spot = plotAt(x, y, w, h);
  if (spot) return { kind: "plot", ...spot };
  if (Math.abs(x - FARM_GATE.x) < 18 && y > FARM_GATE.y - 30 && y < FARM_GATE.y + 6) return { kind: "gate" };
  if (Math.abs(x - SEED_STAND.x) < 16 && y > SEED_STAND.y - 30 && y < SEED_STAND.y + 4) return { kind: "seeds" };
  if (tx >= BARN.x0 && tx < BARN.x0 + BARN.w && ty >= BARN.y0 && ty < BARN.y0 + BARN.h) return { kind: "barn" };
  const x0 = fieldLeft(w) - 1, y0 = FIELD.y - 1, x1 = FIELD.right + 1, y1 = FIELD.y + h;
  if (tx >= x0 && tx <= x1 && ty >= y0 && ty <= y1) return { kind: "fence" };
  return { kind: "ground" };
}

// ---------- the farm's upgrades (slice 5): where each stands once built ----------
export const UPGRADE_AT = { // (their pictures' sizes too: nothing may stand on them)
  windmill: { x: 40, y: 128, w: 48, h: 64 }, compost: { x: 88, y: 128, w: 32, h: 32 }, scarecrow: { x: 88, y: 80, w: 32, h: 48 },
};
/** The sprinkler (earned): beside the gap in the fence, below the field. */
export const sprinklerAt = (w, h) => ({ x: gapCol(w) * TILE + 30, y: (FIELD.y + h + 1) * TILE + 6 });
export const UPGRADE_SPOTS = Object.values(UPGRADE_AT);

// ---------- the garden's buildings on the farm (slice 2) ----------
/** Where each of the six building slots stands until it is moved: east of the pen, two rows of three, each spot room
 * enough for a fully grown building (48 px). */
export const BUILD_SPOTS = [
  { x: 394, y: 5 * TILE }, { x: 442, y: 5 * TILE }, { x: 490, y: 5 * TILE },
  { x: 394, y: 8 * TILE }, { x: 442, y: 8 * TILE }, { x: 490, y: 8 * TILE },
];
/** How big a thing's picture is: a building (48 fully grown, else 32), a decoration, an upgrade: {w, h}. */
export const buildingSize = (tier) => (tier >= 3 ? { w: 48, h: 48 } : { w: 32, h: 32 });
/** The box a thing's picture covers, standing with its foot's middle at (x, y). */
export const boxOf = (x, y, w = 32, h = 32) => ({ x0: x - w / 2, x1: x + w / 2, y0: y - h, y1: y });
export const overlaps = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
/** What already stands on the farm and nothing may cover: the pen as big as it can grow (its fence too), the barn, the
 * seed stand, the gate and the fence line along the edge with the yard. */
export const FIXED = [
  { id: "pen", x0: (fieldLeft(12) - 1) * TILE - 8, x1: (FIELD.right + 2) * TILE + 8, y0: 0, y1: (FIELD.y + 6 + 1) * TILE + 8 },
  { id: "barn", x0: BARN.x0 * TILE, x1: (BARN.x0 + BARN.w) * TILE + 4, y0: 0, y1: (BARN.y0 + BARN.h) * TILE + 8 },
  { id: "seeds", ...boxOf(SEED_STAND.x, SEED_STAND.y + 2, 34, 36) },
  { id: "gate", x0: FARM_GATE.x - 30, x1: FARM_W, y0: FARM_GATE.y - 26, y1: H },
  { id: "edge", x0: (FARM_COLS - 1) * TILE - 4, x1: FARM_W, y0: 0, y1: H },
];
/** Can a thing `w` x `h` stand with its foot's middle at (x, y)? Inside the farm, its picture clear of everything fixed
 * (FIXED) and of `others` ([{x, y, w, h}], 32 x 32 when not said). */
export function canPlace(x, y, others = [], w = 32, h = 32) {
  const b = boxOf(x, y, w, h);
  if (b.x0 < 2 || b.x1 > FARM_W - 2 || b.y0 < 0 || y > H - 14) return false;
  if (FIXED.some((f) => overlaps(b, f))) return false;
  return others.every((o) => !overlaps(b, boxOf(o.x, o.y, o.w || 32, o.h || 32)));
}
/** The nearest spot to `at` where a thing can stand (canPlace), searching outward; `at` itself when it can. For a save
 * whose building or decoration stood where the farm's layout has since put something else. */
export function nearestFree(at, others = [], w = 32, h = 32) {
  if (canPlace(at.x, at.y, others, w, h)) return { x: at.x, y: at.y };
  for (let d = 8; d <= FARM_W; d += 8) {
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const x = Math.round(at.x + Math.cos(a) * d), y = Math.round(at.y + Math.sin(a) * d * 0.6);
      if (canPlace(x, y, others, w, h)) return { x, y };
    }
  }
  return { x: at.x, y: at.y };
}
