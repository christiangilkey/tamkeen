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
//   spikes   share of max HP a creature standing here loses each time the spikes shoot up (every 2 s, livebattle.js)
//   opens    a weak wall the player can break open (clicking it from close by): the terrain it becomes
//   likes / hinders   elements it helps / hurts (worked out from the above, for icons)
const NO_EFFECT = "No effect.";
// How many textures each ground's middle tiles come in: `<id>_fill.png` holds them in groups of 4 tiles (group 0 =
// tiles 0-3, the usual look; group 1 = tiles 4-7...), all sharing the base colour at their edges. Big plain areas
// then show patches of each texture (fillIndex). Animated terrains keep one group.
const FILL_GROUPS = { grass: 4, sand: 3, snow: 3, ash: 3, cave_floor: 3, high: 3, dirt: 2, wood_floor: 2, stone_floor: 3, farmland: 2, wheat: 2 };
function terrain(id, name, text, o = {}) {
  const t = {
    id, name, text, walk: true, cross: [], shots: true, speed: 1, grip: 1, atk: 1, def: 1, heal: 0, burn: 0,
    favours: {}, bonus: {}, status: null, fixed: false, under: null, anim: false, joinLand: false, spikes: 0, opens: null,
    fills: FILL_GROUPS[id] || 1, ...o,
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
  // built places (village, dungeon, fortress): walls creatures go round and through the doors of, floors inside
  terrain("fort_wall", "Fortress wall", "Blocks movement and attacks.", { walk: false, shots: false, fixed: true }),
  terrain("dungeon_wall", "Dungeon wall", "Blocks movement and attacks.", { walk: false, shots: false, fixed: true }),
  terrain("house_wall", "House wall", "Blocks movement and attacks.", { walk: false, shots: false, fixed: true }),
  terrain("fence", "Fence", "Blocks movement but not attacks. Floaters drift over it.", { walk: false, cross: ["floater"], fixed: true }),
  terrain("wood_floor", "Wooden floor", NO_EFFECT),
  terrain("stone_floor", "Stone floor", NO_EFFECT),
  // the village's square, farms and Town Hall, the fortress keep's carpet (the owner, 2026-11-09)
  terrain("hall_wall", "Town Hall wall", "Blocks movement and attacks.", { walk: false, shots: false, fixed: true }),
  terrain("carpet", "Carpet", NO_EFFECT),
  terrain("farmland", "Farmland", "A little slower. Grove creatures move freely and heal a little.",
    { speed: 0.85, bonus: { grove: { speed: 1, heal: 0.006 } }, status: "leaf" }),
  terrain("wheat", "Wheat", "Defence +20%, a little slower. Grove creatures move freely.",
    { def: 1.2, speed: 0.85, bonus: { grove: { speed: 1 } }, status: "leaf" }),
  terrain("fountain", "Fountain", "Only Tide creatures and floaters can go in. Its water heals a little, Tide creatures more.",
    { walk: false, cross: ["tide", "floater"], heal: 0.01, favours: { tide: 1.1 }, bonus: { tide: { heal: 0.02 } }, status: "wet", fixed: true, anim: true }),
  // the dungeon's traps and secrets
  terrain("spikes", "Spikes", "Spikes shoot up every 2 seconds and hurt whoever stands on them.", { spikes: 0.07, fixed: true, anim: true }),
  terrain("cracked_wall", "Cracked wall", "A weak spot in the wall: click it when your creature is close to break it open.",
    { walk: false, shots: false, fixed: true, opens: "stone_floor", under: "dungeon_wall" }), // (its art: the cracks, over the wall)
].map((t) => [t.id, t]));
export const TERRAIN_IDS = Object.keys(TERRAIN);

// ---------- props ----------
// Obstacles standing on a tile. Each blocks one row of tiles, `foot` wide, starting at its x (its left end);
// the picture stands on the bottom edge of that row, centred on it, and the top of a tall one overlaps the
// tiles behind (draw order by y). `size` is the picture in px (the art's own size wins if it differs). `kind`:
// the obstacle it is a variety of (a birch is a kind of tree); the themes say which varieties grow where, and the
// map picks them by region, so a stretch of woods is birches and another oaks.
const prop = (id, name, w, h, foot, kind = id) => ({ id, name, kind, size: [w, h], foot, walk: false, shots: false, art: `battle/terrain/prop_${id}.png` });
const BASE_PROPS = [
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
  // the built places
  prop("barrel", "Barrel", 16, 32, 1),
  prop("crate", "Crate", 16, 16, 1),
  prop("well", "Well", 32, 32, 2),
  prop("brazier", "Brazier", 16, 32, 1),
  prop("haystack", "Haystack", 32, 32, 2),
  prop("statue", "Statue", 16, 48, 1),
  prop("cart", "Cart", 32, 32, 2),
  prop("banner", "Banner", 16, 48, 1),
  // the village (2026-11-09): the market, the farms, the shops, the tavern and the Town Hall
  prop("stall", "Market stall", 32, 48, 2),
  prop("vendor_cart", "Vending cart", 32, 40, 2),
  prop("scarecrow", "Scarecrow", 16, 32, 1),
  prop("sign_tavern", "Sign", 16, 32, 1, "sign"), prop("sign_bakery", "Sign", 16, 32, 1, "sign"),
  prop("sign_potion", "Sign", 16, 32, 1, "sign"), prop("sign_smith", "Sign", 16, 32, 1, "sign"),
  prop("lamp_post", "Lamp post", 16, 48, 1),
  prop("bench", "Bench", 32, 16, 2),
  prop("table", "Table", 32, 32, 2),
  prop("counter", "Counter", 48, 32, 3),
  prop("shelf", "Shelves", 32, 32, 2),
  prop("sacks", "Sacks", 16, 16, 1),
  prop("anvil", "Anvil", 16, 16, 1),
  prop("desk", "Desk", 32, 32, 2),
  // the dungeon and the fortress
  prop("chest", "Chest", 16, 16, 1),
  prop("cage", "Cage", 16, 32, 1),
  prop("weapon_rack", "Weapon rack", 32, 32, 2),
  prop("armor_stand", "Armour stand", 16, 32, 1),
  prop("throne", "Throne", 32, 48, 2),
  // fallen trees and stumps
  prop("log_fallen", "Fallen tree", 48, 32, 3, "log"), prop("log_mossy", "Fallen tree", 48, 16, 3, "log"),
  prop("stump", "Stump", 16, 16, 1), prop("stump_big", "Stump", 32, 24, 2, "stump"),
  prop("stump_axe", "Stump", 16, 16, 1, "stump"), prop("stump_mossy", "Stump", 16, 16, 1, "stump"),
];
const named = Object.fromEntries(BASE_PROPS.map((p) => [p.id, p.name]));
/** A variety of a prop: it shares its kind's name. */
const variety = (id, kind, w, h, foot) => prop(id, named[kind], w, h, foot, kind);
export const PROPS = Object.fromEntries([...BASE_PROPS, ...VARIETIES()].map((p) => [p.id, p]));
export const PROP_IDS = Object.keys(PROPS);
function VARIETIES() {
  return [
    variety("tree_birch", "tree", 32, 64, 1), variety("tree_autumn", "tree", 48, 64, 2), variety("tree_fruit", "tree", 48, 64, 2),
    variety("tree_willow", "tree", 48, 64, 2), variety("tree_dead", "tree", 32, 48, 1), variety("tree_charred", "tree", 32, 48, 1),
    variety("tree_bare_snowy", "tree", 48, 64, 2), variety("mushroom_giant", "mushroom", 48, 64, 2), variety("pine_snowy", "pine", 32, 64, 2),
    variety("palm_small", "palm", 32, 48, 1), variety("palm_date", "palm", 48, 64, 2),
    variety("boulder_mossy", "boulder", 16, 16, 1), variety("boulder_ice", "boulder", 16, 16, 1),
    variety("rock_big_flat", "rock_big", 32, 16, 2), variety("rock_big_cracked", "rock_big", 32, 32, 2), variety("rock_big_cluster", "rock_big", 32, 16, 2),
    variety("rock_big_sandstone", "rock_big", 32, 32, 2), variety("rock_big_ice", "rock_big", 32, 32, 2),
    variety("crystal_cluster", "crystal", 16, 16, 1), variety("crystal_pink", "crystal", 16, 32, 1), variety("obsidian_big", "obsidian", 32, 32, 2),
    variety("bush_flower", "bush", 16, 16, 1), variety("bush_dry", "bush", 16, 16, 1), variety("cactus_round", "cactus", 16, 16, 1),
    variety("pillar_fallen", "pillar", 32, 16, 2),
    // 2026-11-09: more trees ("more shapes, dead trees, some knocked over, some taller, some stumps")
    variety("tree_tall", "tree", 48, 80, 2), variety("tree_poplar", "tree", 32, 80, 1), variety("tree_round", "tree", 48, 64, 2),
    variety("tree_twisted", "tree", 48, 64, 2), variety("tree_dead_tall", "tree", 48, 80, 2), variety("tree_dead_broken", "tree", 32, 48, 1),
    variety("pine_tall", "pine", 32, 80, 2), variety("pine_dead", "pine", 32, 64, 2),
    variety("stall_cloth", "stall", 32, 48, 2), variety("stall_bread", "stall", 32, 48, 2), variety("vendor_cart_flowers", "vendor_cart", 32, 32, 2),
    variety("shelf_books", "shelf", 32, 32, 2), variety("statue_gargoyle", "statue", 16, 32, 1), variety("statue_knight", "statue", 16, 48, 1),
    variety("weapon_rack_axes", "weapon_rack", 32, 32, 2), variety("armor_stand_gold", "armor_stand", 16, 32, 1),
  ];
}

// ---------- decals ----------
// Small things on the ground that don't block anything (pebbles, leaves, shells, cracks...), drawn on the ground
// after its layers and before props and creatures. `decal_<id>.png` is a strip of `variants` cells of `size`;
// `on`: the grounds it may lie on; `near`: it only lies within 2 tiles of one of these (shells by the water), or
// {ground: [ids]} for a rule on one ground only (tufts on sand only next to grass).
const decal = (id, on, { variants = 4, size = [16, 16], near = null } = {}) =>
  ({ id, on, near, variants, size, art: `battle/terrain/decal_${id}.png` });
export const DECALS = Object.fromEntries(DECAL_LIST().map((d) => [d.id, d]));
function DECAL_LIST() {
  return [
    decal("pebbles", ["grass", "dirt", "sand", "cave_floor", "ash", "high", "snow", "cobbles", "stone_floor"]),
    decal("twigs", ["grass", "forest_floor", "dirt"]),
    decal("leaves", ["forest_floor", "grass"]),
    decal("tuft", ["grass", "dirt", "sand"], { near: { sand: ["grass", "tall_grass"] } }),
    decal("flowers", ["grass"], { variants: 6 }),
    decal("bones", ["sand", "ash", "dirt", "stone_floor"]),
    decal("shells", ["sand"], { near: ["shallows", "deep_water"] }),
    decal("seaweed", ["sand"], { near: ["shallows", "deep_water"] }),
    decal("puddle", ["grass", "dirt", "mud", "cave_floor", "cobbles", "stone_floor"]),
    decal("crack", ["sand", "dirt", "ash", "high", "cave_floor", "cobbles", "stone_floor"]),
    decal("mushrooms", ["forest_floor", "grass", "shadow", "cave_floor"]),
    decal("snowdrift", ["snow"]),
    decal("cinders", ["ash"]),
    // the built places
    decal("straw", ["wood_floor", "dirt", "stone_floor", "cobbles"]),
    decal("rug", ["wood_floor"]),
    decal("cobweb", ["stone_floor", "cave_floor"]),
    decal("rubble", ["stone_floor", "cobbles", "dirt", "cave_floor"]),
    decal("coins", ["stone_floor"]), // (only in the dungeon's hidden rooms, laid by the map, never scattered)
  ];
}

// ---------- ornaments, roofs and traps ----------
// Ornaments: pictures that block nothing (map.ornaments: { id, v (variant), x, y = the cell's top-left in world px }).
// `wall` ones hang on the south face of a wall over floor (the cell's top-left at the wall tile's top-left, 16x32:
// the wall tile, then the floor tile in front); `stand` ones are sorted with props and creatures by their bottom.
// `frames` > 1: an animation along the strip (variants, if any, come first, each with its frames).
const ornament = (id, size, { variants = 1, frames = 1, wall = false, stand = false } = {}) =>
  ({ id, size, variants, frames, wall, stand, art: `battle/terrain/ornament_${id}.png` });
export const ORNAMENTS = Object.fromEntries([
  ornament("chains", [16, 32], { variants: 3, wall: true }),
  ornament("torch", [16, 32], { frames: 4, wall: true }),
  ornament("weapons", [16, 32], { variants: 3, wall: true }),
  ornament("fountain", [32, 48], { frames: 4, stand: true }),
].map((o) => [o.id, o]));

// Roofs (map.roofs: { x0, y0, w, h, style, extras }): over a building's footprint (its walls included), faded away
// while a creature is inside so nobody hides under one. `sheet` styles are put together from 16x16 pieces (README
// "Roofs"): (w*16 + 6) x h*16 px, drawn at (x0*16 - 3, y0*16 - 10). `image` styles are one picture for a building of
// a fixed size, its bottom edge at (y0 + h)*16 - 10, centred on the building. Extras stand on the roof: { id, x }
// (x: tiles from the roof's left, where its picture is centred; its bottom edge `sit` px below the top of the ridge row:
// a chimney stands on the back slope just above the ridge, a bell tower or a flag astride it; dx: px to shift the picture
// so its foot sits at x).
export const ROOFS = {
  thatch: { sheet: "battle/terrain/roof_thatch.png" }, red: { sheet: "battle/terrain/roof_red.png" },
  slate: { sheet: "battle/terrain/roof_slate.png" }, shingle: { sheet: "battle/terrain/roof_shingle.png" },
  tower: { image: "battle/terrain/roof_tower.png", w: 9, h: 9 },
};
export const ROOF_EXTRAS = {
  chimney: { art: "battle/terrain/roof_chimney.png", size: [16, 32], sit: 7 },
  bell: { art: "battle/terrain/roof_bell.png", size: [32, 48], sit: 16 },
  flag: { art: "battle/terrain/roof_keep_flag.png", size: [16, 32], sit: 8, dx: 4 }, // (its pole is left of the picture's middle)
};
/** Which rows of a sheet roof h tiles tall are back slope and front slope (the rest: back eave, ridge, front eave). */
export const roofRows = (h) => { const a = Math.max(0, Math.floor((h - 3) * 0.4)); return { back: a, front: Math.max(0, h - 3 - a) }; };

// Traps (map.hazards). An axe: a blade on a pole hanging from the ceiling over the floor point (x, y) (world px),
// swinging left and right: angle = 60 degrees * sin(2 pi t / period + phase); the blade sweeps reach px either side.
export const HAZARDS = {
  axe: { art: "battle/terrain/hazard_axe.png", frames: 9, size: [96, 64], pivot: [48, 4], low: [48, 54], reach: 46, swing: 60 },
};

