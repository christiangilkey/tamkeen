// Fishing's content as data, with no code that runs (fishing.js has the rules, fishing-ui.js the pond): the six
// ponds, one per element, the nine kinds of fish in each, the rods, and what a catch is worth at each of the ten
// tiers (loot.js TIERS: Common to Eternal). data.js lists the fish pictures in artFiles() from here, so this file
// imports nothing.

/**
 * The ponds, one per element (data.TYPES ids). A creature fishing in its own element's water is luckier (HOME_LUCK).
 *   scene  the habitat backdrop behind the water (habitat/<scene>/*.png)
 *   water  the water's colours: deep, middle, light, and the glint on ripples
 *   open   what opens a pond: gym leaders beaten OR fish caught (either one); null = open from the start
 */
export const PONDS = [
  { id: "tide", name: "Neon lagoon", scene: "shore", water: ["#071a33", "#0d3358", "#17618c", "#5ce1ff"], open: null },
  { id: "grove", name: "Lily pond", scene: "forest", water: ["#06201a", "#0d3b2c", "#17664a", "#7dffb8"], open: null },
  { id: "ember", name: "Hot spring", scene: "oasis", water: ["#2a0d18", "#4d1722", "#8a2f2a", "#ffb35c"], open: { gyms: 1, caught: 30 } },
  { id: "spark", name: "Storm lake", scene: "meadow", water: ["#0e1030", "#1a2152", "#2d3f8f", "#ffe466"], open: { gyms: 2, caught: 80 } },
  { id: "stone", name: "Crystal cave", scene: "oasis", water: ["#101118", "#1d1f2c", "#34384f", "#a6f0ff"], open: { gyms: 4, caught: 160 } },
  { id: "dusk", name: "Moon pool", scene: "forest", water: ["#140a26", "#241448", "#40287a", "#ff9cf0"], open: { gyms: 6, caught: 300 } },
];
export const pondById = (id) => PONDS.find((p) => p.id === id) || PONDS[0];

/**
 * The fish: nine in each pond (the owner, 2026-11-25: "lots more types of fish, a few being much more rare than
 * others and cooler"). Small (1), middling (2) and big (3): bigger shadows are mostly the bigger fish.
 *   rare      how often it is the one of its size: 0 the usual one (no `rare`), 1 now and then, 2 seldom (KIND_WEIGHT)
 *   guardian  the pond's guardian, one per element: hardly ever there at all (GUARDIAN_ODDS), whatever the size
 *   cm        how long a Common one is, shortest and longest; each tier up adds TIER_GROWTH of that
 *   art       fish/<id>.png, drawn facing right (w x h)
 * A kind is only which fish it is: what a catch is worth (coins, pearls) comes from its tier alone, so a rare kind
 * or a guardian pays nothing more than the usual fish of the same tier.
 */
