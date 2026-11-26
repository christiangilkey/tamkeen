// The yard outside the creature's cottage (prototype "habitat_room"), seen from above like the live battles' arenas:
// the owner, 2026-11-25: "I want outside the house to look like the over head battles where they walk around a playing
// field" and "get rid of the whole neon outside cyberpunk aethetic, more fantasy". Pure: no screen code (habitat.js
// draws it with the battle terrain's own art and battlemap.drawCorners).
//
// The yard is one fixed 20 x 9 tile field (the habitat window's 320 x 144): the cottage at the top left (a thatched
// roof with a chimney over house walls, its door facing the path), a pond at the top right, trees along the top, a
// dirt path from the door that runs off to the east (where the village will be). The creature walks anywhere on the
// grass, round what stands in the way. Decorations, the garden's buildings, the aquarium, gifts and eggs keep their
// place along the field (their x, as before) and stand at a depth on it.

import { TILE } from "./battlemap.js";
import { HABITAT } from "./data.js";

const [W, H] = HABITAT.size;
export const YARD_COLS = W / TILE;   // 20
export const YARD_ROWS = H / TILE;   // 9

// One letter per tile. g grass, d dirt, c cobbles, f flowers, t tall grass, s shallows, w deep water, H house wall,
// o wooden floor (inside the cottage; its doorway in the front wall).
const LAYOUT = [
  "gtggggggggfggttgsssg",
  "gHHHHHHgggfggggswwsg",
  "gHooooHggffggggsswsg",
  "gHHoHHHgggggggggsssg",
  "gggdggggggggggggggfg",
  "tggddddddddddggggggg",
  "tfggggggggggdddddddd",
  "gggggggggggggggggggt",
  "fgggggggggggggggggtt",
];
const LETTERS = { g: "grass", d: "dirt", c: "cobbles", f: "flowers", t: "tall_grass", s: "shallows", w: "deep_water", H: "house_wall", o: "wood_floor" };

// What stands on the field (battlemap.PROPS ids): x, y = the left tile of its foot and its row.
const PROPS_HERE = [
  { id: "tree_fruit", x: 8, y: 1 }, { id: "tree_round", x: 11, y: 1, flip: true }, { id: "tree_poplar", x: 19, y: 2 },
  { id: "bush_flower", x: 7, y: 3 }, { id: "bush", x: 14, y: 4 }, { id: "stump", x: 0, y: 7 }, { id: "boulder_mossy", x: 19, y: 5 },
];
// Little things lying on the ground (battlemap.DECALS): v = which picture of its strip; x, y = world px of its top left.
const DECALS_HERE = [
  { id: "flowers", v: 1, x: 120, y: 92 }, { id: "flowers", v: 3, x: 214, y: 120 }, { id: "pebbles", v: 0, x: 92, y: 74 },
  { id: "tuft", v: 2, x: 34, y: 108 }, { id: "tuft", v: 0, x: 262, y: 84 }, { id: "pebbles", v: 2, x: 170, y: 104 },
  { id: "flowers", v: 5, x: 300, y: 112 },
];
/** The cottage: its footprint (walls included) under a thatched roof with a chimney, and its door in the front wall. */
export const COTTAGE = { x0: 1, y0: 1, w: 6, h: 3, door: { tx: 3, ty: 3 } };
/** Where the creature stands to go in at the door, and where it comes out to. */
export const YARD_DOOR_SPOT = { x: COTTAGE.door.tx * TILE + TILE / 2, y: (COTTAGE.door.ty + 1) * TILE + 6 };
/** Where its feet may be outside. */
export const YARD_WALK = { x0: 8, x1: W - 8, y0: 10, y1: H - 4 };
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
  for (const p of props) for (let k = 0; k < p.w; k++) if (p.x + k < YARD_COLS) propTiles[p.y * YARD_COLS + p.x + k] = p.id;
  made = {
    seed: "yard", seedNum: 20261125, theme: "village", cols: YARD_COLS, rows: YARD_ROWS, width: W, height: H, base: "grass",
    light: "day", tiles, propTiles, under: tiles.map(() => null), props: props.sort((a, b) => a.y - b.y || a.x - b.x),
    decals: DECALS_HERE, ornaments: [], hazards: [], secrets: [],
    roofs: [{ x0: COTTAGE.x0, y0: COTTAGE.y0, w: COTTAGE.w, h: COTTAGE.h, style: "thatch", extras: [{ id: "chimney", x: 4.5 }], alpha: 1 }],
  };
  return made;
}
const FOOT = { tree_fruit: 2, tree_round: 2, tree_poplar: 1, bush_flower: 1, bush: 1, stump: 1, boulder_mossy: 1 };
const footOf = (id) => FOOT[id] || 1;

const WALKABLE = new Set(["grass", "dirt", "cobbles", "flowers", "tall_grass", "shallows"]);
/** The grid squares (room.js cells over YARD_WALK) the creature can't walk on: the cottage, deep water, the props'
 * feet. `extra`: the squares of what else stands there (room.blockedCells with YARD_WALK). */
export function yardBlocked(cellKeyOf, extra = new Set()) {
  const out = new Set(extra);
  const m = yardMap();
  for (let y = YARD_WALK.y0; y <= YARD_WALK.y1; y += 2) {
    for (let x = YARD_WALK.x0; x <= YARD_WALK.x1; x += 2) {
      const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
      const id = m.tiles[ty * YARD_COLS + tx];
      const inHouse = tx >= COTTAGE.x0 && tx < COTTAGE.x0 + COTTAGE.w && ty >= COTTAGE.y0 && ty < COTTAGE.y0 + COTTAGE.h;
      if (inHouse || !WALKABLE.has(id) || m.propTiles[ty * YARD_COLS + tx]) out.add(cellKeyOf({ x, y }));
    }
  }
  return out;
}

// Where the things that used to stand on the side-on ground line stand on the field: their x as before, a depth each.
/** A garden plot's building: along the front of the field. */
export const plotSpot = (x) => ({ x, y: H - 6 });
/** An outdoor decoration (the k-th): in two rows across the middle, so neighbours don't hide each other. */
export const decorSpot = (x, k) => ({ x, y: k % 2 ? 112 : 94 });
/** A gift or an egg waiting: on the grass in front of the path. */
export const thingSpot = (x) => ({ x, y: 124 });
/** The aquarium. */
export const tankSpot = (x) => ({ x, y: H - 4 });

/** What a tap at (x, y) outside means: "door" (the cottage's door: in it goes) or "ground" (walk there). */
export function tapYard(x, y) {
  const d = COTTAGE.door;
  const x0 = d.tx * TILE - 6, x1 = (d.tx + 1) * TILE + 6;
  const roofBottom = (COTTAGE.y0 + COTTAGE.h) * TILE - 10;
  if (x >= x0 && x <= x1 && y >= roofBottom - 14 && y <= (d.ty + 1) * TILE + 8) return "door";
  return "ground";
}