/** Every art file the arenas use (paths under web/game-art/), for data.artFiles(). */
export function terrainArtFiles() {
  return [...Object.values(SHEETS).flatMap((t) => [t.edges, t.fill]), ...Object.values(PROPS).map((p) => p.art),
    ...Object.values(DECALS).map((d) => d.art), ...Object.values(ORNAMENTS).map((o) => o.art),
    ...Object.values(ROOFS).map((r) => r.sheet || r.image), ...Object.values(ROOF_EXTRAS).map((e) => e.art),
    ...Object.values(HAZARDS).map((h) => h.art)];
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
/** Which way a bridge tile runs: "h" (east-west) or "v", from the bridge tiles beside it (a bend or a T: the run it
 * mostly belongs to), else from the water. */
function bridgeAxis(map, tx, ty) {
  const is = (dx, dy, id) => tileAt(map, tx + dx, ty + dy) === id;
  const h = is(1, 0, "bridge") + is(-1, 0, "bridge"), v = is(0, 1, "bridge") + is(0, -1, "bridge");
  if (h || v) return v > h ? "v" : "h";
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
export function fillIndex(map, tx, ty, layer = "") {
  const key = strKey(layer);
  const tile = hashN(map.seedNum, tx, ty, key) & 3;
  const groups = (TERRAIN[layer] && TERRAIN[layer].fills) || 1;
  if (groups < 2) return tile;
  // a slow noise picks the texture, so it comes in patches (the usual one, group 0, about half the ground)
  const v = fbm((map.seedNum ^ key) | 0, tx, ty, 9, 2);
  const g = v < 0.5 ? 0 : Math.min(groups - 1, 1 + Math.floor(((v - 0.5) / 0.25) * (groups - 1)));
  return g * 4 + tile;
}

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

// ---- the dual grid (corner tiles) ----
// The art is drawn on a grid offset by half a tile, so boundaries needn't follow tile edges: diagonal shores run
// diagonally, inside corners round off, a lone tile is a round blob. Gameplay still goes by tile. Cell (cx, cy),
// cx 0..cols and cy 0..rows, covers world px cx*16-8 .. cx*16+8 (and the same for y); its four corners are the
// centres of tiles (cx-1, cy-1) NW 1, (cx, cy-1) NE 2, (cx-1, cy) SW 4, (cx, cy) SE 8 (outside the map: the nearest
// tile). Each terrain in the cell is drawn with the mask of corners whose stack holds it (`<id>.png` tile `mask`,
// or `<id>_fill.png` tile `fill` when the mask is 15).

// Low to high: the order terrains are drawn in a cell, when the corners' own stacks don't already say.
const DRAW_ORDER = ["cave_floor", "ash", "snow", "sand", "dirt", "grass", "forest_floor", "mud", "ice", "shallows",
  "deep_water", "spring", "coals", "lava", "cobbles", "stone_floor", "wood_floor", "carpet", "farmland", "high", "tall_grass", "wheat",
  "flowers", "shadow", "crystals", "spikes", "fountain",
  "wall", "house_wall", "hall_wall", "dungeon_wall", "cracked_wall", "fort_wall", "fence", "bridge", "bridge_v"];

/**
 * The art for each layer drawCorners can name: every terrain, plus `bridge_v` (a bridge whose deck runs north-south;
 * in corner masks its ends look like an east-west bridge's, so it has its own sheets).
 */
export const SHEETS = {
  ...Object.fromEntries(Object.values(TERRAIN).map((t) => [t.id, { edges: t.art.edges, fill: t.art.fill, anim: t.anim }])),
  bridge_v: { edges: "battle/terrain/bridge_v.png", fill: "battle/terrain/bridge_v_fill.png", anim: false },
};
const RANK = Object.fromEntries(DRAW_ORDER.map((id, k) => [id, k]));

/** What to draw in dual-grid cell (cx, cy), bottom to top: [{ terrain, mask (NW 1 NE 2 SW 4 SE 8), fill }]; `terrain`
 * is a terrain id or `bridge_v` (SHEETS has the art for each). */
export function drawCorners(map, cx, cy) {
  const clampX = (x) => Math.max(0, Math.min(map.cols - 1, x)), clampY = (y) => Math.max(0, Math.min(map.rows - 1, y));
  const corners = [[cx - 1, cy - 1, 1], [cx, cy - 1, 2], [cx - 1, cy, 4], [cx, cy, 8]];
  const stacks = corners.map(([x, y, bit]) => {
    const tx = clampX(x), ty = clampY(y);
    const chain = chainAt(map, tx, ty);
    // a bridge is drawn by the way its deck runs
    if (chain[chain.length - 1] === "bridge" && bridgeAxis(map, tx, ty) === "v") chain[chain.length - 1] = "bridge_v";
    return { bit, chain };
  });
  const mask = {};
  for (const { bit, chain } of stacks) for (const t of chain) mask[t] = (mask[t] || 0) | bit;
  // order: each corner's own stack first (what lies on what), then the global order
  const after = {};
  for (const { chain } of stacks) for (let k = 1; k < chain.length; k++) (after[chain[k]] ||= new Set()).add(chain[k - 1]);
  const todo = Object.keys(mask);
  const out = [];
  while (todo.length) {
    const ready = todo.filter((t) => ![...(after[t] || [])].some((u) => todo.includes(u)));
    const pool = ready.length ? ready : todo; // (stacks that disagree: the global order decides)
    pool.sort((a, b) => (a === map.base ? -1 : b === map.base ? 1 : (RANK[a] ?? 99) - (RANK[b] ?? 99)));
    const t = pool[0];
    todo.splice(todo.indexOf(t), 1);
    out.push({ terrain: t, mask: t === map.base ? 15 : mask[t], fill: fillIndex(map, cx, cy, t) });
  }
  return out;
}

// ---------- finding a way ----------

class Heap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(key, val) {
    const k = this.k, v = this.v;
    let i = k.length;
    k.push(key); v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      k[i] = k[p]; v[i] = v[p]; i = p;
    }
    k[i] = key; v[i] = val;
  }
  pop() {
    const k = this.k, v = this.v;
    const top = v[0], topKey = k[0];
    const lk = k.pop(), lv = v.pop();
    if (k.length) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = -1, mk = lk;
        if (l < k.length && k[l] < mk) { m = l; mk = k[l]; }
        if (r < k.length && k[r] < mk) { m = r; mk = k[r]; }
        if (m < 0) break;
        k[i] = k[m]; v[i] = v[m]; i = m;
      }
      k[i] = lk; v[i] = lv;
    }
    this.lastKey = topKey;
    return top;
  }
}

/** For one creature on one map: which tiles it can stand on, and seconds-ish to cross each (slow ground costs
 * more, burning ground a lot more). Worked out once per call, not per step. */
function costGrid(map, creature) {
  const n = map.cols * map.rows;
  const ok = new Uint8Array(n), cost = new Float64Array(n);
  const memo = {};
  let minCost = Infinity;
  for (let i = 0; i < n; i++) {
    const id = map.tiles[i];
    if (!(id in memo)) {
      const e = effectsFor(id, creature);
      memo[id] = [canEnter(id, creature) ? 1 : 0, 1 / Math.max(0.2, e.speed) + e.burn * 25 + TERRAIN[id].spikes * 40];
    }
    ok[i] = map.propTiles[i] ? 0 : memo[id][0];
    cost[i] = memo[id][1];
    if (ok[i] && cost[i] < minCost) minCost = cost[i];
  }
  return { ok, cost, minCost: minCost === Infinity ? 1 : minCost };
}

// Which tiles connect to which, per map and per kind of mover (walkers; tide; ember; floaters). Terrain moves only
// ever repaint walkable ground with walkable ground, so this never goes stale for a map.
const regionCache = new WeakMap();
function regionsOf(map, grid, creature) {
  const key = ["deep_water", "lava"].map((id) => (canEnter(id, creature) ? 1 : 0)).join("");
  let byKey = regionCache.get(map.propTiles);
  if (!byKey) regionCache.set(map.propTiles, (byKey = new Map()));
  let label = byKey.get(key);
  if (label) return label;
  const { cols, rows } = map;
  label = new Int32Array(cols * rows).fill(-1);
  let next = 0;
  const stack = [];
  for (let s = 0; s < label.length; s++) {
    if (!grid.ok[s] || label[s] >= 0) continue;
    label[s] = next; stack.push(s);
    while (stack.length) {
      const i = stack.pop();
      const x = i % cols, y = (i - x) / cols;
      if (x > 0 && grid.ok[i - 1] && label[i - 1] < 0) { label[i - 1] = next; stack.push(i - 1); }
      if (x < cols - 1 && grid.ok[i + 1] && label[i + 1] < 0) { label[i + 1] = next; stack.push(i + 1); }
      if (y > 0 && grid.ok[i - cols] && label[i - cols] < 0) { label[i - cols] = next; stack.push(i - cols); }
      if (y < rows - 1 && grid.ok[i + cols] && label[i + cols] < 0) { label[i + cols] = next; stack.push(i + cols); }
    }
    next++;
  }
  byKey.set(key, label);
  return label;
}

/** The tile nearest the point `to` (world px) that `test(i)` accepts, searching outwards from `to`; -1 if none. */
function nearestTile(map, to, test) {
  const { cols, rows } = map;
  const gx = Math.max(0, Math.min(cols - 1, Math.floor(to.x / TILE))), gy = Math.max(0, Math.min(rows - 1, Math.floor(to.y / TILE)));
  let best = -1, bestD = Infinity;
  const maxR = Math.max(cols, rows);
  for (let r = 0; r <= maxR; r++) {
    if (best >= 0 && r - 1 > bestD / TILE + 1) break;
    for (let y = gy - r; y <= gy + r; y++) {
      if (y < 0 || y >= rows) continue;
      const edge = y === gy - r || y === gy + r;
      for (let x = gx - r; x <= gx + r; x += edge ? 1 : 2 * r || 1) {
        if (x < 0 || x >= cols) continue;
        const i = y * cols + x;
        if (!test(i)) continue;
        const c = tileCenter(x, y);
        const d = Math.hypot(c.x - to.x, c.y - to.y);
        if (d < bestD) { bestD = d; best = i; }
      }
    }
  }
  return best;
}

/** The cheapest tile path from `start` to `goal` (A*, 8 directions, no cutting past a blocked corner), or null. */
function tilePath(map, grid, start, goal) {
  const { cols, rows } = map;
  const { ok, cost, minCost } = grid;
  const n = cols * rows;
  const g = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const gx = goal % cols, gy = (goal - gx) / cols;
  const h = (i) => {
    const x = i % cols, y = (i - x) / cols;
    const dx = Math.abs(x - gx), dy = Math.abs(y - gy);
    return minCost * (Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy));
  };
  g[start] = 0;
  const heap = new Heap(); heap.push(h(start), start);
  while (heap.size) {
    const i = heap.pop();
    if (i === goal) break;
    if (heap.lastKey > g[i] + h(i) + 1e-9) continue;
    const x = i % cols, y = (i - x) / cols;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const j = ny * cols + nx;
      if (!ok[j]) continue;
      if (dx && dy && (!ok[y * cols + nx] || !ok[ny * cols + x])) continue;
      const nd = g[i] + ((dx && dy ? Math.SQRT2 : 1) * (cost[i] + cost[j])) / 2;
      if (nd < g[j]) { g[j] = nd; prev[j] = i; heap.push(nd + h(j), j); }
    }
  }
  if (g[goal] === Infinity) return null;
  const tiles = [];
  for (let i = goal; i !== -1; i = prev[i]) tiles.push(i);
  return tiles.reverse();
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
 * move anywhere. Prefers fast, safe ground and goes straight where it can. About a tenth of a millisecond for
 * a short way, a few tenths across a 90 x 54 arena.
 */
export function findPath(map, from, to, creature) {
  const s = tileOf(from.x, from.y);
  if (!inside(map, s.tx, s.ty)) return null;
  const start = s.ty * map.cols + s.tx;
  const grid = costGrid(map, creature);
  const region = regionsOf(map, grid, creature);
  let mine = region[start];
  if (mine < 0) { // standing somewhere it couldn't walk onto: count the region next to it
    const near = nearestTile(map, from, (i) => region[i] >= 0);
    if (near < 0) return null;
    mine = region[near];
    grid.ok[start] = 1;
  }
  const g = tileOf(to.x, to.y);
  let goal = inside(map, g.tx, g.ty) ? g.ty * map.cols + g.tx : -1;
  const exact = goal >= 0 && (goal === start || region[goal] === mine);
  if (!exact) {
    goal = nearestTile(map, to, (i) => region[i] === mine || i === start);
    if (goal < 0) return null;
  }
  const tiles = goal === start ? [start] : tilePath(map, grid, start, goal);
  if (!tiles) return null;
  const pts = tiles.slice(1).map((i) => tileCenter(i % map.cols, Math.floor(i / map.cols)));
  if (exact && (to.x !== from.x || to.y !== from.y)) { if (pts.length) pts[pts.length - 1] = { x: to.x, y: to.y }; else pts.push({ x: to.x, y: to.y }); }
  if (!exact && !pts.length) return [];
  // go straight past the corners it doesn't need (never onto worse ground than the tile path uses)
  const out = [];
  let here = { x: from.x, y: from.y }, k = 0;
  while (k < pts.length) {
    let far = k, maxCost = Math.max(grid.cost[tiles[k]], grid.cost[tiles[k + 1]]);
    for (let j = k + 1; j < pts.length; j++) {
      maxCost = Math.max(maxCost, grid.cost[tiles[j + 1]]);
      if (!clearLine(map, grid, here, pts[j], maxCost)) break;
      far = j;
    }
    out.push(pts[far]); here = pts[far]; k = far + 1;
  }
  return out;
}

/**
 * A good place to put a creature near a point (world px): the centre of the nearest tile it can stand on that
 * doesn't burn, has no prop, has room round it (its four neighbours are standable too) and, when `from` is given,
 * can be walked to from there. null if there is none.
 */