export const FISH = [
  { id: "guppy", pond: "tide", size: 1, name: "Bubble guppy", cm: [3, 6] },
  { id: "clownfish", pond: "tide", size: 2, name: "Neon clownfish", cm: [8, 14] },
  { id: "ray", pond: "tide", size: 3, name: "Tide ray", cm: [40, 90] },
  { id: "seahorse", pond: "tide", size: 1, rare: 1, name: "Neon seahorse", cm: [4, 9] },
  { id: "goby", pond: "tide", size: 1, rare: 2, name: "Pearl goby", cm: [3, 6] },
  { id: "tang", pond: "tide", size: 2, rare: 1, name: "Wave tang", cm: [15, 28] },
  { id: "lionfish", pond: "tide", size: 2, rare: 2, name: "Coral lionfish", cm: [20, 38] },
  { id: "marlin", pond: "tide", size: 3, rare: 1, name: "Surf marlin", cm: [150, 320] },
  { id: "leviathan", pond: "tide", size: 3, guardian: true, name: "Tide leviathan", cm: [300, 600] },
  { id: "minnow", pond: "grove", size: 1, name: "Leaf minnow", cm: [4, 8] },
  { id: "koi", pond: "grove", size: 2, name: "Lotus koi", cm: [30, 60] },
  { id: "pike", pond: "grove", size: 3, name: "Moss pike", cm: [50, 110] },
  { id: "betta", pond: "grove", size: 1, rare: 1, name: "Petal betta", cm: [4, 7] },
  { id: "tadpole", pond: "grove", size: 1, rare: 2, name: "Sprout tadpole", cm: [2, 5] },
  { id: "perch", pond: "grove", size: 2, rare: 1, name: "Reed perch", cm: [15, 35] },
  { id: "catfish", pond: "grove", size: 2, rare: 2, name: "Fern catfish", cm: [25, 60] },
  { id: "sturgeon", pond: "grove", size: 3, rare: 1, name: "Willow sturgeon", cm: [90, 220] },
  { id: "bloom_dragon", pond: "grove", size: 3, guardian: true, name: "Bloom dragon", cm: [200, 400] },
  { id: "tetra", pond: "ember", size: 1, name: "Ember tetra", cm: [3, 5] },
  { id: "puffer", pond: "ember", size: 2, name: "Magma puffer", cm: [15, 30] },
  { id: "gar", pond: "ember", size: 3, name: "Lava gar", cm: [60, 140] },
  { id: "cinder_goby", pond: "ember", size: 1, rare: 1, name: "Cinder goby", cm: [4, 8] },
  { id: "flame_betta", pond: "ember", size: 1, rare: 2, name: "Flame betta", cm: [4, 7] },
  { id: "snapper", pond: "ember", size: 2, rare: 1, name: "Scorch snapper", cm: [30, 60] },
  { id: "smoke_catfish", pond: "ember", size: 2, rare: 2, name: "Smoke catfish", cm: [25, 55] },
  { id: "arowana", pond: "ember", size: 3, rare: 1, name: "Furnace arowana", cm: [60, 120] },
  { id: "phoenix_fish", pond: "ember", size: 3, guardian: true, name: "Phoenix fish", cm: [120, 240] },
  { id: "danio", pond: "spark", size: 1, name: "Zap danio", cm: [3, 6] },
  { id: "angelfish", pond: "spark", size: 2, name: "Neon angelfish", cm: [12, 20] },
  { id: "eel", pond: "spark", size: 3, name: "Volt eel", cm: [80, 200] },
  { id: "static_shrimp", pond: "spark", size: 1, rare: 1, name: "Static shrimp", cm: [2, 5] },
  { id: "killifish", pond: "spark", size: 1, rare: 2, name: "Glint killifish", cm: [3, 7] },
  { id: "thunder_perch", pond: "spark", size: 2, rare: 1, name: "Thunder perch", cm: [18, 40] },
  { id: "plasma_lionfish", pond: "spark", size: 2, rare: 2, name: "Plasma lionfish", cm: [20, 38] },
  { id: "swordfish", pond: "spark", size: 3, rare: 1, name: "Storm swordfish", cm: [150, 300] },
  { id: "volt_kirin", pond: "spark", size: 3, guardian: true, name: "Volt kirin", cm: [150, 300] },
  { id: "loach", pond: "stone", size: 1, name: "Pebble loach", cm: [6, 12] },
  { id: "trout", pond: "stone", size: 2, name: "Crystal trout", cm: [30, 60] },
  { id: "coelacanth", pond: "stone", size: 3, name: "Fossil coelacanth", cm: [120, 200] },
  { id: "quartz_crab", pond: "stone", size: 1, rare: 1, name: "Quartz crab", cm: [3, 8] },
  { id: "opal_tetra", pond: "stone", size: 1, rare: 2, name: "Opal tetra", cm: [3, 5] },
  { id: "slate_catfish", pond: "stone", size: 2, rare: 1, name: "Slate catfish", cm: [25, 55] },
  { id: "cichlid", pond: "stone", size: 2, rare: 2, name: "Amethyst cichlid", cm: [12, 25] },
  { id: "iron_sturgeon", pond: "stone", size: 3, rare: 1, name: "Iron sturgeon", cm: [100, 240] },
  { id: "geode_whale", pond: "stone", size: 3, guardian: true, name: "Geode whale", cm: [400, 800] },
  { id: "moonfish", pond: "dusk", size: 1, name: "Moonfish", cm: [10, 20] },
  { id: "angler", pond: "dusk", size: 2, name: "Lantern angler", cm: [20, 45] },
  { id: "ghost_koi", pond: "dusk", size: 3, name: "Ghost koi", cm: [50, 100] },
  { id: "twilight_tetra", pond: "dusk", size: 1, rare: 1, name: "Twilight tetra", cm: [3, 5] },
  { id: "wisp_jelly", pond: "dusk", size: 1, rare: 2, name: "Wisp jelly", cm: [4, 10] },
  { id: "shadow_betta", pond: "dusk", size: 2, rare: 1, name: "Shadow betta", cm: [10, 18] },
  { id: "discus", pond: "dusk", size: 2, rare: 2, name: "Eclipse discus", cm: [12, 22] },
  { id: "nebula_shark", pond: "dusk", size: 3, rare: 1, name: "Nebula shark", cm: [120, 260] },
  { id: "moon_seraph", pond: "dusk", size: 3, guardian: true, name: "Moon seraph", cm: [180, 360] },
];
export const fishById = (id) => FISH.find((f) => f.id === id) || null;
/** Is this fish a pond's guardian? */
export const isGuardian = (id) => !!(fishById(id) || {}).guardian;
/** A pond's fish: the small ones first, the usual one of each size before the rarer ones, the guardian last. */
export const fishOf = (pond) => FISH.filter((f) => f.pond === pond)
  .sort((a, b) => (a.guardian ? 1 : 0) - (b.guardian ? 1 : 0) || a.size - b.size || (a.rare || 0) - (b.rare || 0));
