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
    branch: null,       // its adult form, chosen by its owner when it is ready (see rules.evolve)
    branches: [],       // adult forms it has unlocked and can switch between
    variant: null,      // a special form on top (data.VARIANTS)
    show: null,         // an earlier stage its owner prefers it to stay looking like
    moves: [],          // the (up to four) moves it takes into battle
    equipped: {},
    name: "",
  };
}

export function stageOf(growth) {
  let stage = STAGES[0];
  for (const s of STAGES) if (growth >= s.from) stage = s;
  return stage;
}

const RANK = ["egg", "hatchling", "juvenile", "adult"];

/** True once a creature has grown enough to become an adult but its owner hasn't evolved it yet.
 * Evolution is a moment the owner chooses, not something that happens behind their back. */
export const readyToEvolve = (genome) => stageOf(genome.growth).id === "adult" && !genome.branch;

/** The stage a creature currently looks like. It waits as a juvenile until evolved, and its owner
 * may keep it looking like any earlier stage it has been through (growing up is not a one-way door). */
export function formOf(genome) {
  let stage = stageOf(genome.growth);
  if (stage.id === "adult" && !genome.branch) stage = STAGES[2];
  if (genome.show && stage.id !== "egg") {
    const wanted = STAGES.find((s) => s.id === genome.show);
    if (wanted && wanted.id !== "egg" && RANK.indexOf(wanted.id) <= RANK.indexOf(stage.id)) stage = wanted;
  }
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
  const sat = type.dull ? 14 + r() * 12 : 46 + r() * 20;
  const light = (hue > 38 && hue < 75 ? 30 : 24) + r() * 6; // dark bodies (yellows a touch lighter, or they turn to mud)
  const belly = hue + (r() < 0.5 ? 28 : -28);
  // ...while the features that appear with age are nudged by how the owner studies.
  const grown = rng(genome.seed ^ 0xabcdef);
  const horn = weightedPick(HORNS, grown, genome.traits).id;
  const back = weightedPick(BACKS, grown, genome.traits).id;

  const stage = formOf(genome);
  const adult = stage.id === "adult";
  const branch = adult ? genome.branch : null;
  const look = {
    species, stage: stage.id, size: stage.size || "s", branch,
    ear, tail, eyes, pattern,
    horn: stage.id === "hatchling" || stage.id === "egg" ? "none" : horn, // horns come in with age
    back: adult ? back : "none",
    type: genome.type,
    equipped: { ...(genome.equipped || {}) },
    colors: {
      primary: [hsl(hue, sat + 14, light + 17), hsl(hue, sat, light), hsl(hue + 12, sat * 0.85, light - 9), hsl(hue + 26, sat * 0.7, light - 16)],
      secondary: [hsl(belly, sat * 0.55, 66), hsl(belly, sat * 0.6, 50), hsl(belly, sat * 0.6, 35)],
      accent: [hsl(type.accent, 100, 66), hsl(type.accent, 88, 44)], // the neon: eyes, circuit lines, fins of light
    },
  };
  // A variant restyles the same animal: its shape and markings stay, so it is still recognisably itself.
  const variant = adult ? genome.variant : null;
  look.variant = variant || null;
  if (variant === "nocturne") {
    const h2 = hue + (265 - hue) * 0.45;
    look.colors.primary = [hsl(h2, sat * 0.8 + 10, light + 9), hsl(h2, sat * 0.8, light - 6), hsl(h2 + 10, sat * 0.7, light - 12), hsl(h2 + 20, sat * 0.6, light - 17)];
    look.colors.accent = [hsl(52, 100, 74), hsl(46, 80, 56)];
    if (look.horn === "none") look.horn = "gem";
  } else if (variant === "twin") {
    const ph = Number.isFinite(genome.partnerHue) ? genome.partnerHue : hue + 150;
    look.colors.secondary = [hsl(ph, 55, 68), hsl(ph, 60, 52), hsl(ph, 55, 37)];
    if (look.pattern === "none") look.pattern = "patch";
  } else if (variant === "champion") {
    look.colors.accent = [hsl(45, 100, 66), hsl(36, 86, 50)];
    look.horn = "crest";
    if (look.back === "none") look.back = "spikes";
  }
  return look;
}

/** The hue a creature's body is drawn in (used when a companion takes on its colours). */
export function bodyHue(genome) {
  const type = TYPES[genome.type] || TYPES[TYPE_IDS[0]];
  const r = rng(genome.seed);
  r(); // species
  weightedPick(EARS, r); weightedPick(TAILS, r); r(); weightedPick(PATTERNS, r);
  return type.hues[0] + r() * (type.hues[1] - type.hues[0]);
}
