// The home card's rules, with no screen code (habitat.js draws them): which of the four tiles carries a
// red dot, what in the scene can be tapped to collect (glow in a building, a friend's gift, an egg that
// hatched in the incubator), what went up since the card last showed it (so it can fly into its counter),
// today's goal as a ring, and the ring's pixels. Pure, so tests/js/homecard.test.mjs can check it.

import { PLOTS, STAGES } from "./data.js";
import { stageOf } from "./genome.js";
import { automated, garden } from "./idle.js";
import { dayKey, moveStock, shopStock } from "./rules.js";

/** Where the shop's last look is kept (this device only: localStorage; shop.js writes it, habitat.js reads it). */
export const SHOP_SEEN_KEY = "tamkeen.game.shopSeen";

/** What the card counts, in the order rewards fly: XP (the level bar), coins, gems, glow (the Garden tile). */
export const KINDS = ["xp", "coins", "gems", "glow"];

/** The numbers behind the card's counters. */
export function wallet(state) {
  return { xp: Math.max(0, Math.floor(state.xp || 0)), coins: Math.max(0, Math.floor(state.coins || 0)),
           gems: Math.max(0, Math.floor(state.gems || 0)), glow: Math.max(0, Math.floor(garden(state).glow)) };
}

/** What went up from `before` to `after` (two wallets): [{kind, amount}], in KINDS order. What went down
 * (spent in the shop) or stayed the same flies nowhere. A missing `before` means nothing to show. */
export function gains(before, after) {
  if (!before || !after) return [];
  return KINDS.map((kind) => ({ kind, amount: Math.floor(Number(after[kind]) || 0) - Math.floor(Number(before[kind]) || 0) }))
    .filter((g) => g.amount > 0);
}

/** Today's daily goal as a ring: minutes so far, the goal, how full (0..1), and whether it is reached. */
export function goalRing(state) {
  const goal = Number(state.goal) || 10;
  const seconds = Math.max(0, Number(state.day && state.day.seconds) || 0);
  const done = !!(state.day && state.day.done);
  return { mins: Math.floor(seconds / 60), goal, frac: done ? 1 : Math.min(1, seconds / (goal * 60)), done };
}

/** Glow waiting in the buildings, in whole units (it collects itself once automated: then none waits). */
export function glowWaiting(state) {
  return Math.floor(garden(state).plots.reduce((n, p) => n + (Number(p.stored) || 0), 0));
}

/** Today's shop things the owner can pay for right now, as "item:<id>" and "move:<id>". */
export function affordable(state, now = new Date()) {
  const coins = Number(state.coins) || 0;
  return [...shopStock(state, now).filter((it) => it.price <= coins).map((it) => `item:${it.id}`),
          ...moveStock(state, now).filter((m) => m.price <= coins).map((m) => `move:${m.id}`)];
}

/** What the owner has seen in the shop: today's affordable things, when the shop was last opened. */
export const shopSeen = (state, now = new Date()) => ({ day: dayKey(now), ids: affordable(state, now) });

/** The Shop tile's dot: something in today's shop became affordable since the shop was last opened today
 * (a dot that never goes away tells nothing, so a thing once seen doesn't light it again). */
export function shopDot(state, seen, now = new Date()) {
  const ids = affordable(state, now);
  if (!ids.length) return false;
  const known = seen && seen.day === dayKey(now) && Array.isArray(seen.ids) ? new Set(seen.ids) : new Set();
  return ids.some((id) => !known.has(id));
}

/** Creatures that hatched in the incubator while another was out, not yet seen: roster indexes. */
export const hatchedAway = (state) => state.roster.map((g, i) => (g && g.hatchedAway === true && i !== state.active
  && stageOf(g.growth).id !== "egg" ? i : -1)).filter((i) => i >= 0);

/**
 * The red dots on the four tiles: something waits behind it.
 *   battle     a friend's challenge or gift (`online` = {gifts, battles}: counts, from the online service)
 *   creatures  a creature hatched in the incubator
 *   shop       something newly affordable (see shopDot; `seen` = shopSeen() as last stored)
 *   garden     glow waiting in a building
 */
export function tileDots(state, { online = null, seen = null, now = new Date() } = {}) {
  const gifts = online ? Math.max(0, Number(online.gifts) || 0) : 0;
  const battles = online ? Math.max(0, Number(online.battles) || 0) : 0;
  return {
    battle: gifts + battles > 0,
    creatures: hatchedAway(state).length > 0,
    shop: shopDot(state, seen, now),
    garden: !automated(state) && glowWaiting(state) >= 1,
  };
}

// Where things to collect stand in the scene (between the building plots, data.PLOTS).
export const GIFT_X = 214;
export const EGG_X = 106;
/** Where the aquarium stands, once a fish has been caught (fishing.js; the tank is game-art/fish/tank.png). */
export const TANK_X = 266;

/**
 * Things in the scene to tap: a building with glow waiting {kind: "glow", plot, x}, a friend's gift
 * {kind: "gift", gift, x} (the first of `gifts`), and an egg {kind: "egg", index, x, ready, progress}: one
 * warming in the incubator (ready false; progress 0..1 to hatching) or one that hatched there (ready true).
 */
export function collectables(state, { gifts = [] } = {}) {
  const out = [];
  const g = garden(state);
  g.plots.forEach((p, i) => { if (p.open && p.tier && p.stored >= 1 && PLOTS[i]) out.push({ kind: "glow", plot: i, x: PLOTS[i].x }); });
  const gift = (Array.isArray(gifts) ? gifts : []).find((x) => x && x.id != null);
  if (gift) out.push({ kind: "gift", gift, x: GIFT_X });
  const ready = hatchedAway(state);
  if (ready.length) out.push({ kind: "egg", index: ready[0], x: EGG_X, ready: true, progress: 1 });
  else if (state.incubating != null) {
    const index = state.roster.findIndex((c, i) => c && c.seed === state.incubating && i !== state.active);
    const egg = state.roster[index];
    if (egg && stageOf(egg.growth).id === "egg") {
      const hatchAt = STAGES[1].from; // where the hatchling stage starts
      out.push({ kind: "egg", index, x: EGG_X, ready: false, progress: Math.max(0, Math.min(1, egg.growth / hatchAt)) });
    }
  }
  return out;
}

/** The habitat next to `current` in `themes`: dir 1 the next, -1 the one before (going round). */
export function nextScene(themes, current, dir) {
  const i = Math.max(0, themes.indexOf(current));
  return themes[(i + (dir < 0 ? themes.length - 1 : 1)) % themes.length];
}

/**
 * The goal ring's pixels: an ellipse on the ground two pixels wide, centred on (0, 0). Each is
 * {x, y, f, outer, back}: `f` (0..1) is how far round it is, starting at the front and going clockwise
 * on screen, so the first `frac` of them are lit; `back` ones are drawn behind the creature.
 */
export function ringPixels(rx, ry) {
  const out = [];
  const seen = new Set();
  const steps = Math.ceil((rx + ry) * 8);
  for (const [a, b, outer] of [[rx, ry, true], [rx - 1, ry - 1, false]]) {
    for (let s = 0; s < steps; s++) {
      const f = s / steps;
      const angle = Math.PI / 2 + f * Math.PI * 2; // the front (bottom) first, then on round to the left: clockwise
      const x = Math.round(Math.cos(angle) * a);
      const y = Math.round(Math.sin(angle) * b);
      const key = `${x},${y}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ x, y, f, outer, back: y < 0 });
    }
  }
  return out;
}