/** Among the fish of one size, how likely each is, by its `rare` (the usual one, now and then, seldom). */
export const KIND_WEIGHT = [70, 24, 6];
/** The chance that a shadow is the pond's guardian, by the shadow's class (see SHADOWS): 1 in 800 for a practice
 * word, 1 in 400 for a due one, 1 in 200 for an often-missed one, 1 in 50 for a boss word. */
export const GUARDIAN_ODDS = { s: 1 / 800, m: 1 / 400, l: 1 / 200, boss: 1 / 50 };
/** Every fish picture is this size (scene pixels), facing right. */
export const FISH_ART = [24, 16];

/** Each tier up makes a fish this share longer (an Eternal is 1.54 times a Common's length). */
export const TIER_GROWTH = 0.06;

/** Coins a fish sells for, by tier (Common to Eternal). */
export const SELL = [1, 1, 2, 4, 8, 15, 25, 40, 60, 100];
/** How many tiers there are (loot.js TIERS; a test checks they agree). */
export const TIER_COUNT = SELL.length;
/** Fish an aquarium holds. */
export const TANK_SIZE = 6;
/** The aquariums, bought with pearls (like the rods): each holds more fish (the owner, 2026-11-16). The first is free.
 * Friends see the best TANK_SIZE of them, whatever the size (the online check, supabase/v9-fishing.sql, allows six). */
export const TANKS = [
  { id: "small", name: "Small tank", size: 6, pearls: 0 },
  { id: "big", name: "Big tank", size: 9, pearls: 15 },
  { id: "reef", name: "Reef tank", size: 12, pearls: 40 },
  { id: "grand", name: "Grand aquarium", size: 18, pearls: 100 },
];
/** Pearls found in a fish when it is landed, by tier. A share below 1 is a chance of one. */
export const PEARLS = [0, 0, 0.25, 1, 2, 3, 5, 8, 12, 20];

/** The rods, bought with pearls: each makes every cast luckier (a factor on the roll's luck, loot.js). */
export const RODS = [
  { id: "twig", name: "Twig rod", pearls: 0, luck: 1, line: "#d8d0c0" },
  { id: "bamboo", name: "Bamboo rod", pearls: 10, luck: 1.1, line: "#e8f0a0" },
  { id: "neon", name: "Neon rod", pearls: 30, luck: 1.2, line: "#5ce1ff" },
  { id: "star", name: "Star rod", pearls: 80, luck: 1.35, line: "#ffd75c" },
];

/** A creature fishing its own element's pond (the active creature's type = the pond's id). */
export const HOME_LUCK = 1.25;
/** A due word missed at least as often as it was got right: a bigger shadow, and this much luckier. */
export const HARD_LUCK = 1.25;

/**
 * The shadows in the water, by what their word is. `len` is the shadow's length in scene pixels; `kinds` the
 * chance of each size of fish (small, middling, big); which fish of that size is KIND_WEIGHT.
 *   s     practice: a word that isn't due (a lower roll: loot.js `extra`)
 *   m     a word due for review
 *   l     a due word that is often missed
 *   boss  a boss word (loot.js isBoss: missed on several days)
 */
export const SHADOWS = {
  s: { len: 11, kinds: [70, 25, 5] },
  m: { len: 16, kinds: [35, 50, 15] },
  l: { len: 22, kinds: [10, 40, 50] },
  boss: { len: 30, kinds: [0, 0, 100] },
};
