// Battle arenas for the live (real-time) battles: the TERRAIN table, the PROPS that stand on it, the THEMES,
// and generateMap(), which makes a random, natural-looking, fair arena from a seed.
//
// Pure: no DOM and no Math.random. The same seed always gives the same map, so both players of a friend battle
// (and the tests) see the same arena. The agreed format is in the side-session note live-battles-plan.md
// ("Terrain"), summed up in HANDOFF.md.
//
// World units are pixels; a tile is 16x16. A creature's position is the point between its feet, and the tile
// under that point is the one whose effects it gets. Movement is free (not on the grid); only effects and
// blocking go by tile.

export const TILE = 16;
const ELEMENTS = ["ember", "tide", "grove", "spark", "stone", "dusk"]; // data.TYPE_IDS (kept here so this file stands alone)

// ---------- terrain ----------
// Every entry has every field (the Engine chat's format):
//   walk     can an ordinary creature stand here
//   cross    who may enter anyway when walk is false (element ids, or "floater" for the body plan)
//   shots    false = stops projectiles and beams
//   speed, atk, def   multipliers (1 = no change); grip 0..1 (1 = normal, low = keeps sliding)
//   heal, burn        share of max HP gained / lost per second
//   favours  {element: attack multiplier}; above 1 also means that element is never burned here
//   bonus    {element: {speed|def|heal|grip}}: that element's own value instead of the general one
//   status   the particle to show on a creature standing here (wet/burn/leaf/rock/dark/spark) or null
//   fixed    terrain moves must not repaint it
//   under    the terrain drawn beneath it (deep water sits on shallow water); null = the theme's base ground
//   anim     its _fill strip is 4 animation frames rather than 4 variants
//   joinLand its edges join to walkable land (a bridge joins the banks at its ends)
//   likes / hinders   elements it helps / hurts (worked out from the above, for icons)
const NO_EFFECT = "No effect.";
function terrain(id, name, text, o = {}) {
  const t = {
    id, name, text, walk: true, cross: [], shots: true, speed: 1, grip: 1, atk: 1, def: 1, heal: 0, burn: 0,
    favours: {}, bonus: {}, status: null, fixed: false, under: null, anim: false, joinLand: false, ...o,
    art: { edges: `battle/terrain/${id}.png`, fill: `battle/terrain/${id}_fill.png` },
  };
  t.likes = ELEMENTS.filter((e) => helps(t, e) > 0);
  t.hinders = ELEMENTS.filter((e) => helps(t, e) < 0);
  return t;
}

export const TERRAIN = Object.fromEntries([
  // plain grounds (each theme has one as its base)
  terrain("grass", "Grass", NO_EFFECT),
  terrain("dirt", "Dirt", NO_EFFECT),
  terrain("sand", "Sand", "A little slower.", { speed: 0.8 }),
  terrain("snow", "Snow", "Slower.", { speed: 0.75 }),
  terrain("ash", "Ash", NO_EFFECT),
  terrain("cave_floor", "Cave floor", NO_EFFECT),
  // plants
  terrain("tall_grass", "Tall grass", "Defence +20%, a little slower. Grove creatures move freely.",
    { def: 1.2, speed: 0.85, bonus: { grove: { speed: 1 } }, status: "leaf" }),
  terrain("flowers", "Flowers", "Grove creatures hit 20% harder and heal a little.",
    { favours: { grove: 1.2 }, bonus: { grove: { heal: 0.008 } }, status: "leaf" }),
  terrain("forest_floor", "Forest floor", "Defence +20%, slower. Grove creatures move freely and defend even better.",
    { def: 1.2, speed: 0.8, bonus: { grove: { speed: 1, def: 1.3 } }, status: "leaf" }),
  // water and ice
  terrain("mud", "Mud", "Much slower. Tide creatures wade through it more easily.",
    { speed: 0.55, bonus: { tide: { speed: 0.8 } }, status: "wet" }),
  terrain("shallows", "Shallow water", "Slower. Tide creatures are faster and hit harder; Ember creatures hit softer.",
    { speed: 0.7, favours: { tide: 1.15, ember: 0.85 }, bonus: { tide: { speed: 1.1 } }, status: "wet", anim: true }),
  terrain("deep_water", "Deep water", "Only Tide creatures and floaters can cross. Tide creatures are fastest and strongest here.",
    { walk: false, cross: ["tide", "floater"], favours: { tide: 1.2, ember: 0.85 }, bonus: { tide: { speed: 1.2 } },
      status: "wet", fixed: true, under: "shallows", anim: true }),
  terrain("ice", "Ice", "Slippery: you keep sliding. Tide creatures defend better.",
    { grip: 0.15, bonus: { tide: { def: 1.2 } } }),
  terrain("spring", "Spring", "Heals a little each second, Tide creatures more.",
    { heal: 0.02, bonus: { tide: { heal: 0.03 } }, status: "wet", anim: true }),
  // rock
  terrain("high", "High ground", "Attacks hit 20% harder; a little slower to climb. Stone creatures defend better.",
    { atk: 1.2, speed: 0.9, bonus: { stone: { def: 1.15 } }, status: "rock" }),
  terrain("cobbles", "Cobbles", "A little faster. Stone creatures hit harder and defend better.",
    { speed: 1.1, favours: { stone: 1.2 }, bonus: { stone: { def: 1.1 } }, status: "rock" }),
  terrain("crystals", "Crystals", "Spark creatures hit 25% harder and move faster; Dusk creatures hit softer.",
    { favours: { spark: 1.25, dusk: 0.9 }, bonus: { spark: { speed: 1.1 } }, status: "spark", anim: true }),
  // fire
  terrain("coals", "Hot coals", "Burns a little each second. Ember creatures don't burn and hit harder.",
    { burn: 0.015, favours: { ember: 1.2 }, status: "burn", anim: true }),
  terrain("lava", "Lava", "Only Ember creatures and floaters can cross. It burns hard, but not Ember creatures, who hit harder.",
    { walk: false, cross: ["ember", "floater"], burn: 0.06, favours: { ember: 1.25 }, status: "burn", fixed: true, anim: true }),
  // dark
  terrain("shadow", "Shadow", "Dusk creatures hit 20% harder and defend better; Spark creatures hit softer.",
    { favours: { dusk: 1.2, spark: 0.9 }, bonus: { dusk: { def: 1.1 } }, status: "dark" }),
  // built
  terrain("bridge", "Bridge", NO_EFFECT, { fixed: true, under: "deep_water", joinLand: true }),
  terrain("wall", "Wall", "Blocks movement and attacks.", { walk: false, shots: false, fixed: true }),
].map((t) => [t.id, t]));
export const TERRAIN_IDS = Object.keys(TERRAIN);

// ---------- props ----------
// Obstacles standing on a tile. Each blocks one row of tiles, `foot` wide, starting at its x (its left end);
// the picture stands on the bottom edge of that row, centred on it, and the top of a tall one overlaps the
// tiles behind (draw order by y). `size` is the picture in px (the art's own size wins if it differs).
const prop = (id, name, w, h, foot) => ({ id, name, size: [w, h], foot, walk: false, shots: false, art: `battle/terrain/prop_${id}.png` });
export const PROPS = Object.fromEntries([
  prop("boulder", "Boulder", 16, 16, 1),
  prop("rock_big", "Big rock", 32, 32, 2),
  prop("tree", "Tree", 48, 64, 2),
  prop("pine", "Pine", 32, 64, 2),
  prop("palm", "Palm tree", 48, 64, 2),
  prop("bush", "Bush", 16, 16, 1),
  prop("cactus", "Cactus", 16, 32, 1),
  prop("crystal", "Crystal pillar", 16, 32, 1),
  prop("stalagmite", "Stalagmite", 16, 32, 1),
  prop("pillar", "Pillar", 16, 32, 1),
  prop("obsidian", "Obsidian", 16, 16, 1),
  prop("mushroom", "Giant mushroom", 16, 32, 1),
].map((p) => [p.id, p]));
export const PROP_IDS = Object.keys(PROPS);