export function safeSpotNear(map, x, y, creature, { from = null } = {}) {
  const grid = costGrid(map, creature);
  const region = regionsOf(map, grid, creature);
  let want = -1;
  if (from) {
    const f = tileOf(from.x, from.y);
    if (inside(map, f.tx, f.ty)) want = region[f.ty * map.cols + f.tx];
    if (want < 0) { const near = nearestTile(map, from, (i) => region[i] >= 0); want = near < 0 ? -1 : region[near]; }
  }
  const { cols, rows } = map;
  const i = nearestTile(map, { x, y }, (t) => {
    if (!grid.ok[t] || (want >= 0 && region[t] !== want)) return false;
    if (effectsFor(map.tiles[t], creature).burn > 0) return false;
    const tx = t % cols, ty = (t - tx) / cols;
    return tx > 0 && ty > 0 && tx < cols - 1 && ty < rows - 1 && grid.ok[t - 1] && grid.ok[t + 1] && grid.ok[t - cols] && grid.ok[t + cols];
  });
  return i < 0 ? null : tileCenter(i % cols, Math.floor(i / cols));
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
/** A fast hash of a lattice point to 0..1, for the noise (called a lot). */
function lattice(s, x, y) {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(s | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}
function valueNoise(s, x, y) {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = lattice(s, x0, y0), b = lattice(s, x0 + 1, y0), c = lattice(s, x0, y0 + 1), d = lattice(s, x0 + 1, y0 + 1);
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
// Size: 90 x 54 tiles by default (1440 x 864 px). The battle screen's camera follows the player's creature and shows
// roughly a third of the arena. The two starts sit near the middle, 23-30 tiles apart, so the rival begins just off
// the screen and the two meet within seconds; the rest is room to roam: regions of open ground and of thick cover,
// roads leading out, rivers and ridges with a few ways across (chokepoints), a landmark in the middle. Smaller maps
// (30 x 18) still work: the number and size of features follow the map's size (`ctx.big`: 1 at 30 x 18, 3 at 90 x 54).
//
// Fairness: the arena is symmetric (turned 180 degrees, or mirrored left to right) within `zone` tiles of each start,
// and only loosely symmetric elsewhere, where every random field is a blend of itself and its mirror image. So each
// side starts on the same ground, and the rest still looks natural. A map whose halves differ too much (terrain
// counts, or who can get to more of the arena first) is drawn again from the same seed; the last try is fully
// symmetric, which is always fair. Every walled-off area of POCKET tiles or more gets a way in.

const LOOSE = 0.45;   // how much of the mirror image the loose parts keep
const KEEP = 2.5;     // nothing in the way or hurting within this many tiles of a start
const ATTEMPTS = 6;
const POCKET = 12;

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
  const n = cols * rows;
  // a big arena mirrored left to right looks made (a face of a map); turned 180 degrees it doesn't show
  const sym = theme.sym === "either" ? (n > 1500 || r.chance(0.65) ? "rotate" : "mirror") : theme.sym;
  const R = sym === "rotate" ? (i) => n - 1 - i : (i) => i - (i % cols) + (cols - 1 - (i % cols));
  const big = Math.max(1, Math.sqrt(n / 540));
  const ctx = {
    theme, themeId, cols, rows, n, seedNum, salt, attempt, r, sym, R, base: theme.base, k: 100,
    big, grow: 1 + (big - 1) * 0.5, zone: Math.round(5 + big), fade: Math.round(2 + 2 * big),
    tiles: Array(n).fill(theme.base), propTiles: Array(n).fill(null), props: [], under: Array(n).fill(null),
    roofs: [], ornaments: [], hazards: [], doors: [], decals: [], secrets: [],
    w: new Float64Array(n), keep: new Uint8Array(n), clear: new Uint8Array(n),
  };
  // the starts: about 12 tiles either side of the middle (on a small map, near the ends), the rows a little apart
  const cx = (cols - 1) / 2, cy = (rows - 1) / 2;
  const x = Math.round(cx - Math.min(cx - 3, r.range(11.5, 13.5)));
  const spread = Math.min(rows * 0.2, 5);
  const [lo, hi] = theme.startRows ? theme.startRows(ctx) : [Math.round(cy - spread), Math.round(cy + spread)];
  const a = r.int(lo, hi) * cols + x;
  ctx.starts = [a, R(a)];
  const strict = attempt >= ATTEMPTS - 1;
  for (let i = 0; i < n; i++) {
    const d = Math.min(dist(ctx, i, ctx.starts[0]), dist(ctx, i, ctx.starts[1]));
    ctx.w[i] = strict || d <= ctx.zone ? 1 : d >= ctx.zone + ctx.fade ? LOOSE : 1 - ((1 - LOOSE) * (d - ctx.zone)) / ctx.fade;
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
/** A random number for a tile: mirrored near the starts, free elsewhere. */
const tileRand = (ctx, key, i) => (ctx.w[i] >= 1 ? symRand(ctx, key, i) : hash01(ctx.salt, key, i, 7));
const N4 = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const N8 = [[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1]];
const around = (ctx, i, dirs = N8) => dirs.map(([dx, dy]) => at(ctx, X(ctx, i) + dx, Y(ctx, i) + dy)).filter((j) => j >= 0);
const harmful = (id) => !TERRAIN[id].walk || TERRAIN[id].burn > 0 || TERRAIN[id].spikes > 0;
/** Ground a patch, road or landmark may paint over: walkable, not water, not a bridge or a wall. */
const paintable = (id) => TERRAIN[id].walk && !TERRAIN[id].fixed && !WATERY.has(id);

function normalise(arr) {
  const n = arr.length;
  const mean = arr.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(arr.reduce((a, b) => a + (b - mean) ** 2, 0) / n) || 1;
  for (let i = 0; i < n; i++) arr[i] = (arr[i] - mean) / sd;
  return arr;
}
/**
 * A smooth random field over the map (mean 0, spread 1), blended with its own mirror image (fully near the
 * starts, partly elsewhere). On a big map a slower second layer, always mirrored, makes whole regions differ (an
 * open field here, thick cover there, the same on the other side); `whole` mirrors the field everywhere on a big
 * map (for the few big features, lakes and hills, so neither side gets them all). `extra(x, y)` is added before
 * blending (a slope, a distance).
 */
function field(ctx, scale, { octaves = 2, extra = null, whole = false } = {}) {
  const s = hashN(ctx.salt, ctx.k++);
  const reg = Math.min(1, (ctx.big - 1) * 0.5);
  const all = whole && ctx.big > 1.5;
  const raw = new Float64Array(ctx.n), slow = reg ? new Float64Array(ctx.n) : null;
  for (let i = 0; i < ctx.n; i++) {
    const x = X(ctx, i), y = Y(ctx, i);
    raw[i] = fbm(s, x, y, scale, octaves);
    if (slow) slow[i] = fbm(s ^ 0x5bd1e995, x, y, Math.max(scale * 3, 14), 2);
  }
  normalise(raw);
  if (slow) normalise(slow);
  if (extra) for (let i = 0; i < ctx.n; i++) raw[i] += extra(X(ctx, i), Y(ctx, i));
  const out = new Float64Array(ctx.n);
  for (let i = 0; i < ctx.n; i++) {
    const w = all ? 1 : ctx.w[i];
    const sym = (raw[i] + raw[ctx.R(i)]) / Math.SQRT2;
    out[i] = (w >= 1 ? sym : w * sym + (1 - w) * raw[i]) + (slow ? (reg * (slow[i] + slow[ctx.R(i)])) / Math.SQRT2 : 0);
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
  if (ctx.propTiles[i] && (!TERRAIN[id].walk || TERRAIN[id].fixed)) removeProp(ctx, i);
}

/** Paint `id` over about `cover` of the whole map, on the tiles of `on`, where the field is highest. */
function patch(ctx, id, cover, scale, { on = [ctx.base], f = null, octaves = 2, whole = false } = {}) {
  if (cover <= 0) return null;
  f = f || field(ctx, scale, { octaves, whole });
  const bad = harmful(id);
  const cand = [];
  for (let i = 0; i < ctx.n; i++) if (on.includes(ctx.tiles[i]) && !(bad && ctx.keep[i]) && !ctx.clear[i]) cand.push(i);
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
  patch(ctx, core, cover, scale, { on: on || [ctx.base], f, whole: true });
  despeckle(ctx, core, rim || ctx.base);
  if (rim) ring(ctx, [core], rim, { chance: rimChance });
}

/**
 * A river from the top edge to the bottom edge through the middle, between the two starts (only on a map turned
 * 180 degrees), with a few ways across: bridges, fords or gaps. Wider, with more crossings, on a big map.
 */
function river(ctx, { core, bank = null, width = 1, bankChance = 1, crossing = null, crossings = 0 }) {
  if (ctx.sym !== "rotate") return false;
  const { cols: W, rows: H, R, r } = ctx;
  const s = hashN(ctx.salt, ctx.k++);
  const n1 = (y) => fbm(s, y, 0.5, Math.max(5, H / 3.5), 2); // gentle bends on a big map
  const amp = Math.min(W * 0.17, 5) * 2;
  const g = (y) => (n1(y) - n1(H - 1 - y)) * amp;
  width += Math.round((ctx.big - 1) / 2);
  const coreSet = new Set();
  const add = (i) => { if (i >= 0) { coreSet.add(i); coreSet.add(R(i)); } };
  const cx = (W - 1) / 2;
  for (let y = 0; y < H / 2; y++) {
    const x0 = Math.round(cx + g(y) - (width - 1) / 2);
    for (let x = x0; x < x0 + width; x++) add(at(ctx, Math.max(0, Math.min(W - 1, x)), y));
  }
  const byRow = () => {
    const rows = Array.from({ length: H }, () => []);
    for (const i of coreSet) rows[Y(ctx, i)].push(X(ctx, i));
    return rows;
  };
  let rows = byRow();
  for (let y = 0; y < H - 1; y++) { // join each row to the next (no corner-only joins)
    const a = rows[y], b = rows[y + 1];
    if (a.some((x) => b.includes(x))) continue;
    const aMin = Math.min(...a), aMax = Math.max(...a), bMin = Math.min(...b), bMax = Math.max(...b);
    if (bMin > aMax) for (let x = aMax + 1; x <= bMin; x++) add(at(ctx, x, y));
    else for (let x = bMax; x < aMin; x++) add(at(ctx, x, y));
    rows = byRow();
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
    // ways across where the river runs straight and narrow, a few rows apart
    const want = crossings + Math.round(ctx.big) - 1;
    const lo = 2, hi = Math.max(2, Math.floor(H / 2) - 2);
    const wet = (x, y) => { const t = ctx.tiles[at(ctx, x, y)]; return WATERY.has(t); };
    // a crossing runs from bank to bank: over the river and the wet ground beside it, to dry ground
    const span = (y) => {
      const x0 = Math.min(...rows[y]), x1 = Math.max(...rows[y]);
      let a = x0, b = x1;
      while (a > 0 && wet(a - 1, y) && x1 - a < 10) a--;
      while (b < W - 1 && wet(b + 1, y) && b - x0 < 10) b++;
      return { a, b, dry: a > 0 && b < W - 1 && !wet(a - 1, y) && !wet(b + 1, y) };
    };
    const good = (y) => rows[y].length <= width + 1 && span(y).dry
      && [y - 1, y + 1].every((v) => rows[v] && rows[v].some((x) => rows[y].includes(x)));
    const picked = [];
    for (let tries = 0; picked.length < want && tries < 60; tries++) {
      const y = r.int(lo, hi);
      if ((tries < 40 && !good(y)) || picked.some((q) => Math.abs(q - y) < 4)) continue;
      picked.push(y);
    }
    for (const y of picked) {
      if (crossing !== "bridge") { for (const x of rows[y]) { const i = at(ctx, x, y); setTile(ctx, i, crossing); setTile(ctx, R(i), crossing); } continue; }
      const { a, b } = span(y);
      for (let x = a; x <= b; x++) {
        for (const i of [at(ctx, x, y), R(at(ctx, x, y))]) {
          const was = ctx.tiles[i];
          if (was !== "deep_water" && was !== "shallows") continue;
          setTile(ctx, i, "bridge");
          ctx.under[i] = was === "shallows" ? ["shallows"] : null;
        }
      }
    }
  }
  return true;
}

/** A tile on the left start's side of the map, well away from it: where a road out can lead. */
function farPoint(ctx) {
  const { cols: W, rows: H, r } = ctx;
  const a = ctx.starts[0];
  for (let t = 0; t < 30; t++) {
    const i = at(ctx, r.int(1, Math.max(1, Math.floor(W / 2) - 3)), r.int(1, H - 2));
    if (dist(ctx, i, a) >= Math.min(W, H) * 0.3) return i;
  }
  return at(ctx, 1, Y(ctx, a));
}

/**
 * A winding road from the left start to the middle (or to `to`), and its mirror image from the other start.
 * Roads only cover ground in `on`, so they stop at water and walls.
 */
function road(ctx, id, { on, to = null }) {
  const { cols: W, rows: H, R, r } = ctx;
  const a = ctx.starts[0];
  let x = X(ctx, a), y = Y(ctx, a);
  const middle = to === null;
  const tx = middle ? Math.floor((W - 1) / 2) : X(ctx, to);
  const ty = !middle ? Y(ctx, to) : ctx.sym === "rotate" ? Math.floor((H - 1) / 2) : Math.max(1, Math.min(H - 2, y + r.int(-3, 3)));
  const cells = [at(ctx, x, y)];
  for (let guard = 0; (x !== tx || y !== ty) && guard < 4 * (W + H); guard++) {
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
  if (middle) cells.push(at(ctx, W - 1 - tx, ty)); // meet the other half
  for (const i of cells) for (const j of [i, R(i)]) if (j >= 0 && on.includes(ctx.tiles[j]) && !ctx.clear[j]) setTile(ctx, j, id);
}

/** The road to the middle, and on a big map more roads leading out to the far parts of the arena. */
function roads(ctx, id, on, chance = 0.6) {
  if (ctx.r.chance(chance)) road(ctx, id, { on });
  for (let k = Math.round(ctx.big) - 1; k > 0; k--) if (ctx.r.chance(0.75)) road(ctx, id, { on, to: farPoint(ctx) });
}

/** A small spring: in the very middle, or a pair, one on each side. */
function spring(ctx) {
  const { cols: W, rows: H, R, r } = ctx;
  let spots;
  if (r.chance(0.5)) {
    const cx = Math.floor((W - 1) / 2), cy = Math.floor((H - 1) / 2);
    spots = [at(ctx, cx, cy), at(ctx, cx + 1, cy), at(ctx, cx, cy + 1), at(ctx, cx + 1, cy + 1)];
  } else spots = springSpot(ctx);
  paintSpring(ctx, spots);
}
function springSpot(ctx) {
  const { cols: W, rows: H, r } = ctx;
  const i = at(ctx, r.int(2, W - 3), r.int(2, H - 3));
  return [i, ...(r.chance(0.6) ? [at(ctx, X(ctx, i) + r.pick([-1, 1]), Y(ctx, i))] : [])];
}
function paintSpring(ctx, spots) {
  for (const i of spots.filter((k) => k >= 0)) for (const j of [i, ctx.R(i)]) {
    if (paintable(ctx.tiles[j]) && !ctx.keep[j]) setTile(ctx, j, "spring");
  }
}
/** Springs scattered over a big map (pairs, one on each side): `count` pairs. */
function springs(ctx, count) {
  for (let k = 0; k < count; k++) {
    const spots = springSpot(ctx);
    if (spots.every((i) => i >= 0 && Math.min(dist(ctx, i, ctx.starts[0]), dist(ctx, i, ctx.starts[1])) >= 5)) paintSpring(ctx, spots);
  }
}

/**
 * A landmark in the middle of the map: calls `paint(i, d, exact)` for each tile within `radius` tiles of the
 * middle (a little ragged; d = how far in, 0 at the middle; `exact` without the raggedness, for a heart that must
 * sit right in the middle) and keeps scattered props off it.
 */
function landmark(ctx, radius, paint, { ragged = 0.5 } = {}) {
  const cx = (ctx.cols - 1) / 2, cy = (ctx.rows - 1) / 2;
  const f = field(ctx, 2.5);
  for (let i = 0; i < ctx.n; i++) {
    const exact = Math.hypot(X(ctx, i) - cx, (Y(ctx, i) - cy) * 1.15);
    const d = exact - f[i] * ragged;
    if (d > radius && exact > 1) continue;
    ctx.clear[i] = 1;
    paint(i, Math.max(0, d), exact);
  }
}
/** A landmark's size: `small` tiles across on a 30 x 18 map, a little bigger on a big one. */
const landmarkSize = (ctx, small) => small * Math.sqrt(ctx.big);
/** Paint a landmark tile only where it may go (not over water, walls, bridges or a start). */
const paintAt = (ctx, i, id) => { if (paintable(ctx.tiles[i]) && !(harmful(id) && ctx.keep[i])) setTile(ctx, i, id); };
/** Props in a ring round the middle (pairs, so both sides alike). */
function propRing(ctx, id, radius, pairs) {
  const cx = (ctx.cols - 1) / 2, cy = (ctx.rows - 1) / 2;
  const turn = ctx.r.range(0, Math.PI);
  for (let k = 0; k < pairs; k++) {
    const a = turn + (k * Math.PI) / pairs;
    const i = at(ctx, Math.round(cx + Math.cos(a) * radius), Math.round(cy + Math.sin(a) * radius * 0.8));
    if (i >= 0) putPair(ctx, varietyOf(ctx, id, i), i, false, null, { onClear: true });
  }
}

// ---- props ----

function footprint(ctx, id, anchor) {
  const x = X(ctx, anchor), y = Y(ctx, anchor);
  const cells = [];
  for (let k = 0; k < PROPS[id].foot; k++) cells.push(at(ctx, x + k, y));
  return cells;
}
function fits(ctx, id, anchor, on, { tight = false, onClear = false } = {}) {
  const cells = footprint(ctx, id, anchor);
  if (cells.some((i) => i < 0 || Y(ctx, i) !== Y(ctx, anchor))) return false;
  for (const i of cells) {
    const t = ctx.tiles[i];
    if (ctx.keep[i] || ctx.propTiles[i] || (ctx.clear[i] && !onClear)) return false;
    if (on ? !on.includes(t) : !TERRAIN[t].walk || TERRAIN[t].fixed) return false;
    if (!tight && around(ctx, i).some((j) => ctx.propTiles[j])) return false; // a gap of at least one tile between props
  }
  return true;
}
function put(ctx, id, anchor, flip) {
  for (const i of footprint(ctx, id, anchor)) ctx.propTiles[i] = id;
  ctx.props.push({ id, x: X(ctx, anchor), y: Y(ctx, anchor), w: PROPS[id].foot, flip });
}
const mirrorAnchor = (ctx, id, anchor) => ctx.R(anchor + PROPS[id].foot - 1);
/** Put a prop and its mirror image (both or neither). */
function putPair(ctx, id, anchor, flip, on = null, opts = {}) {
  const other = mirrorAnchor(ctx, id, anchor);
  if (other === anchor) { if (fits(ctx, id, anchor, on, opts)) { put(ctx, id, anchor, flip); return true; } return false; }
  const a = footprint(ctx, id, anchor), b = footprint(ctx, id, other);
  if (a.some((i) => b.includes(i)) || !fits(ctx, id, anchor, on, opts) || !fits(ctx, id, other, on, opts)) return false;
  put(ctx, id, anchor, flip);
  put(ctx, id, other, !flip);
  return true;
}
/** A normal distribution's share below x (fields are roughly normal): turns a field value into 0..1. */
function belowShare(x) {
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(x * x) / 2);
  return Math.max(0, Math.min(0.999999, 0.5 * (1 + (x >= 0 ? y : -y))));
}
/**
 * Which variety of a kind of prop grows at tile i: the theme's `varieties[kind]` ([[id, weight]]), chosen by a slow
 * field so neighbours mostly match (a birch copse, a mossy boulder field), with now and then a stray one.
 * Mirror images get the same variety (decided at the canonical tile near the starts).
 */
function varietyOf(ctx, kind, i) {
  const list = ctx.theme.varieties && ctx.theme.varieties[kind];
  if (!list || !list.length) return kind;
  if (list.length === 1) return list[0][0];
  const key = strKey(kind);
  const j = ctx.w[i] >= 1 ? canon(ctx, i) : i;
  const slow = (fbm((ctx.salt ^ key) | 0, X(ctx, j), Y(ctx, j), 11, 2) - 0.5) / 0.12; // about mean 0, spread 1
  const u = hash01(ctx.salt, key, j) < 0.07 ? hash01(ctx.salt, key + 1, j) : belowShare(slow);
  return pickWeighted(list, u);
}

function pickWeighted(list, u) {
  const total = list.reduce((s, [, w]) => s + w, 0);
  for (const [id, w] of list) { if ((u -= w / total) < 0) return id; }
  return list[list.length - 1][0];
}
/**
 * Scatter props: `list` = [[id, weight]], about `density` of the allowed tiles, in clumps (a field decides
 * where; on a big map whole regions are open or thick with them). Near the starts each prop has its mirror
 * image; elsewhere they fall freely.
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
    const id = varietyOf(ctx, pickWeighted(list, pickU), i);
    const flip = (zone ? symRand(ctx, key + 2, i) : hash01(ctx.salt, key + 2, i)) < 0.5;
    if (zone) {
      if (ctx.R(i) < i) continue; // decided with its mirror image, which came first
      putPair(ctx, id, i, flip, on);
    } else if (fits(ctx, id, i, on)) put(ctx, id, i, flip);
  }
}
/**
 * Ridges: lines of rocks, trees or columns packed tight, wandering across the map, each with a gap or two (a way
 * through), and the same line on the other side. They make chokepoints and places to hide behind. `list` =
 * [[id, weight]]; where a two-tile prop doesn't fit, the first one-tile prop of the list stands in.
 */
function ridges(ctx, list, count) {
  const { cols: W, rows: H, r } = ctx;
  const singles = list.map(([id]) => id).filter((id) => PROPS[id].foot === 1);
  for (let k = 0; k < count; k++) {
    let x = r.range(2, W - 3), y = r.range(2, H - 3), a = r.range(0, Math.PI * 2);
    const len = Math.round(r.range(8, 16) * Math.sqrt(ctx.big));
    const cells = [];
    for (let s = 0; s < len; s++) {
      const i = at(ctx, Math.round(x), Math.round(y));
      if (i < 0) break;
      if (!cells.includes(i)) cells.push(i);
      a += r.range(-0.35, 0.35); x += Math.cos(a); y += Math.sin(a);
    }
    const gaps = new Set();
    for (let g = Math.max(1, Math.floor(cells.length / 9)); g > 0; g--) {
      const g0 = r.int(1, Math.max(1, cells.length - 3));
      gaps.add(g0); gaps.add(g0 + 1);
    }
    cells.forEach((i, idx) => {
      if (gaps.has(idx) || ctx.propTiles[i]) return;
      const id = varietyOf(ctx, pickWeighted(list, r.f()), i);
      const flip = r.chance(0.5);
      if (putPair(ctx, id, i, flip, null, { tight: true })) return;
      // where it doesn't fit, a one-tile variety of the same kind, or the list's one-tile prop
      const kind = PROPS[id].kind;
      const small = ((ctx.theme.varieties && ctx.theme.varieties[kind]) || []).map(([v]) => v).find((v) => PROPS[v].foot === 1)
        || singles.map((k) => varietyOf(ctx, k, i)).find((v) => PROPS[v].foot === 1);
      if (small && small !== id) putPair(ctx, small, i, flip, null, { tight: true });
    });
  }
}
/** How many ridges a map gets: none on a small map, a few on a big one. */
const ridgeCount = (ctx, per = 1) => Math.round((ctx.big - 1) * per * ctx.r.range(0.75, 1.5));

// ---- keeping it playable ----

/**
 * Copy the ground round the left start onto the right start's (turned or mirrored), so the two are exactly alike.
 * (Rings and rims are decided by their neighbours, which can differ just outside the symmetric zone.)
 */
function symmetrize(ctx) {
  const a = ctx.starts[0];
  for (let i = 0; i < ctx.n; i++) {
    if (dist(ctx, i, a) > ctx.zone) continue;
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
  const k = ctx.props.findIndex((p) => p.y === Y(ctx, i) && X(ctx, i) >= p.x && X(ctx, i) < p.x + p.w);
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
    const i = heap.pop();
    const d = heap.lastKey;
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
/** Make sure an ordinary walker can get from one start to the other (opening the same way on both sides). */
function connect(ctx) {
  const [a, b] = ctx.starts;
  for (let round = 0; round < 6; round++) {
    const blocked = cheapestLine(ctx, a, b).filter((i) => !walkerOk(ctx, i));
    if (!blocked.length) return;
    for (const i of blocked) { carve(ctx, i); carve(ctx, ctx.R(i)); }
  }
}
/** Walker regions (4 ways): a label per tile (-1 = blocked) and each region's size. */
function walkerRegions(ctx) {
  const label = new Int32Array(ctx.n).fill(-1);
  const sizes = [];
  // a hidden room counts as joined: the player can break its cracked wall open
  const ok = (i) => walkerOk(ctx, i) || !!TERRAIN[ctx.tiles[i]].opens;
  for (let s = 0; s < ctx.n; s++) {
    if (label[s] >= 0 || !ok(s)) continue;
    const c = sizes.length;
    let size = 0;
    const stack = [s]; label[s] = c;
    while (stack.length) {
      const i = stack.pop(); size++;
      for (const j of around(ctx, i, N4)) if (label[j] < 0 && ok(j)) { label[j] = c; stack.push(j); }
    }
    sizes.push(size);
  }
  return { label, sizes };
}
/** Every walled-off area of POCKET tiles or more gets a way in from the starts' side (both sides alike). */
function connectRegions(ctx) {
  for (let round = 0; round < 4; round++) {
    const { label, sizes } = walkerRegions(ctx);
    const main = label[ctx.starts[0]];
    const lost = sizes.map((s, c) => (c !== main && s >= POCKET ? c : -1)).filter((c) => c >= 0);
    if (!lost.length) return;
    for (const c of lost) {
      const from = label.indexOf(c);
      for (const i of cheapestLine(ctx, from, ctx.starts[0]).filter((j) => !walkerOk(ctx, j))) { carve(ctx, i); carve(ctx, ctx.R(i)); }
    }
  }
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

/**
 * Decals: pebbles, leaves, shells, cracks... on the theme's grounds, sparse (`decalDensity` of the free ground
 * tiles), gathered in loose clusters, each kind in its own patches. Only looks: they block nothing, so they needn't
 * be fair. Returns [{ id, v (which cell of the strip), x, y (world px of the image's top-left), flip }], by y.
 */
function decorate(ctx) {
  const list = ctx.theme.decals || [];
  if (!list.length) return [];
  const density = ctx.theme.decalDensity ?? 0.08;
  const key = ctx.k++;
  // plain noise is enough here (decals needn't be fair): where they gather, and which kind gathers where
  const noise = (k, i, scale) => (fbm((ctx.salt ^ Math.imul(k, 0x9e3779b1)) | 0, X(ctx, i), Y(ctx, i), scale, 2) - 0.5) / 0.12;
  const free = (j) => j >= 0 && !ctx.propTiles[j] && paintable(ctx.tiles[j]);
  const nearAny = (i, ids) => {
    const x = X(ctx, i), y = Y(ctx, i);
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const j = at(ctx, x + dx, y + dy);
      if (j >= 0 && ids.includes(ctx.tiles[j])) return true;
    }
    return false;
  };
  const out = [];
  for (let i = 0; i < ctx.n; i++) {
    if (!free(i) || ctx.keep[i] && hash01(ctx.salt, key, i, 9) < 0.5) continue;
    if (hash01(ctx.salt, key, i) >= density * Math.max(0, Math.min(3, 1 + 1.3 * noise(key, i, 5)))) continue;
    const t = ctx.tiles[i];
    let best = null, bestScore = -Infinity;
    for (const [id, weight] of list) {
      const d = DECALS[id];
      const near = Array.isArray(d.near) ? d.near : d.near && d.near[t];
      if (!d.on.includes(t) || (near && !nearAny(i, near))) continue;
      const score = noise(strKey(id), i, 6) + Math.log(weight) + hash01(ctx.salt, key + 1, i, strKey(id)) * 0.6;
      if (score > bestScore) { bestScore = score; best = d; }
    }
    if (!best) continue;
    const roomy = around(ctx, i, N4).length === 4 && around(ctx, i, N4).every(free);
    const jx = roomy ? Math.floor(hash01(ctx.salt, key + 2, i) * 9) - 4 : 0;
    const jy = roomy ? Math.floor(hash01(ctx.salt, key + 3, i) * 9) - 4 : 0;
    out.push({
      id: best.id, v: hashN(ctx.salt, key + 4, i) % best.variants,
      x: X(ctx, i) * TILE + (TILE - best.size[0]) / 2 + jx, y: Y(ctx, i) * TILE + (TILE - best.size[1]) / 2 + jy,
      flip: hash01(ctx.salt, key + 5, i) < 0.5,
    });
  }
  return out.sort((a, b) => a.y - b.y || a.x - b.x);
}

/** Time for an ordinary walker to reach each tile from a start (4 ways), for sharing out the arena. */
function walkTimes(ctx, from) {
  const t = new Float64Array(ctx.n).fill(Infinity);
  t[from] = 0;
  const heap = new Heap(); heap.push(0, from);
  const cost = (i) => 1 / TERRAIN[ctx.tiles[i]].speed + TERRAIN[ctx.tiles[i]].burn * 25 + TERRAIN[ctx.tiles[i]].spikes * 40;
  while (heap.size) {
    const i = heap.pop();
    const d = heap.lastKey;
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

// ---- structures: walls, rooms and corridors (the village, dungeon and fortress themes) ----
// The owner (2026-11-08): "our generator would need to be able to understand things like structures, so things that
// the creature can move around in, like towers and buildings ... maps like the fortress allow the creatures to go
// through the corridors". A structure is a set of rectangles painted with walls and floors, always with its mirror
// image (both sides alike), and its tiles are marked `clear` so the ground patches, roads and scattered props that
// come after leave it alone. Walls never go within KEEP of a start. Corridors and doorways are at least as wide as a
// creature can pass (a creature collides with the map by a small radius at its feet: one tile is enough, two is
// comfortable; corridors are 2-3).

/** A rectangle's mirror image (the map turned 180 degrees or mirrored, as the theme's symmetry is). */
function mirrorRect(ctx, { x0, y0, w, h }) {
  return ctx.sym === "rotate" ? { x0: ctx.cols - x0 - w, y0: ctx.rows - y0 - h, w, h } : { x0: ctx.cols - x0 - w, y0, w, h };
}
const overlaps = (a, b, pad = 0) => a.x0 - pad < b.x0 + b.w && b.x0 - pad < a.x0 + a.w && a.y0 - pad < b.y0 + b.h && b.y0 - pad < a.y0 + a.h;
/** The tiles of a rectangle that are on the map. */
function rectTiles(ctx, { x0, y0, w, h }) {
  const out = [];
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) { const i = at(ctx, x, y); if (i >= 0) out.push(i); }
  return out;
}
/** Paint tile i, and its mirror image, as part of a structure (`mark`: keep later patches and props off it). A floor
 * replaces whatever was beneath (only the theme's ground shows round its edges); a wall keeps the floor it stands on
 * beneath it, once. */
function structTile(ctx, i, id, mark = true, mirror = true) {
  for (const j of mirror ? [i, ctx.R(i)] : [i]) {
    if (j < 0 || (harmful(id) && ctx.keep[j])) continue;
    setTile(ctx, j, id);
    const under = TERRAIN[id].walk ? [] : [...new Set(ctx.under[j] || [])].filter((t) => t !== id && t !== ctx.base).slice(-1);
    ctx.under[j] = under.length ? under : null;
    if (mark) ctx.clear[j] = 1;
  }
}
/** Floor over a whole rectangle (a corridor, a courtyard), with its mirror image; `over`: only over these grounds. */
function floorRect(ctx, rc, floor, mark = true, over = null, mirror = true) {
  for (const i of rectTiles(ctx, rc)) if (!over || over.includes(ctx.tiles[i])) structTile(ctx, i, floor, mark, mirror);
}
/**
 * A walled room on rectangle `rc`: `wall` round its edge (`thick` tiles), `floor` inside (null: the ground stays), and
 * openings in the wall: doors [{ side: "N" | "E" | "S" | "W", at: tiles along that side from its corner, len }].
 * Painted with its mirror image; a door's mirror image is a door too, so a room that is its own mirror image (one in
 * the middle) can name its doors on one side only. `mirror` false: this room alone (the Town Hall, whose mirror image
 * is the tavern: the same walls, another building). Each door's tile just outside goes in ctx.doors (for paths).
 */
function room(ctx, rc, wall, floor, doors = [], thick = 1, mark = true, mirror = true) {
  const { x0, y0, w, h } = rc;
  const open = new Set();
  for (const d of doors) {
    for (let k = 0; k < d.len; k++) for (let t = 0; t < thick; t++) {
      const x = d.side === "W" ? x0 + t : d.side === "E" ? x0 + w - 1 - t : x0 + d.at + k;
      const y = d.side === "N" ? y0 + t : d.side === "S" ? y0 + h - 1 - t : y0 + d.at + k;
      const i = at(ctx, x, y);
      if (i >= 0) { open.add(i); if (mirror) open.add(ctx.R(i)); }
    }
    const ox = d.side === "W" ? x0 - 1 : d.side === "E" ? x0 + w : x0 + d.at, oy = d.side === "N" ? y0 - 1 : d.side === "S" ? y0 + h : y0 + d.at;
    const o = at(ctx, ox, oy);
    if (o >= 0) { ctx.doors.push(o); if (mirror) ctx.doors.push(ctx.R(o)); }
  }
  for (const i of rectTiles(ctx, rc)) {
    const x = X(ctx, i), y = Y(ctx, i);
    const edge = x < x0 + thick || y < y0 + thick || x >= x0 + w - thick || y >= y0 + h - thick;
    if (edge && !open.has(i)) structTile(ctx, i, wall, mark, mirror);
    else if (floor) structTile(ctx, i, floor, mark, mirror);
  }
}
/** A door of rectangle rc as seen on its image turned 180 degrees (the tavern's door matching the Town Hall's). */
const turnDoor = (rc, d) => ({ side: { N: "S", S: "N", E: "W", W: "E" }[d.side], at: (d.side === "N" || d.side === "S" ? rc.w : rc.h) - d.at - d.len, len: d.len });
/** A roof over rectangle rc, and over its mirror image unless `mirror` is false. extras: [{ id, x }], x = its centre
 * in tiles from the roof's left (mirrored with it). */
function addRoof(ctx, rc, style, extras = [], mirror = true) {
  ctx.roofs.push({ x0: rc.x0, y0: rc.y0, w: rc.w, h: rc.h, style, extras });
  if (mirror) ctx.roofs.push({ ...mirrorRect(ctx, rc), style, extras: extras.map((e) => ({ ...e, x: rc.w - e.x })) });
}
/** A corridor `width` tiles wide from tile (ax, ay) to (bx, by): an L, along x first (or y first); `over`: it is cut
 * only through these grounds (a dungeon's corridors through the rock, not across the rooms' floors). */
function corridor(ctx, [ax, ay], [bx, by], width, floor, { yFirst = false, mark = true, over = null } = {}) {
  const half = Math.floor((width - 1) / 2);
  const legX = (y, x1, x2) => floorRect(ctx, { x0: Math.min(x1, x2) - half, y0: y - half, w: Math.abs(x2 - x1) + width, h: width }, floor, mark, over);
  const legY = (x, y1, y2) => floorRect(ctx, { x0: x - half, y0: Math.min(y1, y2) - half, w: width, h: Math.abs(y2 - y1) + width }, floor, mark, over);
  if (yFirst) { legY(ax, ay, by); legX(by, ax, bx); } else { legX(ay, ax, bx); legY(bx, ay, by); }
}
const centre = (rc) => [rc.x0 + Math.floor(rc.w / 2), rc.y0 + Math.floor(rc.h / 2)];
/**
 * Can a structure stand on rectangle `rc` (and its mirror image)? On the map with a `margin`, `fromStarts` tiles or more
 * from the starts, `pad` tiles or more from the rectangles in `taken`, on grounds in `on` (when given), off other
 * structures, and not on its own mirror image.
 */
function roomFits(ctx, rc, taken, { pad = 2, fromStarts = 4, margin = 1, on = null } = {}) {
  const { cols: W, rows: H } = ctx;
  if (rc.x0 < margin || rc.y0 < margin || rc.x0 + rc.w > W - margin || rc.y0 + rc.h > H - margin) return false;
  const m = mirrorRect(ctx, rc);
  if (overlaps(rc, m, pad) || taken.some((q) => overlaps(rc, q, pad) || overlaps(m, q, pad))) return false;
  for (const i of rectTiles(ctx, rc)) {
    if (Math.min(dist(ctx, i, ctx.starts[0]), dist(ctx, i, ctx.starts[1])) < fromStarts) return false;
    if (ctx.clear[i] || (on && !on.includes(ctx.tiles[i]))) return false;
  }
  return true;
}
/** Put a prop (and its mirror image) at tile (x, y) inside a structure; tries the next spots along the row if it doesn't fit. */
function placeProp(ctx, id, x, y, on, { flip = false, tries = 1, step = 1, tight = false } = {}) {
  for (let k = 0; k < tries; k++) {
    const i = at(ctx, x + k * step, y);
    if (i >= 0 && putPair(ctx, id, i, flip, on, { onClear: true, tight })) return true;
  }
  return false;
}
/** A prop at tile (x, y) without its mirror image (inside the Town Hall or the tavern, far from the starts). */
function placeOne(ctx, id, x, y, on, { flip = false, tries = 1, step = 1, tight = true } = {}) {
  for (let k = 0; k < tries; k++) {
    const i = at(ctx, x + k * step, y);
    if (i >= 0 && fits(ctx, id, i, on, { onClear: true, tight })) { put(ctx, id, i, flip); return true; }
  }
  return false;
}
/** Two props of the same footprint at a spot and at its mirror image: `a` here, `b` there (two shops' signs), or `a`
 * on both when the spot is near a start (where both sides must look alike). */
function putTwin(ctx, a, b, x, y, on) {
  const i = at(ctx, x, y);
  if (i < 0) return false;
  const near = Math.min(dist(ctx, i, ctx.starts[0]), dist(ctx, i, ctx.starts[1])) < 7;
  if (near || PROPS[a].foot !== PROPS[b].foot) return putPair(ctx, a, i, false, on, { onClear: true, tight: true });
  const j = mirrorAnchor(ctx, a, i);
  if (j === i || !fits(ctx, a, i, on, { onClear: true, tight: true }) || !fits(ctx, b, j, on, { onClear: true, tight: true })) return false;
  put(ctx, a, i, false);
  put(ctx, b, j, true);
  return true;
}

/** A village house: house walls, a wooden floor, a door on the side facing the middle (now and then a back door);
 * a bigger one has two rooms. A crate or barrel in a corner away from the door. */
function house(ctx, r, rc) {
  const { cols: W, rows: H } = ctx;
  const { x0, y0, w, h } = rc;
  const split = w >= 8 && h >= 5 && r.chance(0.6);
  const facesDown = y0 + h / 2 < H / 2;
  const len = w >= 7 ? 2 : 1;
  const doors = [{ side: facesDown ? "S" : "N", at: split ? 1 : Math.floor((w - len) / 2), len }];
  if (r.chance(0.45)) doors.push({ side: x0 + w / 2 < W / 2 ? "E" : "W", at: Math.floor((h - 1) / 2), len: 1 });
  room(ctx, rc, "house_wall", "wood_floor", doors);
  if (split) {
    // the wall between the two rooms, with a doorway two tiles tall
    const x = x0 + Math.floor(w / 2);
    const gap = y0 + 1 + r.int(0, Math.max(0, h - 4));
    for (let y = y0 + 1; y < y0 + h - 1; y++) if (y !== gap && y !== gap + 1) structTile(ctx, at(ctx, x, y), "house_wall");
  }
  const y = facesDown ? y0 + 1 : y0 + h - 2;
  placeProp(ctx, r.chance(0.5) ? "crate" : "barrel", x0 + w - 2, y, ["wood_floor"], { tries: 2, step: -1 });
  if (r.chance(0.5)) placeProp(ctx, "table", x0 + 1, facesDown ? y0 + h - 3 : y0 + 2, ["wood_floor"], { tries: 2, tight: true });
  addRoof(ctx, rc, r.chance(0.6) ? "thatch" : "shingle", r.chance(0.6) ? [{ id: "chimney", x: r.int(1, w - 2) + 0.5 }] : []);
}

/** A fenced garden: a fence round a patch of flowers or tall grass, with a gate. */
function garden(ctx, r, rc) {
  const crop = r.chance(0.5) ? "flowers" : "tall_grass";
  const side = r.pick(["N", "E", "S", "W"]);
  room(ctx, rc, "fence", crop, [{ side, at: 1, len: side === "N" || side === "S" ? Math.min(2, rc.w - 2) : 1 }]);
}

/** A path (`id`, on `on` grounds) from the tile outside each door to the nearest street (cobbles or `id`), both
 * sides alike; a door already on a street needs none. */
function doorPaths(ctx, id, on) {
  const done = new Set();
  const street = (i) => ctx.tiles[i] === "cobbles" || ctx.tiles[i] === id;
  const cost = new Float64Array(ctx.n).fill(Infinity), prev = new Int32Array(ctx.n).fill(-1);
  const touched = [];
  for (const d of ctx.doors) {
    if (done.has(d) || street(d)) continue;
    done.add(d); done.add(ctx.R(d));
    for (const i of touched) { cost[i] = Infinity; prev[i] = -1; }
    touched.length = 0;
    cost[d] = 0; touched.push(d);
    const heap = new Heap(); heap.push(0, d);
    let goal = -1;
    while (heap.size) {
      const i = heap.pop(), c = heap.lastKey;
      if (c > cost[i]) continue;
      if (street(i)) { goal = i; break; }
      if (c > 40) break;
      const x = X(ctx, i), y = Y(ctx, i);
      for (const [dx, dy] of N4) {
        const j = at(ctx, x + dx, y + dy);
        if (j < 0 || ctx.propTiles[j] || !(street(j) || (on.includes(ctx.tiles[j]) && !ctx.clear[j]))) continue;
        const nc = c + (ctx.tiles[j] === "tall_grass" || ctx.tiles[j] === "flowers" ? 1.3 : 1);
        if (nc < cost[j]) { if (cost[j] === Infinity) touched.push(j); cost[j] = nc; prev[j] = i; heap.push(nc, j); }
      }
    }
    for (let i = goal; i >= 0; i = prev[i]) for (const j of [i, ctx.R(i)]) if (on.includes(ctx.tiles[j]) && !ctx.clear[j] && !ctx.propTiles[j]) setTile(ctx, j, id);
  }
}

/** Things hung on walls (theme.wallDecor: [[ornament, [wall ids], share]]): on a wall tile whose face looks over open
 * floor, along a straight run (not at its end), at least 3 tiles apart. Looks only, so they needn't match. */
function wallOrnaments(ctx) {
  const list = ctx.theme.wallDecor || [];
  if (!list.length) return;
  const key = ctx.k++;
  const wallAt = (x, y) => { const j = at(ctx, x, y); return j >= 0 && !TERRAIN[ctx.tiles[j]].walk; };
  const used = [];
  for (let i = 0; i < ctx.n; i++) {
    const x = X(ctx, i), y = Y(ctx, i);
    const below = at(ctx, x, y + 1);
    if (below < 0 || !TERRAIN[ctx.tiles[below]].walk || WATERY.has(ctx.tiles[below]) || ctx.propTiles[below]) continue;
    if (!wallAt(x - 1, y) || !wallAt(x + 1, y) || !wallAt(x, y - 1)) continue;
    for (const [id, walls, share] of list) {
      if (!walls.includes(ctx.tiles[i]) || hash01(ctx.salt, key, i, strKey(id)) >= share) continue;
      if (used.some(([ux, uy]) => uy === y && Math.abs(ux - x) < 3)) break;
      used.push([x, y]);
      ctx.ornaments.push({ id, v: hashN(ctx.salt, key + 1, i) % ORNAMENTS[id].variants, x: x * TILE, y: y * TILE });
      break;
    }
  }
}

/** Is tile i open floor of a straight north-south corridor 2-4 tiles wide (rows y-2..y+2 all walled at the same
 * columns)? Returns the corridor's floor columns [x0, x1], or null. */
function corridorNS(ctx, i) {
  const x = X(ctx, i), y = Y(ctx, i);
  const floor = (cx, cy) => { const j = at(ctx, cx, cy); return j >= 0 && TERRAIN[ctx.tiles[j]].walk && !WATERY.has(ctx.tiles[j]) && !ctx.propTiles[j]; };
  if (!floor(x, y)) return null;
  let x0 = x, x1 = x;
  while (floor(x0 - 1, y) && x - x0 < 5) x0--;
  while (floor(x1 + 1, y) && x1 - x < 5) x1++;
  if (x1 - x0 + 1 < 2 || x1 - x0 + 1 > 4) return null;
  for (let dy = -2; dy <= 2; dy++) {
    for (let cx = x0; cx <= x1; cx++) if (!floor(cx, y + dy)) return null;
    if (floor(x0 - 1, y + dy) || floor(x1 + 1, y + dy)) return null;
  }
  return [x0, x1];
}
/** Swinging axes over `count` pairs of north-south corridors, both sides alike (the same swing), away from the starts. */
function axes(ctx, r, count) {
  const cand = [];
  for (let i = 0; i < ctx.n; i++) {
    if (ctx.R(i) < i || Math.min(dist(ctx, i, ctx.starts[0]), dist(ctx, i, ctx.starts[1])) < 7) continue;
    const span = corridorNS(ctx, i);
    if (span && X(ctx, i) === span[0] && corridorNS(ctx, ctx.R(i))) cand.push([i, span]);
  }
  const H = HAZARDS.axe;
  for (let made = 0; made < count && cand.length; ) {
    const [i, [x0, x1]] = cand.splice(r.int(0, cand.length - 1), 1)[0];
    const x = ((x0 + x1 + 1) / 2) * TILE, y = Y(ctx, i) * TILE + TILE / 2;
    if (ctx.hazards.some((h) => Math.hypot(h.x - x, h.y - y) < 10 * TILE)) continue;
    const period = Math.round(r.range(2.2, 2.8) * 10) / 10, phase = Math.round(r.range(0, 6.28) * 100) / 100;
    ctx.hazards.push({ kind: "axe", x, y, period, phase, reach: H.reach });
    ctx.hazards.push({ kind: "axe", x: ctx.cols * TILE - x, y: ctx.sym === "rotate" ? ctx.rows * TILE - y : y, period, phase, reach: H.reach });
    made++;
  }
}
/** Spike plates across corridors and in rooms, `count` pairs, away from the starts: a w x h patch of stone floor. */
function spikes(ctx, r, count) {
  for (let made = 0, tries = 0; made < count && tries < count * 200; tries++) {
    const i = at(ctx, r.int(1, ctx.cols - 3), r.int(1, ctx.rows - 3));
    if (Math.min(dist(ctx, i, ctx.starts[0]), dist(ctx, i, ctx.starts[1])) < (ctx.big > 1.5 ? 7 : 5)) continue;
    // across a corridor where one is found, else a square plate
    const span = corridorNS(ctx, i);
    const rc = span ? { x0: span[0], y0: Y(ctx, i), w: span[1] - span[0] + 1, h: 2 } : { x0: X(ctx, i), y0: Y(ctx, i), w: 2, h: 2 };
    const tiles = rectTiles(ctx, rc);
    const m = mirrorRect(ctx, rc);
    if (overlaps(rc, m, 2) || tiles.length !== rc.w * rc.h || !tiles.every((j) => ctx.tiles[j] === "stone_floor" && !ctx.propTiles[j] && !ctx.propTiles[ctx.R(j)])) continue;
    if (tiles.some((j) => around(ctx, j).some((k) => ctx.tiles[k] === "spikes"))) continue;
    if (ctx.hazards.some((h) => Math.hypot(h.x - (rc.x0 + rc.w / 2) * TILE, h.y - (rc.y0 + 1) * TILE) < 4 * TILE)) continue;
    for (const j of tiles) structTile(ctx, j, "spikes", false);
    made++;
  }
}
/**
 * Hidden rooms in the rock (`count` pairs): a small room, walled off, whose wall on one side is 2 tiles of cracked wall
 * right beside a corridor or room, which the player can break open. Inside: a spring, a chest, coins, a gargoyle.
 */
function hiddenRooms(ctx, r, count) {
  const { cols: W, rows: H } = ctx;
  const okOut = (j) => j >= 0 && TERRAIN[ctx.tiles[j]].walk && !WATERY.has(ctx.tiles[j]) && !ctx.propTiles[j] && ctx.tiles[j] !== "spikes";
  for (let made = 0, tries = 0; made < count && tries < 400; tries++) {
    const big = ctx.big > 1.5;
    const iw = big ? r.int(3, 5) : r.int(3, 4), ih = big ? r.int(3, 4) : 3;
    const rc = { x0: r.int(1, Math.max(1, W - iw - 3)), y0: r.int(1, Math.max(1, H - ih - 3)), w: iw + 2, h: ih + 2 };
    const m = mirrorRect(ctx, rc);
    if (overlaps(rc, m, 2) || !rectTiles(ctx, rc).every((i) => ctx.tiles[i] === "dungeon_wall" && ctx.tiles[ctx.R(i)] === "dungeon_wall")) continue;
    if (rectTiles(ctx, rc).some((i) => Math.min(dist(ctx, i, ctx.starts[0]), dist(ctx, i, ctx.starts[1])) < (big ? 6 : 4))) continue;
    let door = null;
    for (const side of ["N", "E", "S", "W"].sort(() => r.f() - 0.5)) {
      const len = side === "N" || side === "S" ? rc.w : rc.h;
      for (let a = 1; a + 1 <= len - 2 && !door; a++) {
        const outs = [a, a + 1].map((k) => {
          const x = side === "W" ? rc.x0 - 1 : side === "E" ? rc.x0 + rc.w : rc.x0 + k;
          const y = side === "N" ? rc.y0 - 1 : side === "S" ? rc.y0 + rc.h : rc.y0 + k;
          return at(ctx, x, y);
        });
        if (outs.every((j) => okOut(j) && okOut(ctx.R(j)))) door = { side, at: a };
      }
      if (door) break;
    }
    if (!door) continue;
    const inside = { x0: rc.x0 + 1, y0: rc.y0 + 1, w: iw, h: ih };
    floorRect(ctx, inside, "stone_floor", false);
    const cracks = [door.at, door.at + 1].map((k) => {
      const x = door.side === "W" ? rc.x0 : door.side === "E" ? rc.x0 + rc.w - 1 : rc.x0 + k;
      const y = door.side === "N" ? rc.y0 : door.side === "S" ? rc.y0 + rc.h - 1 : rc.y0 + k;
      structTile(ctx, at(ctx, x, y), "cracked_wall", false);
      return at(ctx, x, y);
    });
    // drawn covered with rock until its wall is broken (map.secrets)
    ctx.secrets.push({ ...inside, cracks }, { ...mirrorRect(ctx, inside), cracks: cracks.map((i) => ctx.R(i)) });
    // the treasure: a spring in one corner, a chest and coins in another, a gargoyle keeping watch
    const corner = (fx, fy) => at(ctx, inside.x0 + (fx ? inside.w - 1 : 0), inside.y0 + (fy ? inside.h - 1 : 0));
    const fx = r.chance(0.5);
    structTile(ctx, corner(fx, 1), "spring", false);
    const sp2 = at(ctx, X(ctx, corner(fx, 1)) + (fx ? -1 : 1), Y(ctx, corner(fx, 1)));
    structTile(ctx, sp2, "spring", false);
    const c = corner(!fx, 0);
    putPair(ctx, "chest", c, fx, ["stone_floor"], { onClear: true, tight: true });
    putPair(ctx, "statue_gargoyle", corner(fx, 0), !fx, ["stone_floor"], { onClear: true, tight: true });
    for (const j of [at(ctx, X(ctx, c) + (fx ? 1 : -1), Y(ctx, c)), at(ctx, X(ctx, c), Y(ctx, c) + 1)]) {
      for (const k of [j, ctx.R(j)]) {
        if (k < 0 || ctx.tiles[k] !== "stone_floor" || ctx.propTiles[k]) continue;
        ctx.decals.push({ id: "coins", v: hashN(ctx.salt, 77, k) % 4, x: X(ctx, k) * TILE, y: Y(ctx, k) * TILE, flip: hash01(ctx.salt, 78, k) < 0.5 });
      }
    }
    made++;
  }
}

/**
 * The village (the owner, 2026-11-09: "pathways, village farm, vending carts, fences, tavern, wells, village fountain,
 * Town Hall, shops"). A cobbled square in the middle round a fountain, with market stalls, carts, benches and lamp
 * posts; on a big map the Town Hall on its north side and the tavern on its south (the same walls turned round, so
 * the halves stay alike; two different buildings), shops by the square, houses with wells between them, fenced farms
 * with a barn and a scarecrow further out, gardens, and a path from every door to the streets. Every building has a
 * roof (faded while a creature is inside).
 */
function village(ctx, r) {
  const { cols: W, rows: H } = ctx;
  const big = ctx.big > 1.5;
  const GREEN = ["grass", "tall_grass", "flowers"];
  patch(ctx, "tall_grass", r.range(0.04, 0.07), 4);
  patch(ctx, "flowers", r.range(0.015, 0.03), 2.5, { on: ["grass", "tall_grass"] });
  const cx = Math.floor(W / 2), cy = Math.floor(H / 2); // the tile just past the middle (the middle is between tiles)
  // the square, its corners cut, and the fountain in the middle
  const sw = 2 * (big ? r.int(9, 11) : r.int(4, 5)), sh = 2 * (big ? r.int(6, 7) : 3);
  const sq = { x0: cx - sw / 2, y0: cy - sh / 2, w: sw, h: sh };
  for (const i of rectTiles(ctx, sq)) {
    const x = X(ctx, i), y = Y(ctx, i);
    if ((x === sq.x0 || x === sq.x0 + sw - 1) && (y === sq.y0 || y === sq.y0 + sh - 1)) continue;
    structTile(ctx, i, "cobbles");
  }
  const fw = big ? 4 : 2;
  floorRect(ctx, { x0: cx - fw / 2, y0: cy - fw / 2, w: fw, h: fw }, "fountain");
  ctx.ornaments.push({ id: "fountain", v: 0, x: cx * TILE - 16, y: cy * TILE + (big ? 10 : 6) - 48 });
  const taken = [sq];
  // the Town Hall and the tavern
  if (big) {
    const hw = 2 * r.int(6, 7), hh = r.int(8, 9);
    const hall = { x0: cx - hw / 2, y0: sq.y0 - hh, w: hw, h: hh };
    const tav = mirrorRect(ctx, hall);
    const doors = [{ side: "S", at: hw / 2 - 1, len: 2 }, { side: r.chance(0.5) ? "W" : "E", at: hh - 3, len: 1 }];
    room(ctx, hall, "hall_wall", "stone_floor", doors, 1, true, false);
    room(ctx, tav, "house_wall", "wood_floor", doors.map((d) => turnDoor(hall, d)), 1, true, false);
    taken.push(hall, tav);
    // the hall: a carpet from the door to the mayor's desk, bookcases, benches either side, banners
    const ix = hall.x0 + 1, iy = hall.y0 + 1, iw = hw - 2, ih = hh - 2;
    floorRect(ctx, { x0: cx - 1, y0: iy + 2, w: 2, h: ih - 1 }, "carpet", true, null, false);
    placeOne(ctx, "desk", cx - 1, iy + 1, ["stone_floor"]);
    placeOne(ctx, "shelf_books", ix, iy, ["stone_floor"]);
    placeOne(ctx, "shelf_books", ix + iw - 2, iy, ["stone_floor"]);
    placeOne(ctx, "banner", cx - 3, iy, ["stone_floor"]);
    placeOne(ctx, "banner", cx + 2, iy, ["stone_floor"]);
    for (let y = iy + 3; y < iy + ih - 1; y += 2) { placeOne(ctx, "bench", cx - 4, y, ["stone_floor"]); placeOne(ctx, "bench", cx + 2, y, ["stone_floor"]); }
    placeOne(ctx, "banner", cx - 3, sq.y0, ["cobbles"]);
    placeOne(ctx, "banner", cx + 2, sq.y0, ["cobbles"]);
    addRoof(ctx, hall, "slate", [{ id: "bell", x: hw / 2 }], false);
    // the tavern: the bar along the back wall with barrels behind it, tables, a sign by the door
    const tx = tav.x0 + 1, ty = tav.y0 + 1, tw = hw - 2, th = hh - 2;
    placeOne(ctx, "counter", tx + 1, ty + th - 3, ["wood_floor"]);
    placeOne(ctx, "barrel", tx, ty + th - 1, ["wood_floor"]);
    placeOne(ctx, "barrel", tx + 2, ty + th - 1, ["wood_floor"]);
    placeOne(ctx, "shelf", tx + 4, ty + th - 1, ["wood_floor"]);
    for (const [x, y] of [[tx + 1, ty + 1], [tx + tw - 3, ty + 1], [tx + tw - 4, ty + 3], [tx + tw - 3, ty + th - 2]]) placeOne(ctx, "table", x, y, ["wood_floor"]);
    placeOne(ctx, "sign_tavern", cx + 1, tav.y0 - 1, ["cobbles"]);
    placeOne(ctx, "barrel", cx - 3, tav.y0 - 1, ["cobbles"]);
    addRoof(ctx, tav, "shingle", [{ id: "chimney", x: 2.5 }, { id: "chimney", x: hw - 3.5 }], false);
  }
  // the market: stalls and vending carts round the fountain, benches, lamp posts at the corners
  const market = [["stall", 3], ["vendor_cart", 2]];
  for (let k = 0, tries = 0; k < (big ? r.int(3, 4) : 1) && tries < 60; tries++) {
    const x = r.int(sq.x0 + 1, sq.x0 + sw - 3), y = r.int(sq.y0 + 1, sq.y0 + sh - 2);
    if (Math.abs(x + 1 - cx) < fw / 2 + 2 && Math.abs(y - cy) < fw / 2 + 2) continue;
    const id = varietyOf(ctx, pickWeighted(market, r.f()), at(ctx, x, y));
    if (placeProp(ctx, id, x, y, ["cobbles"], { flip: r.chance(0.5) })) k++;
  }
  if (big) for (let k = 0, tries = 0; k < 2 && tries < 30; tries++) {
    if (placeProp(ctx, "bench", r.int(sq.x0 + 2, sq.x0 + sw - 4), r.chance(0.5) ? cy - fw / 2 - 2 : cy + fw / 2 + 1, ["cobbles"])) k++;
  }
  placeProp(ctx, "lamp_post", sq.x0 + 1, sq.y0 + 1, ["cobbles"]);
  placeProp(ctx, "lamp_post", sq.x0 + sw - 2, sq.y0 + 1, ["cobbles"]);
  // shops by the square (big map): a counter, shelves and wares, a sign by the door
  const SHOPS = { bakery: ["sign_bakery", "sacks"], potion: ["sign_potion", "crate"], smith: ["sign_smith", "anvil"] };
  const shops = big ? 2 : 0;
  for (let made = 0, tries = 0; made < shops && tries < 120; tries++) {
    const w = r.int(6, 7), h = r.int(5, 6);
    const above = r.chance(0.5);
    const rc = { x0: r.int(sq.x0 - w - 6, sq.x0 + 1), y0: above ? sq.y0 - h - r.int(0, 3) : sq.y0 + sh + r.int(0, 3), w, h };
    if (!roomFits(ctx, rc, taken, { pad: 1, fromStarts: 5, on: GREEN })) continue;
    taken.push(rc, mirrorRect(ctx, rc));
    const doorX = rc.x0 + w / 2 < cx ? w - 3 : 1; // the door at the end nearer the middle
    room(ctx, rc, "house_wall", "wood_floor", [{ side: above ? "S" : "N", at: doorX, len: 2 }]);
    const mine = r.pick(Object.keys(SHOPS));
    const other = r.pick(Object.keys(SHOPS).filter((k) => k !== mine));
    const back = above ? rc.y0 + 1 : rc.y0 + h - 2;
    putTwin(ctx, "shelf", "shelf", rc.x0 + w - 3, back, ["wood_floor"]);
    putTwin(ctx, SHOPS[mine][1], SHOPS[other][1], rc.x0 + 1, back, ["wood_floor"]);
    placeProp(ctx, "counter", rc.x0 + 1, above ? back + 1 : back - 1, ["wood_floor"], { tight: true, tries: 2 });
    putTwin(ctx, SHOPS[mine][0], SHOPS[other][0], rc.x0 + doorX + 2, above ? rc.y0 + h : rc.y0 - 1, null);
    addRoof(ctx, rc, "red", r.chance(0.5) ? [{ id: "chimney", x: w - 1.5 }] : []);
    made++;
  }
  // houses
  const place = (count, dims, make, pad, where = () => true) => {
    for (let made = 0, tries = 0; made < count && tries < count * 50; tries++) {
      const [w, h] = dims();
      const rc = { x0: r.int(1, Math.max(1, Math.floor(W / 2) - w - 1)), y0: r.int(1, Math.max(1, H - h - 1)), w, h };
      if (!where(rc) || !roomFits(ctx, rc, taken, { pad, fromStarts: 4, on: GREEN })) continue;
      taken.push(rc, mirrorRect(ctx, rc));
      make(rc);
      made++;
    }
  };
  // farms out at the edges: a fenced field of crops (or two), a scarecrow, a barn with hay, haystacks by the fence
  place(big ? 2 : 1, () => (big ? [r.int(8, 12), r.int(5, 7)] : [r.int(5, 6), 4]), (rc) => {
    const crop = r.chance(0.5) ? "wheat" : "farmland";
    room(ctx, rc, "fence", crop, [{ side: r.pick(["N", "S"]), at: 1, len: 2 }]);
    if (rc.w >= 9 && r.chance(0.6)) floorRect(ctx, { x0: rc.x0 + Math.floor(rc.w / 2), y0: rc.y0 + 1, w: Math.ceil(rc.w / 2) - 1, h: rc.h - 2 }, crop === "wheat" ? "farmland" : "wheat");
    placeProp(ctx, "scarecrow", rc.x0 + Math.floor(rc.w / 2) - 1, rc.y0 + Math.floor(rc.h / 2), ["wheat", "farmland"], { tries: 3 });
    placeProp(ctx, "haystack", rc.x0 + rc.w + 1, rc.y0 + 1, GREEN.concat("dirt"), { tries: 2 });
  }, 2, (rc) => rc.x0 + rc.w < W * 0.3);
  if (big) place(1, () => [r.int(6, 7), r.int(5, 6)], (rc) => {
    room(ctx, rc, "house_wall", "dirt", [{ side: rc.y0 + rc.h / 2 < H / 2 ? "S" : "N", at: Math.floor(rc.w / 2) - 1, len: 2 }]);
    placeProp(ctx, "haystack", rc.x0 + 1, rc.y0 + Math.floor(rc.h / 2) - 1, ["dirt"], { tight: true, tries: 2 });
    placeProp(ctx, "sacks", rc.x0 + rc.w - 2, rc.y0 + 1, ["dirt"], { tight: true, tries: 2, step: -1 });
    addRoof(ctx, rc, "thatch");
  }, 2, (rc) => rc.x0 + rc.w < W * 0.36);
  place(big ? r.int(3, 5) : 1, () => (big ? [r.int(7, 9), r.int(6, 7)] : [r.int(5, 6), r.int(4, 5)]), (rc) => house(ctx, r, rc), 2);
  place(big ? r.int(1, 2) : 0, () => [r.int(4, 6), r.int(4, 5)], (rc) => garden(ctx, r, rc), 1);
  // streets out to the edges, and a path from every door to them
  roads(ctx, "dirt", GREEN, 1);
  doorPaths(ctx, "dirt", GREEN);
  // nothing planted just south of a building: a tree there would stand up into the room when its roof fades
  for (const r of ctx.roofs) for (let y = r.y0 + r.h; y < r.y0 + r.h + 2; y++) for (let x = r.x0 - 1; x <= r.x0 + r.w; x++) {
    const i = at(ctx, x, y);
    if (i >= 0) ctx.clear[i] = 1;
  }
  // wells between the houses, and the rest of village life
  for (let k = 0, tries = 0; k < (big ? r.int(1, 2) : 0) && tries < 80; tries++) {
    const i = at(ctx, r.int(2, Math.floor(W / 2) - 3), r.int(2, H - 3));
    if (Math.min(dist(ctx, i, ctx.starts[0]), dist(ctx, i, ctx.starts[1])) < 5) continue;
    if (putPair(ctx, "well", i, r.chance(0.5), ["grass", "dirt"])) k++;
  }
  scatter(ctx, [["haystack", 0.6], ["cart", 0.8], ["barrel", 1.3], ["crate", 1.3], ["stump", 0.8]], r.range(0.008, 0.013), { on: ["grass", "dirt"] });
  scatter(ctx, [["tree", 3], ["bush", 2]], r.range(0.02, 0.035), { on: ["grass", "tall_grass"] });
}

/** The dungeon: solid rock everywhere, with a great hall in the middle, a room round each start and more rooms,
 * all joined by corridors (the nearest first, then a loop or two); pillars, statues, braziers, stores and caves. */
function dungeon(ctx, r) {
  const { cols: W, rows: H } = ctx;
  const big = ctx.big > 1.5;
  for (let i = 0; i < ctx.n; i++) setTile(ctx, i, "dungeon_wall");
  const wide = big ? 3 : 2;
  const dig = (rc, floor, ragged = false) => {
    const f = ragged ? field(ctx, 2) : null;
    for (const i of rectTiles(ctx, rc)) {
      const x = X(ctx, i), y = Y(ctx, i);
      // a cave's corners crumble a little
      const inX = Math.min(x - rc.x0, rc.x0 + rc.w - 1 - x), inY = Math.min(y - rc.y0, rc.y0 + rc.h - 1 - y);
      if (ragged && inX + inY < 2 && f[i] < 0.3) continue;
      structTile(ctx, i, floor, false);
    }
  };
  // the great hall, its own mirror image
  const hw = 2 * (big ? r.int(6, 8) : r.int(3, 4)), hh = 2 * (big ? r.int(4, 5) : r.int(2, 3));
  const hall = { x0: Math.floor((W - hw) / 2), y0: Math.floor((H - hh) / 2), w: hw, h: hh };
  dig(hall, "cobbles");
  // a room round each start
  const [sx, sy] = [X(ctx, ctx.starts[0]), Y(ctx, ctx.starts[0])];
  const sw = big ? r.int(9, 11) : 7, sh = Math.min(H - 2, big ? r.int(7, 9) : 6);
  const start = { x0: Math.max(1, Math.min(W - sw - 1, sx - Math.floor(sw / 2))), y0: Math.max(1, Math.min(H - sh - 1, sy - Math.floor(sh / 2))), w: sw, h: sh };
  dig(start, "stone_floor");
  // more rooms on the starts' side, each with its mirror image; on a big map at least one is a cave
  const rooms = [start];
  const taken = [hall, start, mirrorRect(ctx, start)];
  const want = big ? r.int(3, 5) : r.int(0, 1);
  let caves = 0;
  for (let tries = 0; rooms.length - 1 < want && tries < want * 40; tries++) {
    const w = r.int(6, big ? 12 : 7), h = r.int(5, big ? 9 : 6);
    const rc = { x0: r.int(1, Math.max(1, Math.floor(W / 2) - w - 1)), y0: r.int(1, Math.max(1, H - h - 1)), w, h };
    const m = mirrorRect(ctx, rc);
    if (rc.y0 + h > H - 1 || overlaps(rc, m, 3) || taken.some((q) => overlaps(rc, q, 3) || overlaps(m, q, 3))) continue;
    const cave = big && (caves === 0 && rooms.length === want ? true : r.chance(0.3));
    if (cave) caves++;
    rc.cave = cave;
    dig(rc, cave ? "cave_floor" : "stone_floor", cave);
    rooms.push(rc);
    taken.push(rc, m);
  }
  // corridors: each room joins the nearest room already joined (the hall first), then a loop or two
  const joined = [hall];
  const todo = [...rooms];
  while (todo.length) {
    let best = null;
    for (const p of todo) for (const q of joined) {
      const [px, py] = centre(p), [qx, qy] = centre(q);
      const d = Math.abs(px - qx) + Math.abs(py - qy);
      if (!best || d < best.d) best = { p, q, d };
    }
    corridor(ctx, centre(best.p), centre(best.q), wide, "stone_floor", { yFirst: r.chance(0.5), mark: false, over: ["dungeon_wall"] });
    joined.push(best.p);
    todo.splice(todo.indexOf(best.p), 1);
  }
  for (let k = big ? r.int(1, 2) : 0; k > 0 && rooms.length > 2; k--) {
    const a = r.pick(rooms), b = r.pick(rooms.filter((q) => q !== a));
    corridor(ctx, centre(a), centre(b), wide, "stone_floor", { yFirst: r.chance(0.5), mark: false, over: ["dungeon_wall"] });
  }
  // a damp floor here and there, and shadowy corners
  patch(ctx, "shadow", r.range(0.008, 0.02), 3, { on: ["stone_floor", "cave_floor", "cobbles"] });
  patch(ctx, "shallows", r.range(0.004, 0.01), 2.5, { on: ["stone_floor", "cave_floor"] });
  // the hall: two rows of pillars, a statue at each end, braziers in its corners
  const rowsAt = [hall.y0 + 1, hall.y0 + hall.h - 2];
  for (let x = hall.x0 + 2; x < hall.x0 + hall.w - 2; x += 3) for (const y of rowsAt) placeProp(ctx, "pillar", x, y, ["cobbles", "shadow"]);
  placeProp(ctx, "statue", hall.x0 + 1, hall.y0 + Math.floor(hall.h / 2) - 1, ["cobbles", "shadow"], { tries: 2, step: 1 });
  // every room: braziers in two corners; a store of barrels and crates now and then; a cave has stalagmites and boulders
  for (const rc of [hall, ...rooms]) {
    placeProp(ctx, "brazier", rc.x0 + 1, rc.y0 + 1, ["stone_floor", "cave_floor", "cobbles", "shadow"], { tries: 2 });
    placeProp(ctx, "brazier", rc.x0 + rc.w - 2, rc.y0 + rc.h - 2, ["stone_floor", "cave_floor", "cobbles", "shadow"], { tries: 2, step: -1 });
  }
  for (const rc of rooms.slice(1)) {
    if (rc.cave) {
      for (let k = 0; k < 3; k++) placeProp(ctx, k ? "stalagmite" : "boulder", rc.x0 + 2 + r.int(0, Math.max(0, rc.w - 5)), rc.y0 + 2 + r.int(0, Math.max(0, rc.h - 5)), ["cave_floor"]);
    } else if (r.chance(0.7)) {
      const y = rc.y0 + rc.h - 2;
      placeProp(ctx, "barrel", rc.x0 + 2, y, ["stone_floor", "shadow"], { tries: 2 });
      placeProp(ctx, "crate", rc.x0 + 4, y, ["stone_floor", "shadow"], { tries: 2 });
    }
  }
  if (!big) placeProp(ctx, "barrel", start.x0 + 1, start.y0 + start.h - 2, ["stone_floor", "shadow"], { tries: 2 });
  // knights guarding the hall, a cage or two in the rooms
  placeProp(ctx, "statue_knight", hall.x0 + hall.w - 2, hall.y0 + Math.floor(hall.h / 2) - 1, ["cobbles", "shadow"], { tries: 2, step: -1 });
  for (const rc of rooms.slice(1)) if (!rc.cave && r.chance(0.6)) placeProp(ctx, "cage", rc.x0 + rc.w - 3, rc.y0 + 1, ["stone_floor", "shadow"], { tries: 2, step: -1 });
  // traps and secrets: spike plates, swinging axes over the corridors, hidden rooms behind cracked walls
  spikes(ctx, r, big ? r.int(2, 4) : 1);
  axes(ctx, r, big ? r.int(1, 3) : 1);
  hiddenRooms(ctx, r, big ? r.int(1, 2) : 1);
}

/**
 * The fortress (a big map): a moat with bridges, curtain walls with a passage inside them all the way round, towers
 * at the corners that open onto the passage, gates on every side, a cobbled courtyard where the creatures start, and
 * a keep in the middle with doors on all four sides. On a small map: the keep alone, with corner towers.
 */
function fortress(ctx, r) {
  const { cols: W, rows: H } = ctx;
  const big = ctx.big > 1.5;
  const even = (n) => n - (n % 2);
  const keepW = even(big ? 2 * r.int(5, 6) : 10), keepH = even(big ? 2 * r.int(4, 5) : Math.min(H - 6, 10));
  const keep = { x0: Math.floor((W - keepW) / 2), y0: Math.floor((H - keepH) / 2), w: keepW, h: keepH };
  if (!big) {
    room(ctx, keep, "fort_wall", "stone_floor", [{ side: "W", at: keepH / 2 - 1, len: 2 }, { side: "N", at: keepW / 2 - 1, len: 2 }]);
    for (const [x, y] of [[keep.x0 - 1, keep.y0 - 1], [keep.x0 + keepW - 2, keep.y0 - 1]]) floorRect(ctx, { x0: x, y0: y, w: 3, h: 3 }, "fort_wall");
    placeProp(ctx, "statue", keep.x0 + 2, keep.y0 + 2, ["stone_floor"], { tries: 2 });
    placeProp(ctx, "brazier", keep.x0 + keepW - 3, keep.y0 + 2, ["stone_floor"], { tries: 2, step: -1 });
    floorRect(ctx, { x0: keep.x0, y0: keep.y0 + keepH / 2 - 1, w: keepW, h: 2 }, "carpet", true, ["stone_floor"]);
    addRoof(ctx, keep, "slate", [{ id: "flag", x: keepW / 2 }], false);
    road(ctx, "dirt", { on: ["grass", "tall_grass"] });
    return;
  }
  const t = 2, pass = 3;                       // the walls' thickness, the passage inside them
  const mx = Math.round(W * 0.19), my = Math.round(H * 0.14);
  const outer = { x0: mx, y0: my, w: W - 2 * mx, h: H - 2 * my };
  const inner = { x0: mx + t + pass, y0: my + t + pass, w: outer.w - 2 * (t + pass), h: outer.h - 2 * (t + pass) };
  const gate = 4;
  const gateW = { side: "W", at: even(outer.h - gate) / 2, len: gate }, gateN = { side: "N", at: even(outer.w - gate) / 2, len: gate };
  // the moat: two tiles of deep water round the walls (and the towers, which stand out three tiles), bridges at the gates
  for (let i = 0; i < ctx.n; i++) {
    const x = X(ctx, i), y = Y(ctx, i);
    const dx = Math.max(outer.x0 - x, x - (outer.x0 + outer.w - 1), 0), dy = Math.max(outer.y0 - y, y - (outer.y0 + outer.h - 1), 0);
    const d = Math.max(dx, dy);
    if (d < 5 || d > 6) continue;
    const atGateRow = y >= outer.y0 + gateW.at && y < outer.y0 + gateW.at + gate;
    const atGateCol = x >= outer.x0 + gateN.at && x < outer.x0 + gateN.at + gate;
    const bridge = (dx > 0 && dy === 0 && atGateRow) || (dy > 0 && dx === 0 && atGateCol);
    structTile(ctx, i, bridge ? "bridge" : "deep_water", false);
  }
  // the outer walls, the passage all the way round inside them
  room(ctx, outer, "fort_wall", "stone_floor", [gateW, gateN], t);
  // towers at the corners, opening onto the passage
  const towers = [{ x0: outer.x0 - 3, y0: outer.y0 - 3, w: 9, h: 9 }, { x0: outer.x0 + outer.w - 6, y0: outer.y0 - 3, w: 9, h: 9 }];
  for (const tw of towers) room(ctx, tw, "fort_wall", "stone_floor", [], t);
  for (const tw of towers) for (const i of rectTiles(ctx, tw)) {
    const x = X(ctx, i), y = Y(ctx, i);
    const inPassage = x >= outer.x0 + t && x < outer.x0 + outer.w - t && y >= outer.y0 + t && y < outer.y0 + outer.h - t
      && !(x >= inner.x0 && x < inner.x0 + inner.w && y >= inner.y0 && y < inner.y0 + inner.h);
    if (inPassage) structTile(ctx, i, "stone_floor");
  }
  // the inner walls and the courtyard: the gates' doors, and two more doors on each long side into the passage
  const q = Math.floor(inner.w / 4) - 1;
  room(ctx, inner, "fort_wall", "cobbles", [
    { side: "W", at: even(inner.h - gate) / 2, len: gate }, { side: "N", at: even(inner.w - gate) / 2, len: gate },
    { side: "N", at: q, len: 2 }, { side: "N", at: inner.w - q - 2, len: 2 },
  ], t);
  // the keep, with a door on every side
  room(ctx, keep, "fort_wall", "stone_floor", [{ side: "W", at: keepH / 2 - 1, len: 2 }], t);
  // the keep (the owner, 2026-11-09: "carpets, armories, swords/axes hung up with armor on stands, statues"): a red
  // carpet from the doors to the throne, gold armour either side of it, a weapon rack facing it (the throne's place
  // turned round); knights by the doors outside, braziers
  const kx = keep.x0 + keepW / 2;
  floorRect(ctx, { x0: keep.x0, y0: keep.y0 + keepH / 2 - 1, w: keepW, h: 2 }, "carpet", true, ["stone_floor"]);
  floorRect(ctx, { x0: kx - 1, y0: keep.y0 + t + 1, w: 2, h: keepH - 2 * t - 2 }, "carpet", true, ["stone_floor"]);
  putTwin(ctx, "throne", "weapon_rack", kx - 1, keep.y0 + t, ["stone_floor"]);
  placeProp(ctx, "armor_stand_gold", kx - 3, keep.y0 + t, ["stone_floor"], { tight: true });
  placeProp(ctx, "armor_stand_gold", kx + 2, keep.y0 + t, ["stone_floor"], { tight: true });
  placeProp(ctx, "statue_knight", keep.x0 - 2, keep.y0 + 1, ["cobbles"], { tries: 2, step: -1 });
  placeProp(ctx, "brazier", keep.x0 - 2, keep.y0 + keepH / 2 - 3, ["cobbles"], { tries: 1 });
  addRoof(ctx, keep, "slate", [{ id: "flag", x: keepW / 2 }], false);
  // the courtyard: wells, banners on the walls, carts, hay, barrels and crates in its corners
  const ix = inner.x0 + t, iy = inner.y0 + t, iw = inner.w - 2 * t, ih = inner.h - 2 * t;
  placeProp(ctx, "well", ix + Math.floor(iw / 2) - 7, iy + 2, ["cobbles"], { tries: 3 });
  for (let x = ix + 3; x < ix + iw - 3; x += 7) placeProp(ctx, "banner", x, iy, ["cobbles"]);
  placeProp(ctx, "cart", ix + 1, iy + 2, ["cobbles"], { tries: 3 });
  placeProp(ctx, "haystack", ix + 1, iy + 5, ["cobbles"], { tries: 3 });
  placeProp(ctx, "barrel", ix + iw - 2, iy + 1, ["cobbles"], { tries: 3, step: -1 });
  placeProp(ctx, "crate", ix + iw - 2, iy + 3, ["cobbles"], { tries: 3, step: -1 });
  placeProp(ctx, "brazier", ix + 1, iy + Math.floor(ih / 2) - 3, ["cobbles"], { tries: 2 });
  // in the towers: a barrel or crate
  // the towers are armouries: weapon racks and suits of armour; pointed roofs
  towers.forEach((tw, k) => {
    placeProp(ctx, k ? "weapon_rack_axes" : "weapon_rack", tw.x0 + t, tw.y0 + t, ["stone_floor"], { tries: 2, tight: true });
    placeProp(ctx, "armor_stand", tw.x0 + t + 3, tw.y0 + t, ["stone_floor"], { tries: 2, tight: true });
    placeProp(ctx, r.chance(0.5) ? "barrel" : "crate", tw.x0 + t, tw.y0 + tw.h - t - 1, ["stone_floor"], { tries: 2 });
    addRoof(ctx, tw, "tower");
  });
  // outside: roads from the gates to the edge of the map, trees, rocks and bushes on the grass
  for (const [a, b] of [[[1, outer.y0 + gateW.at + 1], [outer.x0 - 1, outer.y0 + gateW.at + 1]], [[outer.x0 + gateN.at + 1, 1], [outer.x0 + gateN.at + 1, outer.y0 - 1]]]) {
    for (const i of rectTiles(ctx, { x0: Math.min(a[0], b[0]), y0: Math.min(a[1], b[1]), w: Math.abs(b[0] - a[0]) + (a[0] === b[0] ? 2 : 1), h: Math.abs(b[1] - a[1]) + (a[1] === b[1] ? 2 : 1) })) {
      if (["grass", "tall_grass"].includes(ctx.tiles[i])) structTile(ctx, i, "dirt", false);
    }
  }
}

// ---------- themes ----------
// Each theme: its base ground, a light hint for the screen (day / night / dim / warm), how it is symmetric
// ("rotate" = turned 180 degrees, "mirror" = left-right, "either" = picked by the seed), what replaces blocked
// terrain when a way across must be opened (`carve`), the terrains and props it can use (`uses`, `props`; the
// tests check the maps keep to them), and `build`, which paints a map: ground patches, water, a landmark in the
// middle, roads, springs, ridges and scattered props.

export const THEMES = {
  meadow: {
    name: "Meadow", base: "grass", light: "day", sym: "either", carve: { deep_water: "bridge" },
    uses: ["grass", "tall_grass", "flowers", "dirt", "high", "mud", "shallows", "deep_water", "bridge", "spring"],
    props: ["tree", "bush", "boulder", "rock_big", "log", "stump"],
    varieties: {
      tree: [["tree", 3], ["tree_birch", 2], ["tree_autumn", 1.5], ["tree_fruit", 1.5], ["tree_willow", 1], ["tree_dead", 0.7],
        ["tree_round", 1.5], ["tree_tall", 1.2], ["tree_poplar", 1], ["tree_twisted", 0.8], ["tree_dead_broken", 0.6]],
      log: [["log_fallen", 1], ["log_mossy", 1]], stump: [["stump", 2], ["stump_big", 1], ["stump_mossy", 1]],
      boulder: [["boulder", 3], ["boulder_mossy", 2]], bush: [["bush", 3], ["bush_flower", 2]],
      rock_big: [["rock_big", 2], ["rock_big_flat", 1.5], ["rock_big_cluster", 1.5], ["rock_big_cracked", 1]],
    },
    decals: [["tuft", 3], ["pebbles", 2], ["flowers", 2], ["twigs", 1], ["leaves", 1], ["puddle", 0.7]],
    build(ctx, r) {
      const G = ctx.grow;
      const water = ctx.sym === "rotate" && r.chance(0.5) ? "river" : r.chance(0.75) ? "lake" : "none";
      patch(ctx, "high", r.range(0, 0.06), 5 * G, { whole: true });
      patch(ctx, "tall_grass", r.range(0.12, 0.2), 4);
      patch(ctx, "flowers", r.range(0.04, 0.08), 2.5, { on: ["grass", "tall_grass"] });
      if (water !== "river") {
        // a grassy hill in the middle, flowers round its foot
        const size = landmarkSize(ctx, r.range(2.2, 3));
        landmark(ctx, size, (i, d) => paintAt(ctx, i, d < size - 1.1 ? "high" : "flowers"));
      }
      if (water === "lake") lake(ctx, r.range(0.03, 0.06), 5 * G, { on: ["grass", "tall_grass", "flowers"] });
      else if (ctx.big > 1.5) lake(ctx, r.range(0.01, 0.025), 4 * G, { on: ["grass", "tall_grass", "flowers"] });
      if (water === "river") river(ctx, { core: "deep_water", bank: "shallows", width: r.int(1, 2), crossing: "bridge", crossings: r.int(1, 2) });
      patch(ctx, "mud", r.range(0, 0.04), 3, { on: ["grass"] });
      roads(ctx, "dirt", ["grass", "tall_grass", "flowers", "mud"]);
      if (ctx.big > 1.5) springs(ctx, r.int(1, Math.round(ctx.big))); else if (r.chance(0.4)) spring(ctx);
      ridges(ctx, [["rock_big", 1], ["boulder", 2], ["bush", 1]], ridgeCount(ctx));
      scatter(ctx, [["tree", 3], ["bush", 2], ["boulder", 1.5], ["rock_big", 1], ["log", 0.4], ["stump", 0.7]], r.range(0.03, 0.06), { on: ["grass", "tall_grass"] });
    },
  },
  forest: {
    name: "Forest", base: "grass", light: "day", sym: "either", carve: { deep_water: "bridge" },
    uses: ["grass", "forest_floor", "tall_grass", "flowers", "mud", "dirt", "shallows", "deep_water", "bridge", "spring"],
    props: ["tree", "pine", "bush", "mushroom", "boulder", "log", "stump"],
    varieties: {
      tree: [["tree", 3], ["tree_birch", 2], ["tree_autumn", 2], ["tree_tall", 2], ["tree_round", 1], ["tree_twisted", 1], ["tree_dead_tall", 0.7]],
      mushroom: [["mushroom", 2], ["mushroom_giant", 1.5]],
      pine: [["pine", 3], ["pine_tall", 2], ["pine_dead", 0.7]], log: [["log_fallen", 1], ["log_mossy", 1.5]],
      stump: [["stump", 1.5], ["stump_big", 1], ["stump_mossy", 1.5]],
      boulder: [["boulder_mossy", 3], ["boulder", 1]], bush: [["bush", 3], ["bush_flower", 1.5]],
    },
    decals: [["leaves", 3], ["twigs", 2], ["mushrooms", 2], ["pebbles", 1], ["tuft", 1], ["flowers", 1], ["puddle", 1]],
    build(ctx, r) {
      const G = ctx.grow;
      // a clearing in the middle: grass and flowers round a spring, a ring of giant mushrooms
      const size = landmarkSize(ctx, r.range(2.6, 3.4));
      landmark(ctx, size, (i, d, exact) => paintAt(ctx, i, exact < 1 ? "spring" : d > size - 1.4 ? "flowers" : "grass"));
      propRing(ctx, "mushroom", size + 0.8, r.int(2, 3));
      patch(ctx, "forest_floor", r.range(0.25, 0.4), 5);
      patch(ctx, "tall_grass", r.range(0.08, 0.14), 3.5);
      patch(ctx, "flowers", r.range(0.02, 0.05), 2.5, { on: ["grass", "forest_floor"] });
      patch(ctx, "mud", r.range(0.03, 0.06), 3, { on: ["grass", "forest_floor"] });
      if (ctx.sym === "rotate" && r.chance(0.75)) {
        if (r.chance(0.6)) river(ctx, { core: "shallows", bank: "mud", bankChance: 0.3, width: r.int(1, 2) });
        else river(ctx, { core: "deep_water", bank: "shallows", width: 1, crossing: "bridge", crossings: 2 });
      } else if (r.chance(0.5) || ctx.big > 1.5) lake(ctx, r.range(0.02, 0.04), 4 * G, { on: ["grass", "forest_floor", "tall_grass"] });
      roads(ctx, "dirt", ["grass", "forest_floor", "tall_grass", "flowers", "mud"]);
      if (ctx.big > 1.5) springs(ctx, r.int(0, Math.round(ctx.big) - 1)); else if (r.chance(0.35)) spring(ctx);
      ridges(ctx, [["pine", 2], ["tree", 1], ["bush", 1]], ridgeCount(ctx, 1.3));
      scatter(ctx, [["tree", 3], ["pine", 3], ["bush", 1.5], ["mushroom", 0.8], ["boulder", 0.8], ["log", 0.5], ["stump", 0.6]], r.range(0.09, 0.14),
        { on: ["grass", "forest_floor", "tall_grass"], scale: 5, clump: 1.6 });
    },
  },
  shore: {
    name: "Shore", base: "sand", light: "day", sym: "mirror", carve: { deep_water: "shallows" },
    uses: ["sand", "grass", "tall_grass", "shallows", "deep_water", "high", "mud"],
    props: ["palm", "boulder", "rock_big", "bush"],
    startRows(ctx) {
      ctx.seaLow = ctx.r.chance(0.5); // the sea along the bottom (or the top)
      const H = ctx.rows;
      return ctx.seaLow ? [Math.round(H * 0.17), Math.round(H * 0.45)] : [Math.round(H * 0.5), Math.round(H * 0.78)];
    },
    varieties: {
      palm: [["palm", 3], ["palm_small", 2]], bush: [["bush_dry", 1]],
      rock_big: [["rock_big", 2], ["rock_big_sandstone", 2], ["rock_big_flat", 1], ["rock_big_cluster", 1]],
    },
    decals: [["shells", 3], ["seaweed", 2], ["pebbles", 2], ["tuft", 1]],
    build(ctx, r) {
      const H = ctx.rows, G = ctx.grow;
      // a rocky outcrop in the middle of the beach, boulders round it
      const size = landmarkSize(ctx, r.range(1.6, 2.2));
      landmark(ctx, size, (i) => paintAt(ctx, i, "high"));
      propRing(ctx, "boulder", size + 1, r.int(2, 3));
      const toSea = (x, y) => ((ctx.seaLow ? y : H - 1 - y) / H - 0.5) * 5;
      const sea = field(ctx, 4 * G, { extra: toSea, whole: true });
      patch(ctx, "deep_water", r.range(0.16, 0.22), 0, { f: sea });
      despeckle(ctx, "deep_water", "shallows");
      ring(ctx, ["deep_water"], "shallows");
      ring(ctx, ["deep_water", "shallows"], "shallows", { chance: 0.45, on: ["sand"] });
      ring(ctx, ["shallows"], "mud", { chance: r.range(0, 0.3), on: ["sand"] });
      const land = field(ctx, 4 * G, { extra: (x, y) => -toSea(x, y), whole: true });
      patch(ctx, "grass", r.range(0.12, 0.22), 0, { f: land });
      patch(ctx, "tall_grass", r.range(0.03, 0.07), 3, { on: ["grass"] });
      patch(ctx, "shallows", r.range(0.01, 0.03), 2, { on: ["sand"] }); // rock pools
      patch(ctx, "high", r.range(0.03, 0.06), 3.5, { on: ["sand", "grass"] });
      ridges(ctx, [["rock_big", 1], ["boulder", 2]], ridgeCount(ctx, 0.7));
      scatter(ctx, [["palm", 2.5], ["boulder", 1.5], ["rock_big", 1], ["bush", 0.8]], r.range(0.025, 0.045), { on: ["sand", "grass", "shallows", "high"] });
    },
  },
  desert: {
    name: "Desert", base: "sand", light: "day", sym: "either",
    uses: ["sand", "dirt", "high", "grass", "flowers", "shallows", "spring"],
    props: ["cactus", "palm", "boulder", "rock_big", "tree", "bush"],
    varieties: {
      palm: [["palm", 2], ["palm_date", 2], ["palm_small", 1]], cactus: [["cactus", 3], ["cactus_round", 2]],
      rock_big: [["rock_big_sandstone", 3], ["rock_big", 1], ["rock_big_cracked", 1.5], ["rock_big_flat", 1], ["rock_big_cluster", 1]],
      tree: [["tree_dead", 1], ["tree_dead_broken", 0.7]], bush: [["bush_dry", 1]],
    },
    decals: [["crack", 2], ["pebbles", 2], ["bones", 1.5], ["tuft", 1], ["flowers", 0.5]],
    build(ctx, r) {
      const G = ctx.grow;
      patch(ctx, "dirt", r.range(0.08, 0.15), 4);
      patch(ctx, "high", r.range(0.06, 0.12), 6 * G, { on: ["sand", "dirt"], whole: true });
      // the oasis in the middle (and on a big map smaller ones, a pair at a time): a spring in a pool, ringed with
      // grass and flowers, palms round it
      const bloom = field(ctx, 2);
      const oasis = (cx, cy, scale) => {
        const pool = r.range(1.6, 2.6) * scale, green = r.range(3, 4.6) * scale;
        const f = field(ctx, 2.5);
        const d = (x, y) => Math.hypot(x - cx, (y - cy) * 1.2);
        for (let i = 0; i < ctx.n; i++) {
          const di = d(X(ctx, i), Y(ctx, i));
          if (di > green + 1.5) continue;
          for (const j of cx === (ctx.cols - 1) / 2 ? [i] : [i, ctx.R(i)]) {
            if (ctx.keep[j]) continue;
            if (di <= 1.0 * scale) setTile(ctx, j, "spring");
            else if (di <= pool + f[i] * 0.35) setTile(ctx, j, "shallows");
            else if (di <= green + f[i] * 0.6) { setTile(ctx, j, "grass"); if (bloom[j] > 0.6) setTile(ctx, j, "flowers"); }
          }
        }
        return { cx, cy, reach: green + 1.8 };
      };
      const oases = [oasis((ctx.cols - 1) / 2, (ctx.rows - 1) / 2, Math.sqrt(ctx.big) * 0.8 + 0.2)];
      for (let k = Math.round(ctx.big) - 1; k > 0; k--) {
        const p = farPoint(ctx);
        oases.push(oasis(X(ctx, p), Y(ctx, p), 0.6));
      }
      const mirrorOf = (x, y) => (ctx.sym === "rotate" ? [ctx.cols - 1 - x, ctx.rows - 1 - y] : [ctx.cols - 1 - x, y]);
      const nearOasis = (x, y) => oases.some((o) => [[o.cx, o.cy], mirrorOf(o.cx, o.cy)]
        .some(([ox, oy]) => Math.hypot(x - ox, (y - oy) * 1.2) <= o.reach));
      ridges(ctx, [["rock_big", 2], ["boulder", 1]], ridgeCount(ctx));
      scatter(ctx, [["palm", 1]], 0.22, { on: ["grass", "sand", "flowers"], near: nearOasis });
      scatter(ctx, [["cactus", 3], ["boulder", 1.5], ["rock_big", 1], ["bush", 1], ["tree", 0.5]], r.range(0.02, 0.035), { on: ["sand", "dirt"] });
    },
  },
  volcanic: {
    name: "Volcano", base: "ash", light: "warm", sym: "either",
    uses: ["ash", "lava", "coals", "high", "dirt"],
    props: ["obsidian", "rock_big", "boulder", "tree"],
    varieties: {
      obsidian: [["obsidian", 3], ["obsidian_big", 1.5]], rock_big: [["rock_big_cracked", 2], ["rock_big", 1], ["rock_big_cluster", 1]],
      tree: [["tree_charred", 1]],
    },
    decals: [["cinders", 3], ["crack", 2], ["pebbles", 1], ["bones", 1]],
    build(ctx, r) {
      const G = ctx.grow;
      // a crater in the middle: a lava pool ringed with coals, inside a rim of high ground
      const size = landmarkSize(ctx, r.range(2.4, 3.2));
      landmark(ctx, size, (i, d) => paintAt(ctx, i, d < size * 0.4 ? "lava" : d < size * 0.62 ? "coals" : "high"));
      patch(ctx, "high", r.range(0.08, 0.14), 5 * G, { whole: true });
      if (ctx.sym === "rotate" && r.chance(0.55)) {
        river(ctx, { core: "lava", bank: "coals", bankChance: 0.45, width: r.int(1, 2), crossing: "ash", crossings: 2 });
        if (ctx.big > 1.5) lake(ctx, r.range(0.02, 0.04), 4 * G, { core: "lava", rim: "coals", rimChance: 0.5, on: ["ash", "high"] });
      } else lake(ctx, r.range(0.05, 0.09), 4 * G, { core: "lava", rim: "coals", rimChance: 0.5, on: ["ash", "high"] });
      patch(ctx, "coals", r.range(0.03, 0.07), 2.5, { on: ["ash"] });
      roads(ctx, "dirt", ["ash"], 0.35);
      ridges(ctx, [["obsidian", 2], ["rock_big", 1]], ridgeCount(ctx));
      scatter(ctx, [["obsidian", 3], ["rock_big", 1.5], ["boulder", 1], ["tree", 0.7]], r.range(0.03, 0.05), { on: ["ash", "high", "dirt"] });
    },
  },
  cave: {
    name: "Crystal cave", base: "cave_floor", light: "dim", sym: "either", carve: { deep_water: "shallows" },
    uses: ["cave_floor", "crystals", "shadow", "shallows", "deep_water", "ice", "high"],
    props: ["crystal", "stalagmite", "boulder"],
    varieties: { crystal: [["crystal", 2], ["crystal_cluster", 2], ["crystal_pink", 1]] },
    decals: [["pebbles", 2], ["crack", 1.5], ["mushrooms", 1.5], ["puddle", 1]],
    build(ctx, r) {
      const G = ctx.grow;
      // a glowing crystal garden in the middle, crystal pillars round it
      const size = landmarkSize(ctx, r.range(2, 2.8));
      landmark(ctx, size, (i) => paintAt(ctx, i, "crystals"));
      propRing(ctx, "crystal", size + 0.8, r.int(2, 3));
      patch(ctx, "shadow", r.range(0.1, 0.16), 4.5);
      patch(ctx, "crystals", r.range(0.08, 0.14), 3.5, { on: ["cave_floor", "shadow"] });
      if (r.chance(0.6) || ctx.big > 1.5) lake(ctx, r.range(0.04, 0.08), 5 * G, { on: ["cave_floor", "shadow"] });
      else patch(ctx, "shallows", r.range(0.02, 0.04), 3);
      if (r.chance(0.5)) patch(ctx, "ice", r.range(0.03, 0.06), 3);
      patch(ctx, "high", r.range(0.04, 0.08), 5 * G, { whole: true });
      ridges(ctx, [["stalagmite", 3], ["boulder", 1]], ridgeCount(ctx, 1.3));
      scatter(ctx, [["crystal", 1]], 0.12, { on: ["crystals"], scale: 3 });
      scatter(ctx, [["stalagmite", 3], ["boulder", 1]], r.range(0.03, 0.05), { on: ["cave_floor", "shadow", "high"] });
    },
  },
  ruins: {
    name: "Ruins", base: "grass", light: "day", sym: "either", carve: { wall: "cobbles" },
    uses: ["grass", "cobbles", "wall", "tall_grass", "shadow", "flowers", "dirt"],
    props: ["pillar", "bush", "boulder", "tree", "rock_big", "log"],
    varieties: {
      boulder: [["boulder", 2], ["boulder_mossy", 2]],
      tree: [["tree_birch", 2], ["tree_dead", 2], ["tree_autumn", 1.5], ["tree_dead_broken", 1.2], ["tree_twisted", 1.2], ["tree_dead_tall", 0.8]],
      log: [["log_mossy", 2], ["log_fallen", 1]],
      bush: [["bush", 2], ["bush_flower", 1.5]], pillar: [["pillar", 3], ["pillar_fallen", 1.5]],
      rock_big: [["rock_big_flat", 1], ["rock_big_cluster", 1]],
    },
    decals: [["tuft", 2], ["pebbles", 2], ["flowers", 1.5], ["puddle", 1], ["crack", 1], ["bones", 0.7], ["twigs", 0.5]],
    build(ctx, r) {
      const { cols: W, rows: H } = ctx;
      patch(ctx, "tall_grass", r.range(0.08, 0.14), 4);
      patch(ctx, "shadow", r.range(0.04, 0.08), 3.5, { on: ["grass", "tall_grass"] });
      patch(ctx, "dirt", r.range(0.03, 0.06), 3);
      // a paved square in the middle, with columns round it
      const size = landmarkSize(ctx, r.range(2.2, 3.4));
      landmark(ctx, size, (i) => paintAt(ctx, i, "cobbles"));
      propRing(ctx, "pillar", size + 1.3, Math.round(r.int(2, 3) * Math.sqrt(ctx.big)));
      roads(ctx, "cobbles", ["grass", "tall_grass", "shadow", "dirt"], 0.7);
      // broken-down rooms, each with its mirror image on the other side
      const rooms = [];
      const want = r.int(1, 3) * Math.round(ctx.big);
      for (let tries = 0; rooms.length < want && tries < want * 8; tries++) {
        const w = r.int(4, 7), h = r.int(3, 5);
        const x0 = r.int(Math.max(1, Math.round(W * 0.05)), Math.max(Math.round(W * 0.15), Math.floor(W / 2) - w - 1)), y0 = r.int(1, H - 1 - h);
        if (rooms.some((q) => x0 < q.x0 + q.w + 2 && q.x0 < x0 + w + 2 && y0 < q.y0 + q.h + 2 && q.y0 < y0 + h + 2)) continue;
        rooms.push({ x0, y0, w, h });
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
            if (ctx.keep[j] || ctx.clear[j]) continue;
            if (edge && !doors.has(i)) { if (symRand(ctx, 11, i) < 0.8) setTile(ctx, j, "wall"); } else if (paved && !edge) setTile(ctx, j, "cobbles");
          }
        }
      }
      patch(ctx, "flowers", r.range(0.02, 0.05), 2.5, { on: ["grass"] });
      ridges(ctx, [["pillar", 1], ["boulder", 1], ["bush", 2]], ridgeCount(ctx, 0.6));
      scatter(ctx, [["bush", 2], ["boulder", 1], ["pillar", 1], ["tree", 0.8], ["rock_big", 0.5], ["log", 0.35]], r.range(0.02, 0.035), { on: ["grass", "tall_grass", "dirt"] });
    },
  },
  night: {
    name: "Night", base: "grass", light: "night", sym: "rotate", carve: { deep_water: "bridge" },
    uses: ["grass", "shadow", "flowers", "tall_grass", "shallows", "deep_water", "bridge", "spring"],
    props: ["tree", "mushroom", "boulder", "bush", "stump"],
    varieties: {
      tree: [["tree", 3], ["tree_birch", 1], ["tree_dead", 1], ["tree_willow", 1], ["tree_twisted", 1.5], ["tree_dead_tall", 1], ["tree_dead_broken", 0.8]],
      mushroom: [["mushroom", 2], ["mushroom_giant", 1.5]], stump: [["stump_mossy", 2], ["stump", 1]],
      boulder: [["boulder", 2], ["boulder_mossy", 2]], bush: [["bush", 2], ["bush_flower", 2]],
    },
    decals: [["tuft", 2], ["mushrooms", 2], ["flowers", 1.5], ["pebbles", 1], ["twigs", 1], ["leaves", 1], ["puddle", 1]],
    build(ctx, r) {
      const G = ctx.grow;
      // a moonlit glade in the middle: flowers round a spring, giant mushrooms round the edge
      const size = landmarkSize(ctx, r.range(2.4, 3.2));
      landmark(ctx, size, (i, d, exact) => paintAt(ctx, i, exact < 1 ? "spring" : "flowers"));
      propRing(ctx, "mushroom", size + 0.8, r.int(2, 3));
      patch(ctx, "shadow", r.range(0.15, 0.25), 4.5);
      patch(ctx, "tall_grass", r.range(0.08, 0.14), 4);
      patch(ctx, "flowers", r.range(0.04, 0.08), 2.5, { on: ["grass", "shadow"] });
      if (r.chance(0.7)) river(ctx, { core: "deep_water", bank: "shallows", width: r.int(1, 2), crossing: "bridge", crossings: r.int(1, 2) });
      else lake(ctx, r.range(0.03, 0.06), 5 * G, { on: ["grass", "shadow", "tall_grass", "flowers"] });
      if (ctx.big > 1.5) springs(ctx, r.int(1, Math.round(ctx.big))); else if (r.chance(0.6)) spring(ctx);
      ridges(ctx, [["tree", 2], ["boulder", 1]], ridgeCount(ctx));
      scatter(ctx, [["tree", 3], ["mushroom", 1.5], ["boulder", 1], ["bush", 1], ["stump", 0.6]], r.range(0.04, 0.07), { on: ["grass", "tall_grass", "shadow"] });
    },
  },
  snow: {
    name: "Snowfield", base: "snow", light: "day", sym: "either", carve: { deep_water: "shallows" },
    uses: ["snow", "ice", "deep_water", "shallows", "high"],
    props: ["pine", "boulder", "rock_big", "tree"],
    varieties: {
      pine: [["pine_snowy", 3], ["pine", 2], ["pine_tall", 1.5], ["pine_dead", 0.6]], tree: [["tree_bare_snowy", 1]], boulder: [["boulder", 2], ["boulder_ice", 1.5]],
      rock_big: [["rock_big", 1], ["rock_big_ice", 1.5], ["rock_big_flat", 1], ["rock_big_cluster", 1]],
    },
    decals: [["snowdrift", 3], ["pebbles", 1]],
    build(ctx, r) {
      const G = ctx.grow;
      // a frozen lake in the middle, with a hole or two in the ice
      const size = landmarkSize(ctx, r.range(2.6, 3.4));
      const holes = field(ctx, 2);
      landmark(ctx, size, (i, d) => paintAt(ctx, i, d < size - 1.5 && holes[i] > 1.1 && !ctx.keep[i] ? "deep_water" : "ice"));
      const ice = field(ctx, 4.5 * G, { whole: true });
      patch(ctx, "ice", r.range(0.1, 0.16), 0, { f: ice });
      patch(ctx, "deep_water", r.range(0.02, 0.035), 0, { on: ["ice"], f: ice }); // holes in the ice
      despeckle(ctx, "deep_water", "ice");
      ring(ctx, ["deep_water"], "shallows", { chance: 0.3, on: ["ice"] });
      if (r.chance(0.35)) river(ctx, { core: "deep_water", bank: "shallows", width: 1, crossing: "shallows", crossings: 2 });
      patch(ctx, "high", r.range(0.06, 0.12), 5 * G, { whole: true });
      ridges(ctx, [["pine", 2], ["boulder", 1], ["rock_big", 1]], ridgeCount(ctx));
      scatter(ctx, [["pine", 3], ["boulder", 1.5], ["rock_big", 1], ["tree", 0.8]], r.range(0.04, 0.07), { on: ["snow", "high"] });
    },
  },
  // ---- built places (the owner, 2026-11-08: "I want one to include a village ... a dungeon ... a fortress") ----
  village: {
    name: "Village", base: "grass", light: "day", sym: "rotate",
    carve: { house_wall: "wood_floor", hall_wall: "stone_floor", fence: "grass", fountain: "cobbles" },
    uses: ["grass", "tall_grass", "flowers", "dirt", "cobbles", "house_wall", "wood_floor", "fence", "hall_wall", "stone_floor", "carpet",
      "farmland", "wheat", "fountain"],
    props: ["well", "banner", "haystack", "cart", "barrel", "crate", "tree", "bush", "stump", "stall", "vendor_cart", "scarecrow",
      "sign_tavern", "sign_bakery", "sign_potion", "sign_smith", "lamp_post", "bench", "table", "counter", "shelf", "sacks", "anvil", "desk"],
    varieties: {
      tree: [["tree", 2], ["tree_fruit", 2], ["tree_round", 1.5], ["tree_poplar", 1]], bush: [["bush", 2], ["bush_flower", 1.5]],
      stump: [["stump", 1], ["stump_axe", 1]], stall: [["stall", 1], ["stall_cloth", 1], ["stall_bread", 1]],
      vendor_cart: [["vendor_cart", 1], ["vendor_cart_flowers", 1]], shelf: [["shelf", 1], ["shelf_books", 1]],
    },
    decals: [["straw", 2], ["rug", 1.5], ["tuft", 2], ["pebbles", 1.5], ["flowers", 1.5], ["puddle", 0.7]],
    build(ctx, r) { village(ctx, r); },
  },
  dungeon: {
    name: "Dungeon", base: "stone_floor", light: "dim", sym: "rotate", carve: { dungeon_wall: "stone_floor", cracked_wall: "stone_floor" },
    uses: ["stone_floor", "dungeon_wall", "cobbles", "cave_floor", "shadow", "shallows", "spikes", "cracked_wall", "spring"],
    props: ["pillar", "statue", "brazier", "barrel", "crate", "stalagmite", "boulder", "chest", "cage"],
    varieties: { statue: [["statue", 1], ["statue_gargoyle", 1], ["statue_knight", 1]] },
    decals: [["cobweb", 2], ["rubble", 2], ["crack", 1.5], ["bones", 1], ["puddle", 1]],
    wallDecor: [["chains", ["dungeon_wall"], 0.07], ["torch", ["dungeon_wall"], 0.05]],
    laid: ["coins"], // (decals it lays itself, not scattered: the hidden rooms' treasure)
    build(ctx, r) { dungeon(ctx, r); },
  },
  fortress: {
    name: "Fortress", base: "grass", light: "day", sym: "rotate", carve: { fort_wall: "stone_floor", deep_water: "bridge" },
    uses: ["grass", "tall_grass", "dirt", "cobbles", "stone_floor", "fort_wall", "deep_water", "bridge", "carpet"],
    props: ["banner", "brazier", "statue", "well", "cart", "haystack", "barrel", "crate", "tree", "boulder", "bush",
      "weapon_rack", "armor_stand", "throne"],
    varieties: {
      statue: [["statue", 1], ["statue_knight", 1]], weapon_rack: [["weapon_rack", 1], ["weapon_rack_axes", 1]],
      armor_stand: [["armor_stand", 1], ["armor_stand_gold", 1]], tree: [["tree", 2], ["tree_tall", 1], ["tree_round", 1]],
    },
    decals: [["tuft", 2], ["straw", 1.5], ["rubble", 1.5], ["pebbles", 1.5], ["crack", 1], ["puddle", 0.7]],
    wallDecor: [["weapons", ["fort_wall"], 0.08], ["torch", ["fort_wall"], 0.03]],
    // the creatures start in the courtyard, level with the keep's side doors
    startRows: (ctx) => { const cy = Math.round((ctx.rows - 1) / 2); return [cy - 3, cy + 3]; },
    build(ctx, r) {
      patch(ctx, "tall_grass", r.range(0.05, 0.09), 4);
      fortress(ctx, r);
      scatter(ctx, [["tree", 3], ["boulder", 1.5], ["bush", 2]], r.range(0.025, 0.04), { on: ["grass", "tall_grass"] });
    },
  },
};
for (const [id, t] of Object.entries(THEMES)) {
  t.id = id;
  t.varieties ||= {};
  t.decals ||= [];
  // every prop the theme can show: its kinds, and their varieties (a kind with varieties shows only those)
  const kinds = t.props;
  t.props = [...new Set(kinds.flatMap((k) => (t.varieties[k] ? t.varieties[k].map(([v]) => v) : [k])))];
}
export const THEME_IDS = Object.keys(THEMES);

/**
 * A random arena. Same seed (and options) = same map. `theme` is picked from the seed when not given.
 * Returns { seed, theme, cols, rows, width, height, base, light, symmetry, tiles, propTiles, under, props, decals, roofs,
 * ornaments, hazards, secrets (hidden rooms: { x0, y0, w, h, cracks: their walls' cracked tiles }), starts }
 * (`under`: per tile, the grounds a patch was painted over, bottom to top, or null; drawLayers reads it).
 */
export function generateMap(seed, { theme = null, cols = 90, rows = 54 } = {}) {
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
    connectRegions(ctx);
    extendBridges(ctx);
    wallOrnaments(ctx);
    const decals = [...decorate(ctx), ...ctx.decals].sort((a, b) => a.y - b.y || a.x - b.x);
    const [a, b] = ctx.starts;
    const pt = (i) => tileCenter(X(ctx, i), Y(ctx, i));
    map = {
      seed, seedNum, theme: themeId, cols, rows, width: cols * TILE, height: rows * TILE, base: ctx.base,
      light: ctx.theme.light, symmetry: ctx.sym, attempt,
      tiles: ctx.tiles, propTiles: ctx.propTiles, under: ctx.under,
      props: ctx.props.sort((p, q) => p.y - q.y || p.x - q.x), decals,
      roofs: ctx.roofs, ornaments: ctx.ornaments.sort((a, b) => a.y - b.y || a.x - b.x), hazards: ctx.hazards, secrets: ctx.secrets,
      starts: { me: pt(a), foe: pt(b) },
    };
    if (fairness(map).ok) break;
  }
  return map;
}
