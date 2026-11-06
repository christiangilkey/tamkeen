// A creature is data first: a seed plus what has changed since it was born. Everything about
// its look is rebuilt from that, so saves stay tiny and the same seed is always the same creature.

import { BEASTS, GROWN, STAGES, TRAITS, TYPES, TYPE_IDS, beastsOf } from "./data.js";

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

/** One of the game's elements (an own key of TYPES: never "__proto__", "constructor" and the like). */
const isType = (t) => typeof t === "string" && Object.prototype.hasOwnProperty.call(TYPES, t);

export function newGenome(seed, type = null) {
  const r = rng(seed ^ 0x9e3779b9);
  return {
    seed: seed >>> 0,
    type: isType(type) ? type : TYPE_IDS[Math.floor(r() * TYPE_IDS.length)],
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

/** Which creature a genome is: one of its element's three, picked by its seed (so it never changes). */
export function beastOf(genome) {
  const kinds = beastsOf(isType(genome.type) ? genome.type : TYPE_IDS[0]);
  const list = kinds.length ? kinds : BEASTS;
  return list[Math.floor(rng(genome.seed)() * list.length)];
}

/** Everything needed to draw a creature, worked out from its genome. */
export function describe(genome) {
  const beast = beastOf(genome);
  const stage = formOf(genome);
  const juvenile = stage.id === "juvenile";
  // A variant restyles the same animal: its shape and markings stay, so it is still recognisably itself.
  // `tint` is what the drawing does to its colours (render.js): a moonlit night form, a companion's colours
  // on its light parts, or a gold edge for a champion.
  const variant = juvenile ? genome.variant || null : null;
  let tint = null;
  if (variant === "nocturne") tint = { kind: "nocturne" };
  else if (variant === "twin") tint = { kind: "twin", hue: Math.round(Number.isFinite(genome.partnerHue) ? genome.partnerHue : beast.hue + 150) % 360 };
  else if (variant === "champion") tint = { kind: "champion" };
  return {
    beast: beast.id, species: beast.plan, stage: stage.id, size: stage.size || "s",
    type: genome.type, variant, tint,
    equipped: { ...(genome.equipped || {}) },
  };
}

/** The hue a creature's body is drawn in (used when a companion takes on its colours). */
export const bodyHue = (genome) => beastOf(genome).hue;
