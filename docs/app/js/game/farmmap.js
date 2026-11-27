// The farm as a place (prototype "farm"): west of the cottage, through the gate at the yard's left edge. Pure: no
// screen code (habitat.js draws it as it draws the yard and the hall: the battle terrain's own tiles, from above).
//
// 32 tiles long (the camera follows the creature) and 9 high. The barn at the top left (its door opens the barn), the
// seed stand below it, the fenced field in the middle (farm.js: 3 x 3 at first, 12 x 6 at most, its fence redrawn as
// it grows, a gap in it at the bottom), a path along the bottom to the gate back to the yard at the right. The room to
// the field's right is kept for the buildings (the plan's slice 2).

import { TILE } from "./battlemap.js";
import { HABITAT } from "./data.js";

const [W, H] = HABITAT.size;
export const FARM_COLS = 36; // (32 until slice 5: the windmill and the compost bin stand at the far end)
export const FARM_W = FARM_COLS * TILE;
const ROWS = H / TILE; // 9
/** The field's top left tile (its first plant), and where the fence ring around it starts. */
export const FIELD = { x: 8, y: 1 };
/** The barn (walls under a roof), its door, and the seed stand (world px of its foot's middle). */
export const BARN = { x0: 1, y0: 0, w: 5, h: 3, door: { tx: 3, ty: 2 } };
export const SEED_STAND = { x: 5 * TILE + 8, y: 5 * TILE + 14 };
/** The gate back to the yard (its foot's middle), and where the creature comes in. */
export const FARM_GATE = { x: (FARM_COLS - 1) * TILE, y: 8 * TILE + 12 };
export const FARM_IN = { x: (FARM_COLS - 2) * TILE, y: 8 * TILE + 8 };
/** Where its feet may be. */
export const FARM_WALK = { x0: 8, x1: FARM_W - 8, y0: 10, y1: H - 4 };
/** The middle of field spot (c, r), world px. */
export const spotXY = (c, r) => ({ x: (FIELD.x + c) * TILE + TILE / 2, y: (FIELD.y + r) * TILE + TILE / 2 });
/** The gap in the fence (its column), at the bottom middle of a field `w` wide. */
export const gapCol = (w) => FIELD.x + Math.floor(w / 2);