/** Every art file the arenas use (paths under web/game-art/), for data.artFiles(). */
export function terrainArtFiles() {
  return [...Object.values(TERRAIN).flatMap((t) => [t.art.edges, t.art.fill]), ...Object.values(PROPS).map((p) => p.art)];
}

// ---------- what a tile does to a creature ----------

function isFloater(c) { return !!c && (c.species === "floater" || c.plan === "floater"); }

function resolve(t, creature) {
  const e = { speed: t.speed, grip: t.grip, atk: t.atk, def: t.def, heal: t.heal, burn: t.burn };
  const el = creature && creature.type;
  const fav = (el && t.favours[el]) || 1;
  e.atk *= fav;
  if (fav > 1) e.burn = 0;
  if (el && t.bonus[el]) Object.assign(e, t.bonus[el]);
  if (isFloater(creature)) { e.speed = Math.max(e.speed, 1); e.grip = 1; } // hovering: the ground doesn't hold it back
  return e;
}
/** +1 if a terrain is better for this element than for others, -1 if worse, 0 if the same. */
function helps(t, el) {
  const a = resolve(t, { type: el });
  const b = resolve(t, {});
  const s = Math.log(a.speed / b.speed) + Math.log(a.atk / b.atk) + Math.log(a.def / b.def) + Math.log(a.grip / b.grip) * 0.2
    + (a.heal - b.heal) * 20 - (a.burn - b.burn) * 20;
  return Math.abs(s) < 1e-9 ? 0 : Math.sign(s);
}

/** What standing on this terrain does to this creature ({type, species} as describe() gives): {speed, grip, atk, def, heal, burn}. */
export function effectsFor(terrainId, creature) {
  const t = TERRAIN[terrainId];
  return t ? resolve(t, creature) : { speed: 1, grip: 1, atk: 1, def: 1, heal: 0, burn: 0 };
}

/** Whether this creature may be on this terrain (walls: nobody; deep water: tide and floaters; lava: ember and floaters). */
export function canEnter(terrainId, creature) {
  const t = TERRAIN[terrainId];
  if (!t) return false;
  if (t.walk) return true;
  return !!creature && (t.cross.includes(creature.type) || t.cross.includes(creature.species) || t.cross.includes(creature.plan));
}

// ---------- reading a map ----------

const inside = (map, tx, ty) => tx >= 0 && ty >= 0 && tx < map.cols && ty < map.rows;
/** The terrain id of a tile (tile coordinates), or null outside the map. */
export const tileAt = (map, tx, ty) => (inside(map, tx, ty) ? map.tiles[ty * map.cols + tx] : null);
/** The prop id blocking a tile, or null. */
export const propAt = (map, tx, ty) => (inside(map, tx, ty) ? map.propTiles[ty * map.cols + tx] : null);
/** The tile under a point in world px. */
export const tileOf = (x, y) => ({ tx: Math.floor(x / TILE), ty: Math.floor(y / TILE) });
/** The centre of a tile, in world px. */
export const tileCenter = (tx, ty) => ({ x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 });

/** The TERRAIN entry under a point in world px (null outside the map). */
export function terrainAt(map, x, y) {
  const { tx, ty } = tileOf(x, y);
  const id = tileAt(map, tx, ty);
  return id ? TERRAIN[id] : null;
}
/** The effects at a point for one creature (see effectsFor); outside the map: none. */
export function effectsAt(map, x, y, creature) {
  const t = terrainAt(map, x, y);
  return effectsFor(t ? t.id : null, creature);
}
/** Whether this creature can stand at a point (world px): on the map, no prop, a terrain it may enter. */
export function canStand(map, x, y, creature) {
  const { tx, ty } = tileOf(x, y);
  if (!inside(map, tx, ty) || propAt(map, tx, ty)) return false;
  return canEnter(tileAt(map, tx, ty), creature);
}
/** Whether a shot is stopped at a point (world px): walls and props; outside the map counts as stopped. */
export function blocksShot(map, x, y) {
  const { tx, ty } = tileOf(x, y);
  if (!inside(map, tx, ty)) return true;
  return !!propAt(map, tx, ty) || !TERRAIN[tileAt(map, tx, ty)].shots;
}
/** Whether a terrain move may repaint a tile (not water, lava, walls, bridges, nor under a prop). */
export function canRepaint(map, tx, ty) {
  const id = tileAt(map, tx, ty);
  if (!id || propAt(map, tx, ty)) return false;
  const t = TERRAIN[id];
  return t.walk && t.shots && !t.fixed;
}

// ---------- drawing a map ----------

const WATERY = new Set(["shallows", "deep_water", "spring", "lava"]);
/** Dry ground a bridge can end on. */
const dryLand = (id) => TERRAIN[id].walk && !WATERY.has(id);
/**
 * The layers of one tile, bottom to top: the base ground, what the terrain sits on, the terrain. `map.under` (per
 * tile, a list or null) gives what a patch was painted over (flowers on grass on sand, crystals on shadow, a bridge
 * on the shallow bank); otherwise the terrain's own `under` (deep water on shallows, a bridge on deep water).
 */
function chainAt(map, tx, ty) {
  const id = tileAt(map, tx, ty);
  const own = map.under && map.under[ty * map.cols + tx];
  let chain;
  if (own && own.length) chain = [...own, id];
  else {
    chain = [id];
    for (let u = TERRAIN[id].under; u && u !== map.base; u = TERRAIN[u].under) chain.unshift(u);
  }
  if (chain[0] !== map.base) chain.unshift(map.base);
  return chain;
}
/** Which way a bridge tile runs: "h" (east-west) or "v", from the bridge tiles beside it, else the water. */
function bridgeAxis(map, tx, ty) {
  const is = (dx, dy, id) => tileAt(map, tx + dx, ty + dy) === id;
  if (is(1, 0, "bridge") || is(-1, 0, "bridge")) return "h";
  if (is(0, 1, "bridge") || is(0, -1, "bridge")) return "v";
  return is(1, 0, "deep_water") || is(-1, 0, "deep_water") ? "v" : "h";
}
const DIRS = [[0, -1, 1], [1, 0, 2], [0, 1, 4], [-1, 0, 8]];
/**
 * Which of a tile's four neighbours continue `layer` (default: the tile's own terrain): bits N 1, E 2, S 4, W 8.
 * A neighbour continues it when it is that terrain or drawn on top of it; outside the map counts too (no rim along
 * the edge); a bridge also joins the dry ground at its two ends.
 */
export function edgeIndex(map, tx, ty, layer = tileAt(map, tx, ty)) {
  const axis = TERRAIN[layer].joinLand ? bridgeAxis(map, tx, ty) : null;
  let bits = 0;
  for (const [dx, dy, bit] of DIRS) {
    const n = tileAt(map, tx + dx, ty + dy);
    if (n === null || n === layer || chainAt(map, tx + dx, ty + dy).includes(layer)) bits |= bit;
    else if (axis && (axis === "h" ? dx : dy) && dryLand(n)) bits |= bit;
  }
  return bits;
}
/** Which of the 4 fill tiles to use for a tile (a stable hash, so big areas don't repeat). */
export const fillIndex = (map, tx, ty, layer = "") => hashN(map.seedNum, tx, ty, strKey(layer)) & 3;

/**
 * What to draw for a tile, bottom to top: the theme's base ground, the terrain under this one (if any), then
 * this tile's terrain. variant 15 = draw `<id>_fill.png` tile `fill` (or the animation frame when `anim`);
 * any other variant = `<id>.png` tile `variant` (column variant % 4, row floor(variant / 4)).
 */
export function drawLayers(map, tx, ty) {
  const id = tileAt(map, tx, ty);
  if (!id) return [];
  return chainAt(map, tx, ty).map((t) => ({
    terrain: t, variant: t === map.base ? 15 : edgeIndex(map, tx, ty, t), fill: fillIndex(map, tx, ty, t),
  }));
}

