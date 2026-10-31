// A creature is data first: a seed plus what has changed since it was born. Everything about
// its look is rebuilt from that, so saves stay tiny and the same seed is always the same creature.

import { EARS, EYES, GROWN, HORNS, PATTERNS, SPECIES_IDS, STAGES, TAILS, TRAITS, TYPES, TYPE_IDS } from "./data.js";

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
    grown: false,       // it has been fully grown (paid once: see rules.grow)
    variant: null,      // a special colouring a juvenile can wear (data.VARIANTS)
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

const RANK = STAGES.map((s) => s.id);

/** True once a creature is fully grown. It stays a juvenile: creatures never grow up past cute. */
export const isGrown = (genome) => (genome.growth || 0) >= GROWN;

/** The stage a creature currently looks like. Its owner may keep it looking like any earlier stage
 * it has been through (growing up is not a one-way door). */
export function formOf(genome) {
  let stage = stageOf(genome.growth);
  if (genome.show && stage.id !== "egg") {
    const wanted = STAGES.find((s) => s.id === genome.show);
    if (wanted && wanted.id !== "egg" && RANK.indexOf(wanted.id) <= RANK.indexOf(stage.id)) stage = wanted;
  }
  return stage;
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
  const sat = type.dull ? 16 + r() * 12 : 55 + r() * 22;
  const light = (hue > 38 && hue < 75 ? 50 : 40) + r() * 6; // clear mid-tones (yellows lighter, or they turn to mud)
  const belly = hue + (r() < 0.5 ? 28 : -28);
  // ...while the features that appear with age are nudged by how the owner studies.
  const grown = rng(genome.seed ^ 0xabcdef);
  const horn = weightedPick(HORNS, grown, genome.traits).id;

  const stage = formOf(genome);
  const juvenile = stage.id === "juvenile";
  const look = {
    species, stage: stage.id, size: stage.size || "s",
    ear, tail, eyes, pattern,
    horn: juvenile ? horn : "none", // horns come in with age
    back: "none", // (back features came with adult forms; the Champion colouring still adds one)
    type: genome.type,
    equipped: { ...(genome.equipped || {}) },
    colors: {
      primary: [hsl(hue, sat + 6, light + 14), hsl(hue, sat, light), hsl(hue + 10, sat * 0.9, light - 12), hsl(hue + 24, sat * 0.75, light - 26)],
      secondary: [hsl(belly, sat * 0.5, 86), hsl(belly, sat * 0.55, 74), hsl(belly, sat * 0.5, 58)],
      accent: [hsl(type.accent, 100, 66), hsl(type.accent, 88, 44)], // the accent: markings, fins, the lower iris
    },
  };
  // A variant restyles the same animal: its shape and markings stay, so it is still recognisably itself.
  const variant = juvenile ? genome.variant : null;
  look.variant = variant || null;
  if (variant === "nocturne") {
    const h2 = hue + (265 - hue) * 0.45;
    look.colors.primary = [hsl(h2, sat * 0.8, light + 2), hsl(h2, sat * 0.8, light - 12), hsl(h2 + 10, sat * 0.7, light - 22), hsl(h2 + 20, sat * 0.6, light - 32)];
    look.colors.accent = [hsl(52, 100, 74), hsl(46, 80, 56)];
    if (look.horn === "none") look.horn = "gem";
  } else if (variant === "twin") {
    const ph = Number.isFinite(genome.partnerHue) ? genome.partnerHue : hue + 150;
    look.colors.secondary = [hsl(ph, 50, 86), hsl(ph, 55, 74), hsl(ph, 50, 58)];
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
