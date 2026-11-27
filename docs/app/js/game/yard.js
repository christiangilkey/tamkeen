// The yard outside the creature's cottage (prototype "habitat_room"), seen from above like the live battles' arenas:
// the owner, 2026-11-25: "I want outside the house to look like the over head battles where they walk around a playing
// field" and "get rid of the whole neon outside cyberpunk aethetic, more fantasy". Pure: no screen code (habitat.js
// draws it with the battle terrain's own art and battlemap.drawCorners).
//
// The outside is one field 56 tiles long and 9 high, the habitat window (20 x 9 tiles, 320 x 144) a camera on it that
// follows the creature. Its first 20 columns are the yard: the cottage at the top left (a thatched roof with a chimney
// over house walls, its door facing the path), a pond, trees along the top, the garden's plots along the front. The
// path runs east into the village (the owner's plan, 2026-11-25): a market square with its stalls and a well, the
// tavern (the guild tavern), the championship hall (the gyms) and a pier out over the water (fishing). Tap a stall or a
// door: the creature walks there and it opens (STATIONS). The Muffles, the villagers, keep the stalls (muffles.js).
// Decorations, the garden's buildings, the aquarium, gifts and eggs keep their place along the yard (their x, as
// before) and stand at a depth on it.

import { TILE } from "./battlemap.js";
import { HABITAT } from "./data.js";

const [W, H] = HABITAT.size;
export const YARD_COLS = W / TILE;   // 20: the yard, one window wide
export const YARD_ROWS = H / TILE;   // 9
export const WORLD_COLS = 56;        // the yard and the village
export const WORLD_W = WORLD_COLS * TILE;

// One letter per tile. g grass, d dirt, c cobbles, f flowers, t tall grass, s shallows, w deep water, b bridge (the
// pier), H house wall, o wooden floor (inside; a doorway in a front wall), L the hall's stone wall, S stone floor.
const YARD = [
  "gtggggggggfggttgsssg",
  "gHHHHHHgggfggggswwsg",
  "gHooooHggffggggsswsg",
  "gHHoHHHgggggggggsssg",
  "gggdggggggggggggggfg",
  "dddddddddddddggggggg",
  "tfggggggggggdddddddd",
  "gggggggggggggggggggt",
  "fgggggggggggggggggtt",
];
// the village, columns 20-55
const VILLAGE = [
  "ggggggggggggggggggggLLLLLLLLggswwwww",
  "gggggggggggggHHHHHHgLSSSSSSLggswwwww",
  "ggccccccccccgHooooHgLSSSSSSLggswwwww",
  "ggccccccccccgHHoHHHgLLLSSLLLggswwwww",
  "ggccccccccccgggcgggggggccgggggswwwww",
  "ggccccccccccdddcdddddddccdddddswwwww",
  "ddccccccccccddddddddddddddddddbbbbbw",
  "ggccccccccccggggggggggggggggggswwwww",
  "ggggggggggggggggggggggggggggggswwwww",
];
const LAYOUT = YARD.map((row, i) => row + VILLAGE[i]);
const LETTERS = { g: "grass", d: "dirt", c: "cobbles", f: "flowers", t: "tall_grass", s: "shallows", w: "deep_water", b: "bridge",
  H: "house_wall", o: "wood_floor", L: "hall_wall", S: "stone_floor" };