// ---------- finding a way ----------

class Heap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(k, v) {
    const a = this.a; a.push([k, v]);
    for (let i = a.length - 1; i > 0;) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; }
  }
  pop() {
    const a = this.a; const top = a[0]; const last = a.pop();
    if (a.length) {
      a[0] = last;
      for (let i = 0; ;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m;
      }
    }
    return top;
  }
}

/** For one creature on one map: which tiles it can stand on, and seconds-ish to cross each (slow ground costs
 * more, burning ground a lot more). Worked out once per call, not per step. */
function costGrid(map, creature) {
  const n = map.cols * map.rows;
  const ok = new Uint8Array(n), cost = new Float64Array(n);
  const memo = {};
  for (let i = 0; i < n; i++) {
    const id = map.tiles[i];
    if (!(id in memo)) {
      const e = effectsFor(id, creature);
      memo[id] = [canEnter(id, creature) ? 1 : 0, 1 / Math.max(0.2, e.speed) + e.burn * 25];
    }
    ok[i] = map.propTiles[i] ? 0 : memo[id][0];
    cost[i] = memo[id][1];
  }
  return { ok, cost };
}

/** Cheapest time from tile `start` to every tile (8 directions, no cutting past a blocked corner). */
function timesFrom(map, start, grid) {
  const { cols, rows } = map;
  const { ok, cost } = grid;
  const dist = new Float64Array(cols * rows).fill(Infinity);
  const prev = new Int32Array(cols * rows).fill(-1);
  dist[start] = 0;
  const heap = new Heap(); heap.push(0, start);
  while (heap.size) {
    const [d, i] = heap.pop();
    if (d > dist[i]) continue;
    const x = i % cols, y = (i - x) / cols;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const j = ny * cols + nx;
      if (!ok[j]) continue;
      if (dx && dy && (!ok[y * cols + nx] || !ok[ny * cols + x])) continue;
      const nd = d + ((dx && dy ? Math.SQRT2 : 1) * (cost[i] + cost[j])) / 2;
      if (nd < dist[j]) { dist[j] = nd; prev[j] = i; heap.push(nd, j); }
    }
  }
  return { dist, prev };
}

/** Can a creature walk the straight line a -> b (world px), keeping ~5 px clear of blocked tiles and off worse ground? */
function clearLine(map, grid, a, b, maxCost) {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const steps = Math.max(1, Math.ceil(len / 4));
  for (let s = 0; s <= steps; s++) {
    const x = a.x + ((b.x - a.x) * s) / steps, y = a.y + ((b.y - a.y) * s) / steps;
    for (const [ox, oy] of [[0, 0], [5, 0], [-5, 0], [0, 5], [0, -5]]) {
      const { tx, ty } = tileOf(x + ox, y + oy);
      if (!inside(map, tx, ty)) return false;
      const i = ty * map.cols + tx;
      if (!grid.ok[i] || grid.cost[i] > maxCost + 1e-9) return false;
    }
  }
  return true;
}

/**
 * A way for a creature from one point to another (world px): a list of points to walk to in turn, ending at
 * `to` (or, when `to` can't be reached, at the reachable tile nearest it). [] = already there; null = it can't
 * move anywhere. Prefers fast, safe ground and goes straight where it can.
 */
export function findPath(map, from, to, creature) {
  const s = tileOf(from.x, from.y), g = tileOf(to.x, to.y);
  if (!inside(map, s.tx, s.ty)) return null;
  const start = s.ty * map.cols + s.tx;
  const grid = costGrid(map, creature);
  const { dist, prev } = timesFrom(map, start, grid);
  let goal = inside(map, g.tx, g.ty) ? g.ty * map.cols + g.tx : -1;
  const exact = goal >= 0 && dist[goal] < Infinity;
  if (!exact) {
    let best = Infinity; goal = -1;
    for (let i = 0; i < dist.length; i++) {
      if (dist[i] === Infinity) continue;
      const c = tileCenter(i % map.cols, Math.floor(i / map.cols));
      const d = Math.hypot(c.x - to.x, c.y - to.y);
      if (d < best - 1e-9 || (Math.abs(d - best) < 1e-9 && dist[i] < dist[goal])) { best = d; goal = i; }
    }
    if (goal < 0) return null;
  }
  const tiles = [];
  for (let i = goal; i !== -1; i = prev[i]) tiles.unshift(i);
  const pts = tiles.slice(1).map((i) => tileCenter(i % map.cols, Math.floor(i / map.cols)));
  if (exact && (to.x !== from.x || to.y !== from.y)) { if (pts.length) pts[pts.length - 1] = { x: to.x, y: to.y }; else pts.push({ x: to.x, y: to.y }); }
  if (!exact && !pts.length) return [];
  // go straight past the corners it doesn't need (never onto worse ground than the tile path uses)
  const out = [];
  let at = { x: from.x, y: from.y }, k = 0;
  while (k < pts.length) {
    let far = k, maxCost = Math.max(grid.cost[tiles[k]], grid.cost[tiles[k + 1]]);
    for (let j = k + 1; j < pts.length; j++) {
      maxCost = Math.max(maxCost, grid.cost[tiles[j + 1]]);
      if (!clearLine(map, grid, at, pts[j], maxCost)) break;
      far = j;
    }
    out.push(pts[far]); at = pts[far]; k = far + 1;
  }
  return out;
}

// ---------- seeded randomness ----------

