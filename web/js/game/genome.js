// A creature is data first: a seed plus what has changed since it was born. Everything about
// its look is rebuilt from that, so saves stay tiny and the same seed is always the same creature.

import { BACKS, BRANCHES, BRANCH_IDS, EARS, EYES, HORNS, PATTERNS, SPECIES_IDS, STAGES, TAILS, TRAITS, TYPES, TYPE_IDS } from "./data.js";

/** A small seeded random-number generator (mulberry32). One per creature, never the global one. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pick from a list of {id, weight?, weight_by?}, biased by trait values (0..1). */
export function weightedPick(list, rand, traits = {}) {
  const weights = list.map((item) => {
    let w = item.weight || 1;
    for (const [trait, k] of Object.entries(item.weight_by || {})) w *= 1 + k * (traits[trait] || 0);
    return w;
  });
  let roll = rand() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < list.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return list[i];
  }
  return list[list.length - 1];
}

export function newGenome(seed, type = null) {
  const r = rng(seed ^ 0x9e3779b9);
  return {
    seed: seed >>> 0,
    type: type && TYPES[type] ? type : TYPE_IDS[Math.floor(r() * TYPE_IDS.length)],
    growth: 0,
    traits: Object.fromEntries(TRAITS.map((t) => [t, 0])),
    branch: null,       // fixed the moment the creature becomes an adult
    equipped: {},
    name: "",
  };
}

export function stageOf(growth) {
  let stage = STAGES[0];
  for (const s of STAGES) if (growth >= s.from) stage = s;
  return stage;
}

/** The adult form a creature would take right now: the habit its owner has leaned on most.
 * Ties and untouched traits fall back on the seed, so every creature still has a destiny. */
export function leadingBranch(genome) {
  let best = null;
  let top = 0;
  for (const id of BRANCH_IDS) {
    const v = genome.traits[BRANCHES[id].trait] || 0;
    if (v > top + 1e-9) { top = v; best = id; }
  }
  return best || BRANCH_IDS[Math.floor(rng(genome.seed ^ 0x51ed)() * BRANCH_IDS.length)];
}

const hsl = (h, s, l) => `hsl(${Math.round(((h % 360) + 360) % 360)} ${Math.round(s)}% ${Math.round(l)}%)`;

/** Everything needed to draw a creature, worked out from its genome. */
export function describe(genome) {
  const r = rng(genome.seed);
  const species = SPECIES_IDS[Math.floor(r() * SPECIES_IDS.length)];
  const type = TYPES[genome.type] || TYPES[TYPE_IDS[0]];
  // The body is rolled from the seed alone, so it never changes shape as traits drift...
  const ear = weightedPick(EARS, r).id;
  const tail = weightedPick(TAILS, r).id;
  const eyes = EYES[Math.floor(r() * EYES.length)];
  const pattern = weightedPick(PATTERNS, r).id;
  const hue = type.hues[0] + r() * (type.hues[1] - type.hues[0]);
  const sat = type.dull ? 14 + r() * 14 : 58 + r() * 26;
  const light = 50 + r() * 10;
  const belly = hue + (r() < 0.5 ? 28 : -28);
  // ...while the features that appear with age are nudged by how the owner studies.
  const grown = rng(genome.seed ^ 0xabcdef);
  const horn = weightedPick(HORNS, grown, genome.traits).id;
  const back = weightedPick(BACKS, grown, genome.traits).id;

  const stage = stageOf(genome.growth);
  const adult = stage.id === "adult";
  const branch = adult ? genome.branch || leadingBranch(genome) : null;
  return {
    species, stage: stage.id, size: stage.size || "s", branch,
    ear, tail, eyes, pattern,
    horn: stage.id === "hatchling" || stage.id === "egg" ? "none" : horn, // horns come in with age
    back: adult ? back : "none",
    type: genome.type,
    colors: {
      primary: [hsl(hue, sat, light + 22), hsl(hue, sat, light), hsl(hue + 8, sat, light - 16), hsl(hue + 14, sat, light - 30)],
      secondary: [hsl(belly, sat * 0.55, 90), hsl(belly, sat * 0.7, 76), hsl(belly, sat * 0.7, 58)],
      accent: [hsl(type.accent, 80, 68), hsl(type.accent, 72, 50)],
    },
  };
}