// What stands on the field (battlemap.PROPS ids): x, y = the left tile of its foot and its row.
const PROPS_HERE = [
  { id: "tree_fruit", x: 8, y: 1 }, { id: "tree_round", x: 11, y: 1, flip: true }, { id: "tree_poplar", x: 19, y: 2 },
  { id: "bush_flower", x: 7, y: 3 }, { id: "bush", x: 14, y: 4 }, { id: "stump", x: 0, y: 7 }, { id: "boulder_mossy", x: 19, y: 5 },
  // the village: the market's stalls and its well, the tavern's sign, the hall's banners, lamps, a barrel, a crate, a tree
  { id: "tree_round", x: 21, y: 1 }, { id: "stall", x: 22, y: 3 }, { id: "stall_cloth", x: 25, y: 3 }, { id: "stall_bread", x: 28, y: 3 },
  { id: "well", x: 26, y: 5 }, { id: "bench", x: 22, y: 6 }, { id: "vendor_cart_flowers", x: 30, y: 7 }, { id: "lamp_post", x: 32, y: 7 },
  { id: "sign_tavern", x: 37, y: 4 }, { id: "barrel", x: 39, y: 2 }, { id: "banner", x: 40, y: 4 }, { id: "banner", x: 47, y: 4 },
  { id: "crate", x: 48, y: 7 }, { id: "lamp_post", x: 48, y: 4 },
];
// Little things lying on the ground (battlemap.DECALS): v = which picture of its strip; x, y = world px of its top left.
const DECALS_HERE = [
  { id: "flowers", v: 1, x: 120, y: 92 }, { id: "flowers", v: 3, x: 214, y: 120 }, { id: "pebbles", v: 0, x: 92, y: 74 },
  { id: "tuft", v: 2, x: 34, y: 108 }, { id: "tuft", v: 0, x: 262, y: 84 }, { id: "pebbles", v: 2, x: 170, y: 104 },
  { id: "flowers", v: 5, x: 300, y: 112 },
];
/** The cottage: its footprint (walls included) under a thatched roof with a chimney, and its door in the front wall. */
export const COTTAGE = { x0: 1, y0: 1, w: 6, h: 3, door: { tx: 3, ty: 3 } };
/** Every building on the field (walls included): the cottage, the tavern and the championship hall, with their roofs. */
const BUILDINGS = [
  { ...COTTAGE, style: "thatch", extras: [{ id: "chimney", x: 4.5 }] },
  { x0: 33, y0: 1, w: 6, h: 3, style: "shingle", extras: [{ id: "chimney", x: 1.5 }] },
  { x0: 40, y0: 0, w: 8, h: 4, style: "slate", extras: [{ id: "bell", x: 4 }] },
];
/** The places in the village the creature can be sent to, and what opens there: where it stands (x, y) and the part of
 * the picture a tap finds it by (rect). `opens`: a game sheet's page, or "tavern", "gyms", "pond". `job`: the Muffle
 * who keeps it. */
export const STATIONS = [
  { id: "fruit", opens: "garden", job: "grocer", x: 22 * TILE + 16, y: 4 * TILE + 10, rect: [22 * TILE, 1 * TILE, 24 * TILE, 4 * TILE + 4] },
  { id: "cloth", opens: "shop", job: "tailor", x: 25 * TILE + 16, y: 4 * TILE + 10, rect: [25 * TILE, 1 * TILE, 27 * TILE, 4 * TILE + 4] },
  { id: "bread", opens: "supplies", job: "baker", x: 28 * TILE + 16, y: 4 * TILE + 10, rect: [28 * TILE, 1 * TILE, 30 * TILE, 4 * TILE + 4] },
  { id: "flowers", opens: "mine", job: "florist", x: 31 * TILE, y: 6 * TILE + 8, rect: [30 * TILE, 6 * TILE - 4, 32 * TILE, 8 * TILE + 4] },
  { id: "tavern", opens: "tavern", job: "barkeep", x: 35 * TILE + 8, y: 4 * TILE + 8, rect: [33 * TILE, 0, 39 * TILE, 4 * TILE + 4] },
  { id: "hall", opens: "gyms", job: "herald", x: 44 * TILE, y: 4 * TILE + 8, rect: [40 * TILE, 0, 48 * TILE, 4 * TILE + 4] },
  { id: "pier", opens: "pond", job: "fisher", x: 53 * TILE + 8, y: 6 * TILE + 12, rect: [50 * TILE, 5 * TILE, 56 * TILE, 8 * TILE] },
];
/** A station by its id. */
export const stationById = (id) => STATIONS.find((s) => s.id === id) || null;
/** Where the creature stands to go in at the door, and where it comes out to. */
export const YARD_DOOR_SPOT = { x: COTTAGE.door.tx * TILE + TILE / 2, y: (COTTAGE.door.ty + 1) * TILE + 6 };
/** The Star Shrine (prototype "farm", farm-ui.js openShrine): by the cottage, once there is stardust; its foot's middle. */
export const SHRINE = { x: 9 * TILE + 8, y: 4 * TILE + 10 };
/** Where its feet may be outside. */
export const YARD_WALK = { x0: 8, x1: WORLD_W - 8, y0: 10, y1: H - 4 };
/** Where an egg sits outside. */
export const YARD_EGG = { x: W / 2, y: 104 };