const made = new Map();
/** The farm as a battle map for a field `w` x `h` (battlemap.drawCorners draws its ground). */
export function farmMap(w, h) {
  const key = `${w}x${h}`;
  if (made.has(key)) return made.get(key);
  const tiles = new Array(FARM_COLS * ROWS).fill("grass");
  const set = (x, y, t) => { if (x >= 0 && y >= 0 && x < FARM_COLS && y < ROWS) tiles[y * FARM_COLS + x] = t; };
  for (let x = 0; x < FARM_COLS; x++) set(x, ROWS - 1, "dirt"); // the path along the bottom
  for (let y = BARN.y0 + BARN.h; y < ROWS; y++) set(BARN.door.tx, y, "dirt"); // from the barn's door down to it
  // the fence ring round the field (a gap at the bottom middle), the field itself tilled
  const x0 = FIELD.x - 1, y0 = FIELD.y - 1, x1 = FIELD.x + w, y1 = FIELD.y + h;
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
    const ring = x === x0 || x === x1 || y === y0 || y === y1;
    set(x, y, ring ? "fence" : "dirt");
  }
  const gap = gapCol(w);
  set(gap, y1, "dirt");
  for (let y = y1 + 1; y < ROWS; y++) set(gap, y, "dirt");
  for (let x = BARN.x0; x < BARN.x0 + BARN.w; x++) for (let y = BARN.y0; y < BARN.y0 + BARN.h; y++) set(x, y, "house_wall");
  const props = [
    { id: "barrel", x: 0, y: 4, w: 1 },
    { id: "bush_flower", x: 27, y: 1, w: 1 }, { id: "bush_flower", x: 31, y: 1, w: 1 }, { id: "bush", x: 21, y: 1, w: 1 },
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

/** What a tap on the farm means: {kind: "plot", c, r} (a spot of the field), "fence", "barn", "seeds", "gate" or
 * "ground". */
export function tapFarm(x, y, w, h) {
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  if (tx >= FIELD.x && tx < FIELD.x + w && ty >= FIELD.y && ty < FIELD.y + h) return { kind: "plot", c: tx - FIELD.x, r: ty - FIELD.y };
  if (Math.abs(x - FARM_GATE.x) < 18 && y > FARM_GATE.y - 30 && y < FARM_GATE.y + 6) return { kind: "gate" };
  if (Math.abs(x - SEED_STAND.x) < 16 && y > SEED_STAND.y - 30 && y < SEED_STAND.y + 4) return { kind: "seeds" };
  if (tx >= BARN.x0 && tx < BARN.x0 + BARN.w && ty >= BARN.y0 && ty < BARN.y0 + BARN.h) return { kind: "barn" };
  const x0 = FIELD.x - 1, y0 = FIELD.y - 1, x1 = FIELD.x + w, y1 = FIELD.y + h;
  if (tx >= x0 && tx <= x1 && ty >= y0 && ty <= y1) return { kind: "fence" };
  return { kind: "ground" };
}

// ---------- the farm's upgrades (slice 5): where each stands once built ----------
export const UPGRADE_AT = {
  windmill: { x: 33 * TILE + 8, y: 4 * TILE + 4 }, compost: { x: 34 * TILE, y: 7 * TILE + 4 }, scarecrow: { x: 6 * TILE + 8, y: 7 * TILE + 12 },
};
/** The sprinkler (earned): beside the gap in the fence, below the field. */
export const sprinklerAt = (w, h) => ({ x: gapCol(w) * TILE + 30, y: (FIELD.y + h + 1) * TILE + 6 });
export const UPGRADE_SPOTS = Object.values(UPGRADE_AT);

// ---------- the garden's buildings on the farm (slice 2) ----------
/** Where each of the six building slots stands until it is moved: right of the field, two rows of three. */
export const BUILD_SPOTS = [
  { x: 22 * TILE, y: 4 * TILE }, { x: 25 * TILE + 8, y: 4 * TILE }, { x: 29 * TILE, y: 4 * TILE },
  { x: 22 * TILE, y: 7 * TILE + 8 }, { x: 25 * TILE + 8, y: 7 * TILE + 8 }, { x: 29 * TILE, y: 7 * TILE + 8 },
];
const FIELD_MAX_BOX = { x0: (FIELD.x - 1) * TILE - 8, y0: 0, x1: (FIELD.x + 12 + 1) * TILE + 8, y1: (FIELD.y + 6 + 1) * TILE + 6 };
/** Can a building stand with its foot's middle at (x, y)? On the farm, clear of the field (as big as it can grow), the
 * barn, the seed stand and the gate, and not on top of another building (`others`: [{x, y}]). */
export function canPlace(x, y, others = []) {
  if (!(x >= 18 && x <= FARM_W - 18 && y >= 40 && y <= H - 14)) return false;
  if (x > FIELD_MAX_BOX.x0 && x < FIELD_MAX_BOX.x1 && y > FIELD_MAX_BOX.y0 && y < FIELD_MAX_BOX.y1) return false;
  if (x < (BARN.x0 + BARN.w) * TILE + 12 && y < (BARN.y0 + BARN.h + 1) * TILE + 4) return false;
  if (Math.abs(x - SEED_STAND.x) < 30 && Math.abs(y - SEED_STAND.y) < 24) return false;
  if (Math.abs(x - FARM_GATE.x) < 30 && y > FARM_GATE.y - 26) return false;
  return others.every((o) => Math.hypot(o.x - x, (o.y - y) * 1.4) >= 30);
}