function mix32(h) {
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15; h = Math.imul(h, 0x846ca68b); h ^= h >>> 16;
  return h >>> 0;
}
function hashN(...ns) {
  let h = 0x2545f491;
  for (const n of ns) h = mix32((h ^ Math.imul(n | 0, 0x9e3779b1)) + 0x6d2b79f5);
  return h;
}
const hash01 = (...ns) => hashN(...ns) / 4294967296;
function strKey(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
const seedNumber = (seed) => (Number.isInteger(seed) ? seed >>> 0 : strKey(String(seed)));
function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function valueNoise(s, x, y) {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash01(s, x0, y0), b = hash01(s, x0 + 1, y0), c = hash01(s, x0, y0 + 1), d = hash01(s, x0 + 1, y0 + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(s, x, y, scale, octaves = 2) {
  let sum = 0, amp = 1, norm = 0, f = 1 / scale;
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise(s + o * 1013, x * f + o * 17.31, y * f + o * 9.17);
    norm += amp; amp *= 0.5; f *= 2;
  }
  return sum / norm;
}

// ---------- making a map ----------
//
// Fairness: the arena is symmetric (turned 180 degrees, or mirrored left to right) within ZONE tiles of each start,
// and only loosely symmetric in the middle, where every random field is a blend of itself and its mirror image.
// So each side starts on the same ground, and the middle still looks natural. A map whose halves differ too much
// (terrain counts, or who can get to more of the arena first) is drawn again from the same seed; the last try is
// fully symmetric, which is always fair.

const ZONE = 6;       // tiles around each start that are exactly symmetric
const FADE = 4;       // then the symmetry loosens over this many tiles...
const LOOSE = 0.45;   // ...down to this much of it in the middle
const KEEP = 2.5;     // nothing in the way or hurting within this many tiles of a start
const ATTEMPTS = 6;

function makeCtx(seedNum, themeId, cols, rows, attempt) {
  const theme = THEMES[themeId];
  const salt = hashN(seedNum, attempt, strKey(themeId));
  const rand = mulberry(hashN(salt, 1));
  const r = {
    f: rand,
    range: (a, b) => a + (b - a) * rand(),
    int: (a, b) => a + Math.floor(rand() * (b - a + 1)),
    chance: (p) => rand() < p,
    pick: (list) => list[Math.floor(rand() * list.length)],
  };
  const sym = theme.sym === "either" ? (r.chance(0.65) ? "rotate" : "mirror") : theme.sym;
  const n = cols * rows;
  const R = sym === "rotate" ? (i) => n - 1 - i : (i) => i - (i % cols) + (cols - 1 - (i % cols));
  const ctx = {
    theme, themeId, cols, rows, n, seedNum, salt, attempt, r, sym, R, base: theme.base, k: 100,
    tiles: Array(n).fill(theme.base), propTiles: Array(n).fill(null), props: [], under: Array(n).fill(null),
    w: new Float64Array(n), keep: new Uint8Array(n), memo: {},
  };
  const [lo, hi] = theme.startRows ? theme.startRows(ctx) : [Math.round(rows * 0.28), Math.round(rows * 0.67)];
  const sx = Math.max(1, Math.round(cols * 0.1));
  const a = r.int(lo, hi) * cols + sx;
  ctx.starts = [a, R(a)];
  const strict = attempt >= ATTEMPTS - 1;
  for (let i = 0; i < n; i++) {
    const d = Math.min(...ctx.starts.map((s) => dist(ctx, i, s)));
    ctx.w[i] = strict || d <= ZONE ? 1 : d >= ZONE + FADE ? LOOSE : 1 - ((1 - LOOSE) * (d - ZONE)) / FADE;
    if (d <= KEEP) ctx.keep[i] = 1;
  }
  return ctx;
}

const X = (ctx, i) => i % ctx.cols;
const Y = (ctx, i) => Math.floor(i / ctx.cols);
const at = (ctx, x, y) => (x >= 0 && y >= 0 && x < ctx.cols && y < ctx.rows ? y * ctx.cols + x : -1);
const dist = (ctx, i, j) => Math.hypot(X(ctx, i) - X(ctx, j), Y(ctx, i) - Y(ctx, j));
const canon = (ctx, i) => Math.min(i, ctx.R(i));
/** A random number for a tile that is the same for the tile and its mirror image. */
const symRand = (ctx, key, i) => hash01(ctx.salt, key, canon(ctx, i));
/** A random number for a tile: mirrored near the starts, free in the middle. */
const tileRand = (ctx, key, i) => (ctx.w[i] >= 1 ? symRand(ctx, key, i) : hash01(ctx.salt, key, i, 7));
const N4 = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const N8 = [[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1]];
const around = (ctx, i, dirs = N8) => dirs.map(([dx, dy]) => at(ctx, X(ctx, i) + dx, Y(ctx, i) + dy)).filter((j) => j >= 0);
const harmful = (id) => !TERRAIN[id].walk || TERRAIN[id].burn > 0;

/**
 * A smooth random field over the map (mean 0, spread 1), blended with its own mirror image (fully near the
 * starts, partly in the middle). `extra(x, y)` is added before blending (a slope, a distance).
 */
function field(ctx, scale, { octaves = 2, extra = null } = {}) {
  const s = hashN(ctx.salt, ctx.k++);
  const raw = new Float64Array(ctx.n);
  for (let i = 0; i < ctx.n; i++) raw[i] = fbm(s, X(ctx, i), Y(ctx, i), scale, octaves);
  const mean = raw.reduce((a, b) => a + b, 0) / ctx.n;
  const sd = Math.sqrt(raw.reduce((a, b) => a + (b - mean) ** 2, 0) / ctx.n) || 1;
  for (let i = 0; i < ctx.n; i++) raw[i] = (raw[i] - mean) / sd + (extra ? extra(X(ctx, i), Y(ctx, i)) : 0);
  const out = new Float64Array(ctx.n);
  for (let i = 0; i < ctx.n; i++) {
    const w = ctx.w[i];
    const sym = (raw[i] + raw[ctx.R(i)]) / Math.SQRT2;
    out[i] = w >= 1 ? sym : w * sym + (1 - w) * raw[i];
  }
  return out;
}

/**
 * Paint one tile. A ground painted over another ground (not the base) keeps it beneath for drawing, so flowers
 * on the oasis grass show grass round them, not the desert's sand. Terrains with their own layer beneath (deep
 * water, bridges) and the base itself don't.
 */
function setTile(ctx, i, id) {
  const prev = ctx.tiles[i];
  if (prev === id) return;
  const t = TERRAIN[prev];
  const keepsBeneath = id !== ctx.base && !TERRAIN[id].under && prev !== ctx.base && t.walk && !t.fixed && !WATERY.has(prev);
  ctx.under[i] = keepsBeneath ? [...(ctx.under[i] || []), prev].slice(-2) : null;
  ctx.tiles[i] = id;
}

/** Paint `id` over about `cover` of the whole map, on the tiles of `on`, where the field is highest. */
function patch(ctx, id, cover, scale, { on = [ctx.base], f = null, octaves = 2 } = {}) {
  if (cover <= 0) return null;
  f = f || field(ctx, scale, { octaves });
  const bad = harmful(id);
  const cand = [];
  for (let i = 0; i < ctx.n; i++) if (on.includes(ctx.tiles[i]) && !(bad && ctx.keep[i])) cand.push(i);
  if (!cand.length) return f;
  const vals = cand.map((i) => f[i]).sort((a, b) => b - a);
  const thr = vals[Math.min(vals.length, Math.max(1, Math.round(cover * ctx.n))) - 1];
  const was = new Map();
  for (const i of cand) if (f[i] >= thr) { was.set(i, [ctx.tiles[i], ctx.under[i]]); setTile(ctx, i, id); }
  // most lone stray tiles go back (a few stay, as single tufts and stones)
  const key = ctx.k++;
  const lone = [...was.keys()].filter((i) => !around(ctx, i, N4).some((j) => ctx.tiles[j] === id));
  for (const i of lone) if (tileRand(ctx, key, i) < 0.75) [ctx.tiles[i], ctx.under[i]] = was.get(i);
  return f;
}

/** Keep the `share` of tiles in `list` where a smooth field is highest: a partial rim in clumps, not speckles. */
function clumped(ctx, list, share) {
  if (share >= 1 || !list.length) return list;
  const f = field(ctx, 2.5);
  const vals = list.map((i) => f[i]).sort((a, b) => b - a);
  const k = Math.round(share * list.length);
  if (!k) return [];
  const thr = vals[k - 1];
  return list.filter((i) => f[i] >= thr);
}

/** Paint `id` on the tiles next to (8 ways) any of `of`, on tiles of `on` (default: anything walkable and not fixed). */
function ring(ctx, of, id, { on = null, chance = 1 } = {}) {
  const bad = harmful(id);
  const add = [];
  for (let i = 0; i < ctx.n; i++) {
    const t = ctx.tiles[i];
    if (of.includes(t) || t === id || (bad && ctx.keep[i])) continue;
    if (on ? !on.includes(t) : !TERRAIN[t].walk || TERRAIN[t].fixed) continue;
    if (around(ctx, i).some((j) => of.includes(ctx.tiles[j]))) add.push(i);
  }
  for (const i of clumped(ctx, add, chance)) setTile(ctx, i, id);
}

/** Lone tiles of `id` (no same neighbour, 4 ways) become `to`. */
function despeckle(ctx, id, to) {
  const lone = [];
  for (let i = 0; i < ctx.n; i++) if (ctx.tiles[i] === id && !around(ctx, i, N4).some((j) => ctx.tiles[j] === id)) lone.push(i);
  for (const i of lone) setTile(ctx, i, to);
}

/** Ponds and lakes: a core (deep water, lava) with a rim (shallow water, coals). */
function lake(ctx, cover, scale, { core = "deep_water", rim = "shallows", on = null, rimChance = 1, f = null } = {}) {
  patch(ctx, core, cover, scale, { on: on || [ctx.base], f });
  despeckle(ctx, core, rim || ctx.base);
  if (rim) ring(ctx, [core], rim, { chance: rimChance });
}

/** A river from the top edge to the bottom edge through the middle (only on a map turned 180 degrees). */
function river(ctx, { core, bank = null, width = 1, bankChance = 1, crossing = null, crossings = 0 }) {
  if (ctx.sym !== "rotate") return false;
  const { cols: W, rows: H, R, r } = ctx;
  const s = hashN(ctx.salt, ctx.k++);
  const n1 = (y) => fbm(s, y, 0.5, 5, 2);
  const amp = Math.min(W * 0.17, 5) * 2;
  const g = (y) => (n1(y) - n1(H - 1 - y)) * amp;
  const coreSet = new Set();
  const add = (i) => { if (i >= 0) { coreSet.add(i); coreSet.add(R(i)); } };
  const cx = (W - 1) / 2;
  for (let y = 0; y < H / 2; y++) {
    const x0 = Math.round(cx + g(y) - (width - 1) / 2);
    for (let x = x0; x < x0 + width; x++) add(at(ctx, Math.max(0, Math.min(W - 1, x)), y));
  }
  const rowCols = (y) => [...coreSet].filter((i) => Y(ctx, i) === y).map((i) => X(ctx, i));
  for (let y = 0; y < H - 1; y++) { // join each row to the next (no corner-only joins)
    const a = rowCols(y), b = rowCols(y + 1);
    if (a.some((x) => b.includes(x))) continue;
    const aMin = Math.min(...a), aMax = Math.max(...a), bMin = Math.min(...b), bMax = Math.max(...b);
    if (bMin > aMax) for (let x = aMax + 1; x <= bMin; x++) add(at(ctx, x, y));
    else for (let x = bMax; x < aMin; x++) add(at(ctx, x, y));
  }
  for (const i of coreSet) if (!ctx.keep[i]) setTile(ctx, i, core);
  if (bank) {
    const banks = [];
    for (let i = 0; i < ctx.n; i++) {
      if (coreSet.has(i) || TERRAIN[ctx.tiles[i]].fixed || (harmful(bank) && ctx.keep[i])) continue;
      if (around(ctx, i).some((j) => coreSet.has(j))) banks.push(i);
    }
    for (const i of clumped(ctx, banks, bankChance)) setTile(ctx, i, bank);
  }
  if (crossing) {
    const rows = [];
    for (let c = 0; c < crossings; c++) {
      const y = r.int(2, Math.max(2, Math.floor(H / 2) - 2));
      if (!rows.includes(y)) rows.push(y);
    }
    for (const y of rows) for (const x of rowCols(y)) { const i = at(ctx, x, y); setTile(ctx, i, crossing); setTile(ctx, R(i), crossing); }
  }
  return true;
}

/** A winding road from the start on the left to the middle, and its mirror image from the other start. */
function road(ctx, id, { on }) {
  const { cols: W, rows: H, R, r } = ctx;
  const a = ctx.starts[0];
  let x = X(ctx, a), y = Y(ctx, a);
  const tx = Math.floor((W - 1) / 2);
  const ty = ctx.sym === "rotate" ? Math.floor((H - 1) / 2) : Math.max(1, Math.min(H - 2, y + r.int(-3, 3)));
  const cells = [at(ctx, x, y)];
  for (let guard = 0; (x !== tx || y !== ty) && guard < 200; guard++) {
    const dx = tx - x, dy = ty - y;
    let mx = 0, my = 0;
    if (dx === 0) my = Math.sign(dy);
    else if (dy === 0) {
      const wig = r.f();
      if (wig < 0.16 && y > 1 && y < H - 2) my = wig < 0.08 ? 1 : -1; else mx = Math.sign(dx);
    } else if (r.f() < Math.abs(dy) / (Math.abs(dx) + Math.abs(dy))) my = Math.sign(dy);
    else mx = Math.sign(dx);
    x += mx; y += my;
    cells.push(at(ctx, x, y));
  }
  cells.push(at(ctx, W - 1 - tx, ty)); // meet the other half
  for (const i of cells) for (const j of [i, R(i)]) if (on.includes(ctx.tiles[j])) setTile(ctx, j, id);
}

/** A small spring: in the very middle, or a pair, one on each side. */
function spring(ctx) {
  const { cols: W, rows: H, R, r } = ctx;
  let spots;
  if (r.chance(0.5)) {
    const cx = Math.floor((W - 1) / 2), cy = Math.floor((H - 1) / 2);
    spots = [at(ctx, cx, cy), at(ctx, cx + 1, cy), at(ctx, cx, cy + 1), at(ctx, cx + 1, cy + 1)];
  } else {
    const i = at(ctx, r.int(Math.round(W * 0.25), Math.round(W * 0.38)), r.int(2, H - 3));
    spots = [i, ...(r.chance(0.6) ? [at(ctx, X(ctx, i) + r.pick([-1, 1]), Y(ctx, i))] : [])];
  }
  for (const i of spots.filter((k) => k >= 0)) for (const j of [i, R(i)]) {
    const t = TERRAIN[ctx.tiles[j]];
    if (t.walk && !t.fixed && !ctx.keep[j]) setTile(ctx, j, "spring");
  }
}

// ---- props ----

function footprint(ctx, id, anchor) {
  const x = X(ctx, anchor), y = Y(ctx, anchor);
  const cells = [];
  for (let k = 0; k < PROPS[id].foot; k++) cells.push(at(ctx, x + k, y));
  return cells;
}
function fits(ctx, id, anchor, on) {
  const cells = footprint(ctx, id, anchor);
  if (cells.some((i) => i < 0 || Y(ctx, i) !== Y(ctx, anchor))) return false;
  for (const i of cells) {
    const t = ctx.tiles[i];
    if (ctx.keep[i] || ctx.propTiles[i] || (on ? !on.includes(t) : !TERRAIN[t].walk || TERRAIN[t].fixed)) return false;
    if (around(ctx, i).some((j) => ctx.propTiles[j])) return false; // a gap of at least one tile between props
  }
  return true;
}
function put(ctx, id, anchor, flip) {
  for (const i of footprint(ctx, id, anchor)) ctx.propTiles[i] = id;
  ctx.props.push({ id, x: X(ctx, anchor), y: Y(ctx, anchor), w: PROPS[id].foot, flip });
}
const mirrorAnchor = (ctx, id, anchor) => ctx.R(anchor + PROPS[id].foot - 1);
/** Put a prop and its mirror image (both or neither). */
function putPair(ctx, id, anchor, flip, on = null) {
  const other = mirrorAnchor(ctx, id, anchor);
  if (other === anchor) { if (fits(ctx, id, anchor, on)) put(ctx, id, anchor, flip); return; }
  const a = footprint(ctx, id, anchor), b = footprint(ctx, id, other);
  if (a.some((i) => b.includes(i)) || !fits(ctx, id, anchor, on) || !fits(ctx, id, other, on)) return;
  put(ctx, id, anchor, flip);
  put(ctx, id, other, !flip);
}
function pickWeighted(list, u) {
  const total = list.reduce((s, [, w]) => s + w, 0);
  for (const [id, w] of list) { if ((u -= w / total) < 0) return id; }
  return list[list.length - 1][0];
}
/**
 * Scatter props: `list` = [[id, weight]], about `density` of the allowed tiles, in clumps (a field decides
 * where). Near the starts each prop has its mirror image; in the middle they fall freely.
 */
function scatter(ctx, list, density, { on, scale = 4, clump = 1.2, near = null } = {}) {
  symmetrize(ctx);
  const f = field(ctx, scale);
  const key = ctx.k++;
  for (let i = 0; i < ctx.n; i++) {
    if (near && !near(X(ctx, i), Y(ctx, i))) continue;
    const zone = ctx.w[i] >= 1;
    const u = zone ? hash01(ctx.salt, key, Math.min(i, ctx.R(i))) : hash01(ctx.salt, key, i, 3);
    const chance = density * Math.max(0, Math.min(3, 1 + clump * f[i]));
    if (u >= chance) continue;
    const pickU = zone ? hash01(ctx.salt, key + 1, Math.min(i, ctx.R(i))) : hash01(ctx.salt, key + 1, i);
    const id = pickWeighted(list, pickU);
    const flip = (zone ? symRand(ctx, key + 2, i) : hash01(ctx.salt, key + 2, i)) < 0.5;
    if (zone) {
      if (ctx.R(i) < i) continue; // decided with its mirror image, which came first
      putPair(ctx, id, i, flip, on);
    } else if (fits(ctx, id, i, on)) put(ctx, id, i, flip);
  }
}

// ---- keeping it playable ----

/**
 * Copy the ground round the left start onto the right start's (turned or mirrored), so the two are exactly alike.
 * (Rings and rims are decided by their neighbours, which can differ just outside the symmetric zone.)
 */
function symmetrize(ctx) {
  const a = ctx.starts[0];
  for (let i = 0; i < ctx.n; i++) {
    if (dist(ctx, i, a) > ZONE) continue;
    ctx.tiles[ctx.R(i)] = ctx.tiles[i];
    ctx.under[ctx.R(i)] = ctx.under[i] && [...ctx.under[i]];
  }
}

const walkerOk = (ctx, i) => TERRAIN[ctx.tiles[i]].walk && !ctx.propTiles[i];

/** Nothing harmful or in the way right around each start. */
function clearStarts(ctx) {
  for (let i = 0; i < ctx.n; i++) {
    if (!ctx.keep[i]) continue;
    if (harmful(ctx.tiles[i])) setTile(ctx, i, ctx.base);
    if (ctx.propTiles[i]) removeProp(ctx, i);
  }
}
function removeProp(ctx, i) {
  const k = ctx.props.findIndex((p) => footprint(ctx, p.id, at(ctx, p.x, p.y)).includes(i));
  if (k < 0) return;
  const p = ctx.props[k];
  for (const j of footprint(ctx, p.id, at(ctx, p.x, p.y))) ctx.propTiles[j] = null;
  ctx.props.splice(k, 1);
}
/** Open up a blocked tile: take away its prop, or turn its terrain into a way across (bridge, ford, gap). */
function carve(ctx, i) {
  if (ctx.propTiles[i]) { removeProp(ctx, i); return; }
  const id = ctx.tiles[i];
  if (TERRAIN[id].walk) return;
  setTile(ctx, i, (ctx.theme.carve && ctx.theme.carve[id]) || ctx.base);
}
/** The cheapest line of tiles from a to b for an ordinary walker, counting blocked tiles as very dear. */
function cheapestLine(ctx, a, b) {
  const distArr = new Float64Array(ctx.n).fill(Infinity);
  const prev = new Int32Array(ctx.n).fill(-1);
  distArr[a] = 0;
  const heap = new Heap(); heap.push(0, a);
  while (heap.size) {
    const [d, i] = heap.pop();
    if (d > distArr[i]) continue;
    if (i === b) break;
    for (const j of around(ctx, i, N4)) {
      const nd = d + (walkerOk(ctx, j) ? 1 : 40);
      if (nd < distArr[j]) { distArr[j] = nd; prev[j] = i; heap.push(nd, j); }
    }
  }
  const line = [];
  for (let i = b; i !== -1; i = prev[i]) line.unshift(i);
  return line;
}
/**
 * Bridges run on over the shallow bank to dry ground (for looks: shallow water is walkable anyway). Those tiles
 * become bridge, and `ctx.under` notes that they sit on shallow water.
 */
function extendBridges(ctx) {
  const t = ctx.tiles;
  const step = (i, dx, dy) => at(ctx, X(ctx, i) + dx, Y(ctx, i) + dy);
  for (const i of t.map((id, k) => (id === "bridge" ? k : -1)).filter((k) => k >= 0)) {
    const deep = (dx, dy) => t[step(i, dx, dy)] === "deep_water";
    const axis = deep(0, -1) || deep(0, 1) ? [[1, 0], [-1, 0]] : deep(1, 0) || deep(-1, 0) ? [[0, 1], [0, -1]] : [];
    for (const [dx, dy] of axis) {
      const run = [];
      let j = step(i, dx, dy);
      while (j >= 0 && t[j] === "shallows" && !ctx.propTiles[j] && run.length < 3) { run.push(j); j = step(j, dx, dy); }
      if (!run.length || j < 0 || ctx.propTiles[j] || !(dryLand(t[j]) || t[j] === "bridge")) continue;
      for (const k of run) { t[k] = "bridge"; ctx.under[k] = ["shallows"]; }
    }
  }
}

/** Make sure an ordinary walker can get from one start to the other (opening the same way on both sides). */
function connect(ctx) {
  const [a, b] = ctx.starts;
  for (let round = 0; round < 6; round++) {
    const blocked = cheapestLine(ctx, a, b).filter((i) => !walkerOk(ctx, i));
    if (!blocked.length) return;
    for (const i of blocked) { carve(ctx, i); carve(ctx, ctx.R(i)); }
  }
}

/** Time for an ordinary walker to reach each tile from a start (4 ways), for sharing out the arena. */
function walkTimes(ctx, from) {
  const t = new Float64Array(ctx.n).fill(Infinity);
  t[from] = 0;
  const heap = new Heap(); heap.push(0, from);
  const cost = (i) => 1 / TERRAIN[ctx.tiles[i]].speed + TERRAIN[ctx.tiles[i]].burn * 25;
  while (heap.size) {
    const [d, i] = heap.pop();
    if (d > t[i]) continue;
    for (const j of around(ctx, i, N4)) {
      if (!walkerOk(ctx, j)) continue;
      const nd = d + (cost(i) + cost(j)) / 2;
      if (nd < t[j]) { t[j] = nd; heap.push(nd, j); }
    }
  }
  return t;
}

/** How even the two sides are: per-terrain counts on each half, and how much of the arena each start reaches first. */
export function fairness(map) {
  const ctx = { cols: map.cols, rows: map.rows, n: map.cols * map.rows, tiles: map.tiles, propTiles: map.propTiles };
  const { cols } = map;
  const left = {}, right = {};
  const count = (side, k) => { side[k] = (side[k] || 0) + 1; };
  for (let i = 0; i < ctx.n; i++) {
    const x = i % cols;
    if (cols % 2 && x === (cols - 1) / 2) continue;
    const side = x < cols / 2 ? left : right;
    count(side, map.tiles[i]);
    if (map.propTiles[i]) count(side, "props");
  }
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].filter((k) => k !== map.base);
  const worst = keys.map((k) => {
    const l = left[k] || 0, r = right[k] || 0;
    return { k, l, r, over: Math.abs(l - r) - Math.max(6, 0.4 * Math.max(l, r)) };
  }).sort((p, q) => q.over - p.over)[0];
  const a = at(ctx, Math.floor(map.starts.me.x / TILE), Math.floor(map.starts.me.y / TILE));
  const b = at(ctx, Math.floor(map.starts.foe.x / TILE), Math.floor(map.starts.foe.y / TILE));
  const ta = walkTimes(ctx, a), tb = walkTimes(ctx, b);
  let mine = 0, theirs = 0;
  for (let i = 0; i < ctx.n; i++) {
    if (ta[i] === Infinity && tb[i] === Infinity) continue;
    if (ta[i] < tb[i] - 1e-9) mine++; else if (tb[i] < ta[i] - 1e-9) theirs++;
  }
  const share = Math.min(mine, theirs) / Math.max(1, Math.max(mine, theirs));
  return { ok: (!worst || worst.over <= 0) && share >= 0.85, worst: worst || null, share, mine, theirs };
}

// ---------- themes ----------
// Each theme: its base ground, a light hint for the screen (day / night / dim / warm), how it is symmetric
// ("rotate" = turned 180 degrees, "mirror" = left-right, "either" = picked by the seed), what replaces blocked
// terrain when a way across must be opened (`carve`), the terrains and props it can use (`uses`, `props`; the
// tests check the maps keep to them), and `build`, which paints a map.

export const THEMES = {
  meadow: {
    name: "Meadow", base: "grass", light: "day", sym: "either", carve: { deep_water: "bridge" },
    uses: ["grass", "tall_grass", "flowers", "dirt", "high", "mud", "shallows", "deep_water", "bridge", "spring"],
    props: ["tree", "bush", "boulder", "rock_big"],
    build(ctx, r) {
      const water = ctx.sym === "rotate" && r.chance(0.5) ? "river" : r.chance(0.75) ? "lake" : "none";
      patch(ctx, "high", r.range(0, 0.07), 5);
      patch(ctx, "tall_grass", r.range(0.12, 0.2), 4);
      patch(ctx, "flowers", r.range(0.04, 0.08), 2.5, { on: ["grass", "tall_grass"] });
      if (water === "river") river(ctx, { core: "deep_water", bank: "shallows", width: r.int(1, 2), crossing: "bridge", crossings: r.int(1, 2) });
      if (water === "lake") lake(ctx, r.range(0.03, 0.06), 5, { on: ["grass", "tall_grass", "flowers"] });
      patch(ctx, "mud", r.range(0, 0.04), 3, { on: ["grass"] });
      if (r.chance(0.6)) road(ctx, "dirt", { on: ["grass", "tall_grass", "flowers", "mud"] });
      if (r.chance(0.4)) spring(ctx);
      scatter(ctx, [["tree", 3], ["bush", 2], ["boulder", 1.5], ["rock_big", 1]], r.range(0.03, 0.06), { on: ["grass", "tall_grass"] });
    },
  },
  forest: {
    name: "Forest", base: "grass", light: "day", sym: "either", carve: { deep_water: "bridge" },
    uses: ["grass", "forest_floor", "tall_grass", "flowers", "mud", "dirt", "shallows", "deep_water", "bridge", "spring"],
    props: ["tree", "pine", "bush", "mushroom"],
    build(ctx, r) {
      patch(ctx, "forest_floor", r.range(0.25, 0.4), 5);
      patch(ctx, "tall_grass", r.range(0.08, 0.14), 3.5);
      patch(ctx, "flowers", r.range(0.02, 0.05), 2.5, { on: ["grass", "forest_floor"] });
      patch(ctx, "mud", r.range(0.03, 0.06), 3, { on: ["grass", "forest_floor"] });
      if (ctx.sym === "rotate" && r.chance(0.75)) {
        if (r.chance(0.6)) river(ctx, { core: "shallows", bank: "mud", bankChance: 0.3, width: r.int(1, 2) });
        else river(ctx, { core: "deep_water", bank: "shallows", width: 1, crossing: "bridge", crossings: 2 });
      } else if (r.chance(0.5)) lake(ctx, r.range(0.02, 0.04), 4, { on: ["grass", "forest_floor", "tall_grass"] });
      if (r.chance(0.6)) road(ctx, "dirt", { on: ["grass", "forest_floor", "tall_grass", "flowers", "mud"] });
      if (r.chance(0.35)) spring(ctx);
      scatter(ctx, [["tree", 3], ["pine", 3], ["bush", 1.5], ["mushroom", 0.8]], r.range(0.09, 0.14),
        { on: ["grass", "forest_floor", "tall_grass"], scale: 5, clump: 1.6 });
    },
  },
  shore: {
    name: "Shore", base: "sand", light: "day", sym: "mirror", carve: { deep_water: "shallows" },
    uses: ["sand", "grass", "tall_grass", "shallows", "deep_water", "high", "mud"],
    props: ["palm", "boulder", "rock_big"],
    startRows(ctx) {
      ctx.seaLow = ctx.r.chance(0.5); // the sea along the bottom (or the top)
      const H = ctx.rows;
      return ctx.seaLow ? [Math.round(H * 0.17), Math.round(H * 0.45)] : [Math.round(H * 0.5), Math.round(H * 0.78)];
    },
    build(ctx, r) {
      const H = ctx.rows;
      const toSea = (x, y) => ((ctx.seaLow ? y : H - 1 - y) / H - 0.5) * 5;
      const sea = field(ctx, 4, { extra: toSea });
      patch(ctx, "deep_water", r.range(0.16, 0.22), 0, { f: sea });
      despeckle(ctx, "deep_water", "shallows");
      ring(ctx, ["deep_water"], "shallows");
      ring(ctx, ["deep_water", "shallows"], "shallows", { chance: 0.45, on: ["sand"] });
      ring(ctx, ["shallows"], "mud", { chance: r.range(0, 0.3), on: ["sand"] });
      const land = field(ctx, 4, { extra: (x, y) => -toSea(x, y) });
      patch(ctx, "grass", r.range(0.12, 0.22), 0, { f: land });
      patch(ctx, "tall_grass", r.range(0.03, 0.07), 3, { on: ["grass"] });
      patch(ctx, "shallows", r.range(0.01, 0.03), 2, { on: ["sand"] }); // rock pools
      patch(ctx, "high", r.range(0.03, 0.06), 3.5, { on: ["sand", "grass"] });
      scatter(ctx, [["palm", 2.5], ["boulder", 1.5], ["rock_big", 1]], r.range(0.025, 0.045), { on: ["sand", "grass", "shallows", "high"] });
    },
  },
  desert: {
    name: "Desert", base: "sand", light: "day", sym: "either",
    uses: ["sand", "dirt", "high", "grass", "flowers", "shallows", "spring"],
    props: ["cactus", "palm", "boulder", "rock_big"],
    build(ctx, r) {
      patch(ctx, "dirt", r.range(0.08, 0.15), 4);
      patch(ctx, "high", r.range(0.06, 0.12), 6, { on: ["sand", "dirt"] });
      // the oasis in the middle: a spring in a pool, ringed with grass and flowers, palms around it
      const cx = (ctx.cols - 1) / 2, cy = (ctx.rows - 1) / 2;
      const d = (x, y) => Math.hypot(x - cx, (y - cy) * 1.2);
      const f = field(ctx, 2.5), bloom = field(ctx, 2);
      const pool = r.range(1.6, 2.6), green = r.range(3, 4.6);
      for (let i = 0; i < ctx.n; i++) {
        const di = d(X(ctx, i), Y(ctx, i));
        if (di <= 1.0) setTile(ctx, i, "spring");
        else if (di <= pool + f[i] * 0.35) setTile(ctx, i, "shallows");
        else if (di <= green + f[i] * 0.6) { setTile(ctx, i, "grass"); if (bloom[i] > 0.6) setTile(ctx, i, "flowers"); }
      }
      scatter(ctx, [["palm", 1]], 0.22, { on: ["grass", "sand", "flowers"], near: (x, y) => d(x, y) <= green + 1.8 });
      scatter(ctx, [["cactus", 3], ["boulder", 1.5], ["rock_big", 1]], r.range(0.02, 0.035), { on: ["sand", "dirt"] });
    },
  },
  volcanic: {
    name: "Volcano", base: "ash", light: "warm", sym: "either",
    uses: ["ash", "lava", "coals", "high", "dirt"],
    props: ["obsidian", "rock_big", "boulder"],
    build(ctx, r) {
      patch(ctx, "high", r.range(0.08, 0.14), 5);
      if (ctx.sym === "rotate" && r.chance(0.55)) {
        river(ctx, { core: "lava", bank: "coals", bankChance: 0.45, width: r.int(1, 2), crossing: "ash", crossings: 2 });
      } else lake(ctx, r.range(0.05, 0.09), 4, { core: "lava", rim: "coals", rimChance: 0.5, on: ["ash", "high"] });
      patch(ctx, "coals", r.range(0.03, 0.07), 2.5, { on: ["ash"] });
      if (r.chance(0.35)) road(ctx, "dirt", { on: ["ash"] });
      scatter(ctx, [["obsidian", 3], ["rock_big", 1.5], ["boulder", 1]], r.range(0.03, 0.05), { on: ["ash", "high", "dirt"] });
    },
  },
  cave: {
    name: "Crystal cave", base: "cave_floor", light: "dim", sym: "either", carve: { deep_water: "shallows" },
    uses: ["cave_floor", "crystals", "shadow", "shallows", "deep_water", "ice", "high"],
    props: ["crystal", "stalagmite", "boulder"],
    build(ctx, r) {
      patch(ctx, "shadow", r.range(0.1, 0.16), 4.5);
      patch(ctx, "crystals", r.range(0.08, 0.14), 3.5, { on: ["cave_floor", "shadow"] });
      if (r.chance(0.6)) lake(ctx, r.range(0.04, 0.08), 5, { on: ["cave_floor", "shadow"] });
      else patch(ctx, "shallows", r.range(0.02, 0.04), 3);
      if (r.chance(0.5)) patch(ctx, "ice", r.range(0.03, 0.06), 3);
      patch(ctx, "high", r.range(0.04, 0.08), 5);
      scatter(ctx, [["crystal", 1]], 0.12, { on: ["crystals"], scale: 3 });
      scatter(ctx, [["stalagmite", 3], ["boulder", 1]], r.range(0.03, 0.05), { on: ["cave_floor", "shadow", "high"] });
    },
  },
  ruins: {
    name: "Ruins", base: "grass", light: "day", sym: "either", carve: { wall: "cobbles" },
    uses: ["grass", "cobbles", "wall", "tall_grass", "shadow", "flowers", "dirt"],
    props: ["pillar", "bush", "boulder"],
    build(ctx, r) {
      const { cols: W, rows: H } = ctx;
      patch(ctx, "tall_grass", r.range(0.08, 0.14), 4);
      patch(ctx, "shadow", r.range(0.04, 0.08), 3.5, { on: ["grass", "tall_grass"] });
      patch(ctx, "dirt", r.range(0.03, 0.06), 3);
      // a paved square in the middle, with columns around it
      const cx = (W - 1) / 2, cy = (H - 1) / 2;
      const rp = r.range(2.2, 3.6);
      const f = field(ctx, 2.5);
      for (let i = 0; i < ctx.n; i++) if (Math.hypot(X(ctx, i) - cx, Y(ctx, i) - cy) <= rp + f[i] * 0.5) setTile(ctx, i, "cobbles");
      if (r.chance(0.7)) road(ctx, "cobbles", { on: ["grass", "tall_grass", "shadow", "dirt"] });
      // broken-down rooms, one side's and the other side's mirror image
      for (let k = r.int(1, 3); k > 0; k--) {
        const w = r.int(4, 7), h = r.int(3, 5);
        const x0 = r.int(Math.round(W * 0.15), Math.max(Math.round(W * 0.15), Math.floor(W / 2) - w - 1)), y0 = r.int(1, H - 1 - h);
        const doors = new Set();
        for (let d = r.int(1, 2); d > 0; d--) {
          const side = r.int(0, 3);
          const along = side % 2 ? r.int(1, h - 2) : r.int(1, w - 2);
          const dx = side === 0 || side === 2 ? x0 + along : side === 1 ? x0 + w - 1 : x0;
          const dy = side === 1 || side === 3 ? y0 + along : side === 0 ? y0 : y0 + h - 1;
          doors.add(at(ctx, dx, dy));
        }
        const paved = r.chance(0.6);
        for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
          const i = at(ctx, x, y);
          const edge = x === x0 || y === y0 || x === x0 + w - 1 || y === y0 + h - 1;
          for (const j of [i, ctx.R(i)]) {
            if (ctx.keep[j]) continue;
            if (edge && !doors.has(i)) { if (symRand(ctx, 11, i) < 0.8) setTile(ctx, j, "wall"); } else if (paved && !edge) setTile(ctx, j, "cobbles");
          }
        }
      }
      patch(ctx, "flowers", r.range(0.02, 0.05), 2.5, { on: ["grass"] });
      const pairs = r.int(2, 3), turn = r.range(0, Math.PI);
      for (let k = 0; k < pairs; k++) {
        const a = turn + (k * Math.PI) / pairs;
        const i = at(ctx, Math.round(cx + Math.cos(a) * (rp + 1.3)), Math.round(cy + Math.sin(a) * (rp + 1.3) * 0.8));
        if (i >= 0) putPair(ctx, "pillar", i, false);
      }
      scatter(ctx, [["bush", 2], ["boulder", 1], ["pillar", 1]], r.range(0.02, 0.035), { on: ["grass", "tall_grass", "dirt"] });
    },
  },
  night: {
    name: "Night", base: "grass", light: "night", sym: "rotate", carve: { deep_water: "bridge" },
    uses: ["grass", "shadow", "flowers", "tall_grass", "shallows", "deep_water", "bridge", "spring"],
    props: ["tree", "mushroom", "boulder"],
    build(ctx, r) {
      patch(ctx, "shadow", r.range(0.15, 0.25), 4.5);
      patch(ctx, "tall_grass", r.range(0.08, 0.14), 4);
      patch(ctx, "flowers", r.range(0.04, 0.08), 2.5, { on: ["grass", "shadow"] });
      if (r.chance(0.7)) river(ctx, { core: "deep_water", bank: "shallows", width: r.int(1, 2), crossing: "bridge", crossings: r.int(1, 2) });
      else lake(ctx, r.range(0.03, 0.06), 5, { on: ["grass", "shadow", "tall_grass", "flowers"] });
      if (r.chance(0.6)) spring(ctx);
      scatter(ctx, [["tree", 3], ["mushroom", 1.5], ["boulder", 1]], r.range(0.04, 0.07), { on: ["grass", "tall_grass", "shadow"] });
    },
  },
  snow: {
    name: "Snowfield", base: "snow", light: "day", sym: "either", carve: { deep_water: "shallows" },
    uses: ["snow", "ice", "deep_water", "shallows", "high"],
    props: ["pine", "boulder", "rock_big"],
    build(ctx, r) {
      const ice = field(ctx, 4.5);
      patch(ctx, "ice", r.range(0.1, 0.16), 0, { f: ice });
      patch(ctx, "deep_water", r.range(0.02, 0.035), 0, { on: ["ice"], f: ice }); // holes in the ice
      despeckle(ctx, "deep_water", "ice");
      ring(ctx, ["deep_water"], "shallows", { chance: 0.3, on: ["ice"] });
      if (r.chance(0.35)) river(ctx, { core: "deep_water", bank: "shallows", width: 1, crossing: "shallows", crossings: 2 });
      patch(ctx, "high", r.range(0.06, 0.12), 5);
      scatter(ctx, [["pine", 3], ["boulder", 1.5], ["rock_big", 1]], r.range(0.04, 0.07), { on: ["snow", "high"] });
    },
  },
};
for (const [id, t] of Object.entries(THEMES)) t.id = id;
export const THEME_IDS = Object.keys(THEMES);

