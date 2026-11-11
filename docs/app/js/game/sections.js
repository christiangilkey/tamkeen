// The creature game's sections as screens, with no screen code (shop.js and garden.js draw them): which screen a
// home-card button opens, what its head shows, which two screens share one switch, and how the things on each
// screen are sorted into blocks. Pure, so tests/js/sections.test.mjs can check it.

import {
  CATALOG, DECOR, ITEMS, MOVES, PLOTS, SLOTS, STRUCTURES, SUPPLIES, TAGS, itemById, moveIcon,
} from "./data.js";
import { AUTO_GOALS, automated, costOf, garden, meets, rateOf, totalRate } from "./idle.js";

/**
 * Every section of the game sheet, each its own screen.
 *   title, icon  what its head shows (a game icon's name)
 *   pills        what the head counts: "coins", "gems", "glow"
 *   help         the "?" (info.js: an openEarned id, or "evolve" for how a creature grows); null: none
 *   pair, word   the two screens that share one switch (PAIRS), and the switch's word for this one
 */
export const SECTIONS = {
  shop: { title: "Shop", icon: "nav_shop", pills: ["coins"], help: "coin", pair: "shop", word: "Buy" },
  mine: { title: "My things", icon: "nav_wardrobe", pills: ["coins"], help: "coin", pair: "shop", word: "My things" },
  creatures: { title: "Creatures", icon: "nav_roster", pills: [], help: "evolve", pair: "creatures", word: "Creatures" },
  badges: { title: "Badges", icon: "nav_badges", pills: [], help: null, pair: "creatures", word: "Badges" },
  garden: { title: "Garden", icon: "structure/word_sprout_2", pills: ["glow"], help: "glow", pair: "garden", word: "Garden" },
  supplies: { title: "Supplies", icon: "potion", pills: ["glow", "gems"], help: "gem", pair: "garden", word: "Supplies" },
  // (battle-ui.js and friends-game.js draw these two; their "?" is their own: battleHelp, friendsHelp)
  battle: { title: "Battle", icon: "battle", pills: [], help: "battle", pair: "battle", word: "Battle" },
  friends: { title: "Friends", icon: "rival", pills: [], help: "friends", pair: "battle", word: "Friends" },
  // (fishscreen.js draws these three; the pond itself is fishing-ui.js; their "?" is their own: fishingHelp)
  fishing: { title: "Fishing", icon: "fishing", pills: ["pearls"], help: "fishing", pair: "fishing", word: "Ponds" },
  basket: { title: "Basket", icon: "basket", pills: ["coins", "pearls"], help: "fishing", pair: "fishing", word: "Basket" },
  fishdex: { title: "Fishdex", icon: "fishdex", pills: [], help: "fishing", pair: "fishing", word: "Fishdex" },
};
/** Screens that share one switch, in the switch's order: a shop and your bag; a garden and what its glow buys;
 * your creatures and your badges; battles and battling friends; the ponds, your basket of fish and the Fishdex. */
export const PAIRS = { shop: ["shop", "mine"], garden: ["garden", "supplies"], creatures: ["creatures", "badges"], battle: ["battle", "friends"],
  fishing: ["fishing", "basket", "fishdex"] };

/** The section a button asks for; anything unknown opens the shop. */
export const sectionOf = (tab) => (typeof tab === "string" && Object.hasOwn(SECTIONS, tab) ? tab : "shop");

/** What a screen shows around its contents: {id, title, icon, help, pills, switch: [{id, word, on}] or null}. */
export function screenOf(tab) {
  const id = sectionOf(tab);
  const s = SECTIONS[id];
  return {
    id, title: s.title, icon: s.icon, help: s.help || null, pills: [...s.pills],
    switch: s.pair ? PAIRS[s.pair].map((x) => ({ id: x, word: SECTIONS[x].word, on: x === id })) : null,
  };
}

const PILL_ICON = { coins: "coin", gems: "gem", glow: "glow", pearls: "pearl" };
/** The head's counters for a screen: [{kind, icon, n}], whole numbers. */
export function pillsOf(tab, state) {
  return screenOf(tab).pills.map((kind) => ({
    kind, icon: PILL_ICON[kind],
    n: Math.max(0, Math.floor(kind === "glow" ? garden(state).glow : kind === "pearls" ? Number(state.fishing && state.fishing.pearls) || 0 : Number(state[kind]) || 0)),
  }));
}

// ---------- pictures ----------

/** A thing's picture: its file under game-art/ and its size in pixels. Things to wear, decorations, battle moves,
 * food and supplies. */
