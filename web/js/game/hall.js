// Inside the championship hall (prototype "habitat_room"; the owner, 2026-11-26: "give the gym building an interior, a gym
// custodian at a counter who you walk up to and that where you register to fight the gym leaders"). Pure: no screen
// code (habitat.js draws it as it draws the yard: the battle terrain's own tiles and props, seen from above).
//
// One window wide (20 x 9 tiles). The back wall along the top, a carpet from the door (the middle of the front wall) up
// to the custodian's counter; banners, knights' statues, braziers, an armour stand and a weapon rack about the walls.
// The custodian (a Muffle: muffles.js FOLK, scene "hall") stands behind the counter. Tap the counter (or the
// custodian): the creature walks up to it, the custodian speaks, and the gym register opens (gyms-ui.js openGyms).
// Tap the door: back out to the village, in front of the hall.

import { TILE } from "./battlemap.js";
import { HABITAT } from "./data.js";

const [W, H] = HABITAT.size;
export const HALL_COLS = W / TILE; // 20
const ROWS = H / TILE;             // 9

// L the hall's stone wall, S stone floor, r carpet
const LAYOUT = [
  "LLLLLLLLLLLLLLLLLLLL",
  "LLLLLLLLLLLLLLLLLLLL",
  "LSSSSSSSSSSSSSSSSSSL",
  "LSSSSSSSSSSSSSSSSSSL",
  "LSSSSSSSSrrSSSSSSSSL",
  "LSSSSSSSSrrSSSSSSSSL",
  "LSSSSSSSSrrSSSSSSSSL",
  "LSSSSSSSSrrSSSSSSSSL",
  "LLLLLLLLLrrLLLLLLLLL",
];
const LETTERS = { L: "hall_wall", S: "stone_floor", r: "carpet" };
const FOOT = { counter: 3, shelf_books: 2, weapon_rack: 2 };
const footOf = (id) => FOOT[id] || 1;
// What stands in it (battlemap.PROPS ids): x, y = the left tile of its foot and its row.
const PROPS_HERE = [
  { id: "banner", x: 2, y: 2 }, { id: "banner", x: 17, y: 2 }, { id: "statue_knight", x: 5, y: 2 }, { id: "statue_knight", x: 14, y: 2 },
  { id: "shelf_books", x: 11, y: 2 }, { id: "counter", x: 8, y: 3 }, { id: "chest", x: 7, y: 3 },
  { id: "brazier", x: 3, y: 6 }, { id: "brazier", x: 16, y: 6 }, { id: "armor_stand", x: 5, y: 6 }, { id: "weapon_rack", x: 13, y: 6 },
];

/** Where the creature's feet may be inside. */
export const HALL_WALK = { x0: 24, x1: W - 24, y0: 66, y1: H - 6 };
/** Where it comes in (just inside the door) and where it stands to sign up (in front of the counter). */
export const HALL_DOOR_SPOT = { x: 10 * TILE, y: H - 8 };
export const COUNTER_SPOT = { x: 9 * TILE + 8, y: 5 * TILE - 4 };

let made = null;
/** The hall as a battle map (battlemap.drawCorners draws its ground, as yard.js yardMap). */
export function hallMap() {
  if (made) return made;
  const tiles = [];
  for (const row of LAYOUT) for (const ch of row) tiles.push(LETTERS[ch] || "stone_floor");
  const propTiles = tiles.map(() => null);
  const props = PROPS_HERE.map((p) => ({ ...p, w: footOf(p.id) }));
  for (const p of props) for (let k = 0; k < p.w; k++) propTiles[p.y * HALL_COLS + p.x + k] = p.id;
  made = {
    seed: "hall", seedNum: 20261126, theme: "village", cols: HALL_COLS, rows: ROWS, width: W, height: H, base: "stone_floor",
    light: "day", tiles, propTiles, under: tiles.map(() => null), props: props.sort((a, b) => a.y - b.y || a.x - b.x),
    decals: [], ornaments: [], hazards: [], secrets: [], roofs: [],
  };
  return made;
}

const WALKABLE = new Set(["stone_floor", "carpet"]);
/** The grid squares (room.js cells over HALL_WALK) the creature can't walk on: the walls and the props' feet. */
export function hallBlocked(cellKeyOf, extra = new Set()) {
  const out = new Set(extra);
  const m = hallMap();
  for (let y = HALL_WALK.y0; y <= HALL_WALK.y1; y += 2) {
    for (let x = HALL_WALK.x0; x <= HALL_WALK.x1; x += 2) {
      const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
      const id = m.tiles[ty * HALL_COLS + tx];
      if (!WALKABLE.has(id) || m.propTiles[ty * HALL_COLS + tx]) out.add(cellKeyOf({ x, y }));
    }
  }
  return out;
}

/** What a tap inside means: "door" (back out), "counter" (the custodian and the gym register) or "floor" (walk there). */
export function tapHall(x, y) {
  if (x >= 9 * TILE - 6 && x <= 11 * TILE + 6 && y >= 8 * TILE - 6) return "door";
  if (x >= 8 * TILE - 4 && x <= 11 * TILE + 4 && y >= TILE && y <= 4 * TILE + 4) return "counter";
  return "floor";
}