let made = null;
/** The yard as a battle-map object (battlemap.js format: tiles, props, decals, roofs), so the arena's drawing works on it. */
export function yardMap() {
  if (made) return made;
  const tiles = [];
  for (const row of LAYOUT) for (const ch of row) tiles.push(LETTERS[ch] || "grass");
  const propTiles = tiles.map(() => null);
  const props = PROPS_HERE.map((p) => ({ ...p, w: footOf(p.id) }));
  for (const p of props) for (let k = 0; k < p.w; k++) if (p.x + k < WORLD_COLS) propTiles[p.y * WORLD_COLS + p.x + k] = p.id;
  made = {
    seed: "yard", seedNum: 20261125, theme: "village", cols: WORLD_COLS, rows: YARD_ROWS, width: WORLD_W, height: H, base: "grass",
    light: "day", tiles, propTiles, under: tiles.map(() => null), props: props.sort((a, b) => a.y - b.y || a.x - b.x),
    decals: DECALS_HERE, ornaments: [], hazards: [], secrets: [],
    roofs: BUILDINGS.map((b) => ({ x0: b.x0, y0: b.y0, w: b.w, h: b.h, style: b.style, extras: b.extras, alpha: 1 })),
  };
  return made;
}
const FOOT = { tree_fruit: 2, tree_round: 2, tree_poplar: 1, bush_flower: 1, bush: 1, stump: 1, boulder_mossy: 1,
  stall: 2, stall_cloth: 2, stall_bread: 2, well: 2, vendor_cart_flowers: 2, bench: 2 };
const footOf = (id) => FOOT[id] || 1;

const WALKABLE = new Set(["grass", "dirt", "cobbles", "flowers", "tall_grass", "shallows", "bridge"]);
/** The grid squares (room.js cells over YARD_WALK) the creature can't walk on: the cottage, deep water, the props'
 * feet. `extra`: the squares of what else stands there (room.blockedCells with YARD_WALK). */
export function yardBlocked(cellKeyOf, extra = new Set()) {
  const out = new Set(extra);
  const m = yardMap();
  for (let y = YARD_WALK.y0; y <= YARD_WALK.y1; y += 2) {
    for (let x = YARD_WALK.x0; x <= YARD_WALK.x1; x += 2) {
      const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
      const id = m.tiles[ty * WORLD_COLS + tx];
      const inHouse = BUILDINGS.some((b) => tx >= b.x0 && tx < b.x0 + b.w && ty >= b.y0 && ty < b.y0 + b.h);
      if (inHouse || !WALKABLE.has(id) || m.propTiles[ty * WORLD_COLS + tx]) out.add(cellKeyOf({ x, y }));
    }
  }
  return out;
}

// Where the things that used to stand on the side-on ground line stand on the field: their x as before, a depth each.
/** A garden plot's building: along the front of the field. */
export const plotSpot = (x) => ({ x, y: H - 6 });
/** An outdoor decoration (the k-th): in two rows across the middle, so neighbours don't hide each other. */
export const decorSpot = (x, k, spot = null) => (spot && Number.isFinite(spot.x) && Number.isFinite(spot.y)
  ? { x: Math.max(YARD_WALK.x0, Math.min(YARD_WALK.x1, spot.x)), y: Math.max(YARD_WALK.y0 + 30, Math.min(YARD_WALK.y1, spot.y)) } // (where the creature put it down)
  : { x, y: k % 2 ? 112 : 94 });
/** A gift or an egg waiting: on the grass in front of the path. */
export const thingSpot = (x) => ({ x, y: 124 });
/** The aquarium. */
export const tankSpot = (x) => ({ x, y: H - 4 });

/** The station a tap at (x, y) outside finds (a stall, a door, the pier), or null. */
export const stationAt = (x, y) => STATIONS.find((s) => x >= s.rect[0] && x <= s.rect[2] && y >= s.rect[1] && y <= s.rect[3]) || null;

/** Where the camera stands (its left edge) for the creature at x: it in the middle, kept on the field. */
export const cameraFor = (x) => Math.max(0, Math.min(WORLD_W - W, x - W / 2));

/** What a tap at (x, y) outside means: "door" (the cottage's door: in it goes) or "ground" (walk there). */
export function tapYard(x, y) {
  const d = COTTAGE.door;
  const x0 = d.tx * TILE - 6, x1 = (d.tx + 1) * TILE + 6;
  const roofBottom = (COTTAGE.y0 + COTTAGE.h) * TILE - 10;
  if (x >= x0 && x <= x1 && y >= roofBottom - 14 && y <= (d.ty + 1) * TILE + 8) return "door";
  return "ground";
}