export function artOf(thing) {
  if (thing.slot === "decor") return { file: `${thing.id}.png`, w: thing.size, h: thing.size };
  if (thing.slot) { const [w, h] = SLOTS[thing.slot].size; return { file: `item/${thing.id}.png`, w, h }; }
  if (thing.style) return { file: `${moveIcon(thing)}.png`, w: 16, h: 16 };
  return { file: `icon/${thing.icon || thing.id}.png`, w: 16, h: 16 };
}
/** A building's picture at a tier (0: the empty plot). Fully grown buildings are drawn larger. */
export const structureArt = (id, tier) => (tier
  ? { file: `structure/${id}_${tier}.png`, w: tier === 3 ? 48 : 32, h: tier === 3 ? 48 : 32 }
  : { file: "structure/plot.png", w: 32, h: 32 });
/** The largest whole-number scale that fits a w x h picture in a square box, so its pixels stay square (at least 1). */
export const fitScale = (w, h, box) => Math.max(1, Math.floor(box / Math.max(w, h, 1)));

// ---------- what a thing is, for its details box ----------

/** What kind of thing an item is, in a word or two. */
export const KIND = { hat: "Hat", face: "For the face", neck: "Neckwear", held: "To hold", back: "For the back", shirt: "Shirt", decor: "Decoration" };

// ---------- the shop ----------

/** The shop counter's shelves, each a block on the screen: things to wear, decorations, battle moves.
 * `stock` is rules.shopStock, `moves` rules.moveStock. Empty shelves are left out. */
export function shelves(stock, moves) {
  return [
    { id: "wear", label: "Things to wear", items: stock.filter((it) => it.slot !== "decor") },
    { id: "decor", label: "Decorations", items: stock.filter((it) => it.slot === "decor") },
    { id: "moves", label: "Battle moves", items: [...moves] },
  ].filter((s) => s.items.length);
}

/** What the shop keeps back until something is earned: [{tag, text, n}], one per tag still to earn, with how many
 * things it opens (in the order of data.TAGS). */
export function lockedShelf(state) {
  const tags = state.tags || [];
  const locked = CATALOG.filter((it) => (it.requires || []).some((t) => !tags.includes(t)) && !(state.owned || []).includes(it.id));
  return Object.keys(TAGS).filter((t) => !tags.includes(t))
    .map((tag) => ({ tag, text: TAGS[tag], n: locked.filter((it) => (it.requires || []).includes(tag)).length }))
    .filter((x) => x.n > 0);
}

// ---------- my things: the bag ----------

/** The bag's pockets, in the switch's order. */
export const POCKETS = [
  { id: "wear", word: "To wear", icon: "nav_wardrobe" },
  { id: "decor", word: "Decorations", icon: "nav_habitat" },
  { id: "moves", word: "Moves", icon: "move_attack" },
];
export const pocketOf = (id) => (POCKETS.some((p) => p.id === id) ? id : "wear");

/** Is it on: worn by the creature in the habitat, or (a decoration) out in the habitat. */
export const isOn = (state, it) => (it.slot === "decor"
  ? (state.decor || []).some((d) => d.id === it.id)
  : !!(state.creature && state.creature.equipped && state.creature.equipped[it.slot] === it.id));

const ownedOf = (state, list) => list.filter((it) => (state.owned || []).includes(it.id));
const boughtMoves = (state) => MOVES.filter((m) => m.price && (state.attacks || []).includes(m.id));

/** How many things each pocket holds: {wear, decor, moves}. */
export function pocketCounts(state) {
  return { wear: ownedOf(state, ITEMS).length, decor: ownedOf(state, DECOR).length, moves: boughtMoves(state).length };
}

// The bag's blocks of things to wear, one per kind ("For the back", not data.SLOTS' "Back", which reads as "go back").
const KIND_BLOCK = { hat: "Hats", face: "Face", neck: "Neckwear", held: "Held", back: "For the back", shirt: "Shirts" };

/** One pocket as blocks: [{id, label, items}], empty blocks left out. To wear: one block per kind, in data.SLOTS'
 * order; decorations: what is out in the habitat, then what is put away; moves: the battle moves bought. */