/**
 * A random arena. Same seed (and options) = same map. `theme` is picked from the seed when not given.
 * Returns { seed, theme, cols, rows, width, height, base, light, symmetry, tiles, propTiles, under, props, starts }
 * (`under`: per tile, the grounds a patch was painted over, bottom to top, or null; drawLayers reads it).
 */
export function generateMap(seed, { theme = null, cols = 30, rows = 18 } = {}) {
  const seedNum = seedNumber(seed);
  const themeId = theme || THEME_IDS[hashN(seedNum, 0x7e3a) % THEME_IDS.length];
  if (!THEMES[themeId]) throw new Error("battlemap:unknown-theme:" + themeId);
  let map = null;
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const ctx = makeCtx(seedNum, themeId, cols, rows, attempt);
    ctx.theme.build(ctx, ctx.r);
    symmetrize(ctx);
    clearStarts(ctx);
    connect(ctx);
    extendBridges(ctx);
    const [a, b] = ctx.starts;
    const pt = (i) => tileCenter(X(ctx, i), Y(ctx, i));
    map = {
      seed, seedNum, theme: themeId, cols, rows, width: cols * TILE, height: rows * TILE, base: ctx.base,
      light: ctx.theme.light, symmetry: ctx.sym, attempt,
      tiles: ctx.tiles, propTiles: ctx.propTiles, under: ctx.under,
      props: ctx.props.sort((p, q) => p.y - q.y || p.x - q.x),
      starts: { me: pt(a), foe: pt(b) },
    };
    if (fairness(map).ok) break;
  }
  return map;
}