export function pocketBlocks(state, pocket) {
  const id = pocketOf(pocket);
  let blocks;
  if (id === "wear") {
    const mine = ownedOf(state, ITEMS);
    blocks = Object.keys(SLOTS).map((slot) => ({ id: slot, label: KIND_BLOCK[slot] || SLOTS[slot].name, items: mine.filter((it) => it.slot === slot) }));
  } else if (id === "decor") {
    const mine = ownedOf(state, DECOR);
    blocks = [
      { id: "out", label: "Out in the habitat", items: mine.filter((it) => isOn(state, it)) },
      { id: "away", label: "Put away", items: mine.filter((it) => !isOn(state, it)) },
    ];
  } else blocks = [{ id: "moves", label: "Battle moves you bought", items: boughtMoves(state) }];
  return blocks.filter((b) => b.items.length);
}

/** Where on the creature each kind of thing is worn, in a word (the cells of "Wearing now"). */
const SLOT_WORD = { hat: "Head", face: "Face", neck: "Neck", held: "Held", back: "For the back", shirt: "Shirt" };
/** What the creature in the habitat wears, one entry per kind of thing in data.SLOTS' order: [{slot, label, item}],
 * `item` null where it wears nothing. */
export function wearing(state) {
  const on = (state.creature && state.creature.equipped) || {};
  return Object.keys(SLOTS).map((slot) => ({ slot, label: SLOT_WORD[slot] || SLOTS[slot].name, item: (on[slot] && itemById(on[slot])) || null }));
}

// ---------- supplies ----------

/** The Supplies screen's blocks after Food: what each thing is for. Anything new in data.SUPPLIES that isn't
 * listed here goes into the last block, so it is never missing from the screen. */
const SUPPLY_GROUPS = [
  { id: "battle", label: "For battles", ids: ["potion"] },
  { id: "grow", label: "For your creatures", ids: ["xp_boost", "egg", "incubator"] },
  { id: "garden", label: "For the garden", ids: ["key"] },
];
export function supplyBlocks() {
  const listed = new Set(SUPPLY_GROUPS.flatMap((g) => g.ids));
  const blocks = SUPPLY_GROUPS.map((g) => ({ id: g.id, label: g.label, items: g.ids.map((id) => SUPPLIES.find((s) => s.id === id)).filter(Boolean) }));
  blocks[blocks.length - 1].items.push(...SUPPLIES.filter((s) => !listed.has(s.id)));
  return blocks.filter((b) => b.items.length);
}

// ---------- the garden ----------

/** The garden screen's numbers: glow, glow an hour, glow waiting in the buildings, stardust, whether glow collects
 * itself (and how many more daily goals until it does), full bloom, and how many plots are open. */
export function gardenFacts(state, now = new Date()) {
  const g = garden(state);
  const goals = (state.stats && state.stats.goals) || 0;
  return {
    glow: Math.floor(g.glow), rate: Math.floor(totalRate(state, now)), waiting: Math.floor(g.plots.reduce((n, p) => n + p.stored, 0)),
    stardust: g.stardust, auto: automated(state), goalsLeft: Math.max(0, AUTO_GOALS - goals), bloom: !!g.bloom,
    open: g.plots.filter((p) => p.open).length, plots: g.plots.length,
  };
}

/** One row per plot, for the Buildings block:
 *   closed  {i, kind, need, key}: what opens it, and whether a key the owner holds would open this one (keys open
 *           the first closed plot)
 *   empty   {i, kind}
 *   built   {i, kind, id, tier, rate, stored, cost, can}: `cost` of growing it a tier, null once fully grown;
 *           `can`: there is glow enough */
export function plotRows(state, now = new Date()) {
  const g = garden(state);
  const firstClosed = g.plots.findIndex((p) => !p.open);
  const keys = (state.items && state.items.key) || 0;
  return g.plots.map((p, i) => {
    if (!p.open) return { i, kind: "closed", need: PLOTS[i].need.text, key: i === firstClosed && keys > 0 };
    if (!p.tier) return { i, kind: "empty" };
    const cost = costOf(state, i);
    return { i, kind: "built", id: p.id, tier: p.tier, rate: Math.floor(rateOf(state, p, now)), stored: Math.floor(p.stored),
      cost, can: cost !== null && g.glow >= cost };
  });
}

/** What could be built on empty plot `i`: [{id, name, text, trait, rate, cost, open, need, can}]. `open`: its
 * milestone is reached; `can`: open, and there is glow enough. */
export function buildOptions(state, i) {
  const glow = garden(state).glow;
  return STRUCTURES.map((s) => {
    const cost = costOf(state, i, s.id);
    const open = meets(state, s.need);
    return { id: s.id, name: s.name, text: s.text, trait: s.trait, rate: s.rate, cost, open, need: s.need ? s.need.text : "",
      can: open && cost !== null && glow >= cost };
  });
}
