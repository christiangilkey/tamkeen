// The garden: the slow half of the game, with no screen code.
//
// Buildings stand on plots in the habitat and make "glow" while you are away. It follows what the
// owner's notes on incremental games ask for:
//   - costs rise faster than output, so there is always a next thing to save for;
//   - it unfolds: plots and buildings open with study milestones, not all at once;
//   - there are real choices: six plots, six kinds of building, and each kind does best for a
//     different study habit, so what to build depends on how you study;
//   - being away is worth something (up to eight hours of glow waits for you, so there is no
//     reason to check every five minutes) and so is studying (reaching the day's goal speeds
//     everything up and pays a burst);
//   - collecting by hand is replaced by automation you EARN (ten daily goals), not buy;
//   - releasing a grown creature starts the garden over with a lasting boost (stardust);
//   - there is an end: every plot holding a fully grown building is "full bloom".
// Nothing here is sold for money, and nothing here adds strength in battles between people.

import { FOODS, PLOTS, STRUCTURES, SUPPLIES, TIER_COST, TIER_RATE } from "./data.js";
import { formOf, isGrown } from "./genome.js";
import { MATURE_BOX, MAX_CREATURES, dayKey, layEgg } from "./rules.js";

export const OFFLINE_HOURS = 8;        // how much glow can pile up while you are away
export const AUTO_GOALS = 10;          // daily goals reached before glow collects itself
export const STARDUST_BOOST = 0.5;     // each stardust: +50% glow, for good
export const FEEDS_PER_DAY = 3;
export const MAX_BOND = 10;            // two points per heart, five hearts
export const BOOST_MINUTES = 20;
export const CARDS_GLOW_HOURS = 1;     // clearing the day's flashcards sends this many hours of glow at once...
export const CARDS_GLOW_MIN = 20;      // ...and never less than this, so it counts before anything is built

const structure = (id) => STRUCTURES.find((s) => s.id === id) || null;

/** The garden's saved state (made the first time it is needed, so older saves just gain it). */
export function garden(state) {
  if (!state.idle || typeof state.idle !== "object") state.idle = {};
  const g = state.idle;
  if (!Array.isArray(g.plots)) g.plots = [];
  while (g.plots.length < PLOTS.length) g.plots.push({ open: false, id: null, tier: 0, stored: 0 });
  for (const k of ["glow", "stardust", "at", "badgesPaid", "raidsPaid", "leaguePaid"]) if (!Number.isFinite(g[k])) g[k] = k === "glow" ? 40 : 0;
  if (!Array.isArray(g.released)) g.released = [];
  if (!Number.isFinite(state.gems)) state.gems = 0;
  return g;
}

/** Has the owner done what a plot or a building asks for? `need` is one of data.js's requirements. */
export function meets(state, need) {
  if (!need) return true;
  if (need.hatched) return state.roster.some((c) => formOf(c).id !== "egg");
  if (need.stat) return (state.stats[need.stat] || 0) >= need.n;
  if (need.streak) return state.best_streak >= need.streak;
  if (need.stardust) return garden(state).stardust >= need.stardust;
  if (need.mature) return Object.values(state.review || {}).filter((r) => r[0] >= MATURE_BOX).length >= need.mature;
  return false;
}

/** Hearts of the creature in the habitat (0..5), from being fed and cared for. */
export const hearts = (creature) => Math.floor(Math.min(MAX_BOND, creature.bond || 0) / 2);

/** Glow per hour from one plot, with everything that speeds it up. */
export function rateOf(state, plot, now = new Date()) {
  const s = structure(plot.id);
  if (!s || !plot.tier) return 0;
  const g = garden(state);
  const c = state.creature;
  const habit = s.trait ? 1 + Math.min(1, c.traits[s.trait] || 0) : 1.5;          // the habit this building likes
  const goal = state.day.done && state.day.key === dayKey(now) ? 1.5 : 1;         // today's goal reached
  return s.rate * TIER_RATE[plot.tier] * habit * goal * (1 + STARDUST_BOOST * g.stardust) * (1 + 0.04 * hearts(c));
}

export const totalRate = (state, now = new Date()) => garden(state).plots.reduce((sum, p) => sum + rateOf(state, p, now), 0);
export const automated = (state) => (state.stats.goals || 0) >= AUTO_GOALS;

/**
 * Let time pass. Glow builds up in each building (or goes straight to the bank once collecting
 * is automated), for at most OFFLINE_HOURS since the last look. Also pays what studying earns
 * here: a burst when the day's goal is reached, and gems for badges, raids and league rises.
 * Returns {made, burst, gems} for the screen to show.
 */
export function tick(state, now = new Date()) {
  const g = garden(state);
  const t = now.getTime() / 1000;
  const out = { made: 0, burst: 0, gems: 0 };
  for (let i = 0; i < PLOTS.length; i++) if (!g.plots[i].open && meets(state, PLOTS[i].need)) g.plots[i].open = true;
  const hours = g.at ? Math.max(0, Math.min(OFFLINE_HOURS, (t - g.at) / 3600)) : 0;
  g.at = t;
  const auto = automated(state);
  for (const p of g.plots) {
    const rate = rateOf(state, p, now);
    if (!rate) continue;
    const cap = rate * OFFLINE_HOURS;
    const made = Math.min(rate * hours, Math.max(0, cap - p.stored));
    p.stored += made;
    out.made += made;
    if (auto) { g.glow += p.stored; p.stored = 0; }
  }
  // Reaching today's goal sends two hours of glow at once: studying is never the slow way.
  if (state.day.done && g.goalDay !== state.day.key) {
    g.goalDay = state.day.key;
    out.burst = Math.round(totalRate(state, now) * 2);
    g.glow += out.burst;
  }
  // Gems come only from things done: badges, raid wins, rising a league, full bloom.
  const league = Math.max(g.leaguePaid, state.league || 0);
  out.gems = 2 * Math.max(0, state.badges.length - g.badgesPaid) + 3 * Math.max(0, (state.stats.raids || 0) - g.raidsPaid) + 2 * (league - g.leaguePaid);
  g.badgesPaid = Math.max(g.badgesPaid, state.badges.length);
  g.raidsPaid = Math.max(g.raidsPaid, state.stats.raids || 0);
  g.leaguePaid = league;
  if (!g.bloom && g.plots.every((p) => p.tier === 3)) { g.bloom = true; out.gems += 10; out.bloom = true; }
  state.gems += out.gems;
  return out;
}

/** The flashcards' own reward: glow, which battles never pay (they pay coins). Once the day's cards
 * are cleared (rules.earn sets day.cardsCleared) an hour of the garden's output arrives, once a
 * day. Returns the glow paid, or 0. */
export function cardsGlow(state, now = new Date()) {
  const g = garden(state);
  if (!state.day.cardsCleared || g.cardsDay === state.day.key) return 0;
  g.cardsDay = state.day.key;
  const glow = Math.max(CARDS_GLOW_MIN, Math.round(totalRate(state, now) * CARDS_GLOW_HOURS));
  g.glow += glow;
  return glow;
}

/** Gather the glow waiting in one plot (or all of them with no index). Returns how much. */
export function collect(state, index = null) {
  const g = garden(state);
  let got = 0;
  g.plots.forEach((p, i) => { if (index === null || index === i) { got += p.stored; p.stored = 0; } });
  g.glow += got;
  return Math.floor(got);
}

/** What the next step on a plot costs: building `id` on an empty plot, or raising what stands there. */
export function costOf(state, index, id = null) {
  const g = garden(state);
  const p = g.plots[index];
  const s = structure(p.tier ? p.id : id);
  if (!s || p.tier >= 3) return null;
  const same = g.plots.filter((q, i) => i !== index && q.tier && q.id === s.id).length;
  return Math.round(s.cost * TIER_COST[p.tier + 1] * 1.6 ** same); // a second one of a kind costs more
}

/** Build on an empty plot. Returns an error message, or "". */
export function build(state, index, id) {
  const g = garden(state);
  const p = g.plots[index];
  const s = structure(id);
  if (!p || !p.open) return "That plot isn't open yet.";
  if (p.tier) return "Something is already built there.";
  if (!s) return "That building doesn't exist.";
  if (!meets(state, s.need)) return `Not yet: ${s.need.text}.`;
  const cost = costOf(state, index, id);
  if (g.glow < cost) return `You need ${Math.ceil(cost - g.glow)} more glow.`;
  g.glow -= cost;
  Object.assign(p, { id, tier: 1, stored: 0 });
  return "";
}

/** Raise the building on a plot one tier (three at most). Returns an error message, or "". */
export function upgrade(state, index) {
  const g = garden(state);
  const p = g.plots[index];
  if (!p || !p.tier) return "Nothing is built there.";
  if (p.tier >= 3) return "It is fully grown.";
  const cost = costOf(state, index);
  if (g.glow < cost) return `You need ${Math.ceil(cost - g.glow)} more glow.`;
  g.glow -= cost;
  p.tier++;
  return "";
}

/** Open the next closed plot with a key instead of waiting for its milestone. */
export function useKey(state) {
  const g = garden(state);
  const i = g.plots.findIndex((p) => !p.open);
  if (i < 0) return "Every plot is already open.";
  if (!(state.items.key > 0)) return "You have no key.";
  state.items.key--;
  g.plots[i].open = true;
  return "";
}

/**
 * Release a grown creature: it leaves the roster for good (it is remembered in the garden's
 * record), the garden's buildings and glow start over, and stardust is kept forever, making
 * everything after it faster. Returns {stardust} or an error message string.
 */
export function release(state, rosterIndex, rand = Math.random) {
  const g = garden(state);
  const c = state.roster[rosterIndex];
  if (!c || !isGrown(c)) return "Only a fully grown creature can be released.";
  const gained = 1 + Math.floor(g.plots.filter((p) => p.tier === 3).length / 2);
  g.released.push({ seed: c.seed, type: c.type, variant: c.variant || null, name: c.name || "", day: dayKey() });
  if (state.roster.length === 1) layEgg(state, rand); // you are never left without a creature
  state.roster.splice(rosterIndex, 1);
  if (state.active > rosterIndex) state.active--;
  if (state.active >= state.roster.length) state.active = 0;
  if (state.incubating === c.seed) state.incubating = null;
  g.stardust += gained;
  g.glow = 40;
  for (const p of g.plots) Object.assign(p, { id: null, tier: 0, stored: 0 });
  g.bloom = false;
  return { stardust: gained };
}

// ---------- supplies: things bought with glow or gems, and what using them does ----------
const supply = (id) => [...FOODS, ...SUPPLIES].find((s) => s.id === id) || null;

/** Buy food or a supply. Returns an error message, or "". */
export function buySupply(state, id, rand = Math.random) {
  const g = garden(state);
  const s = supply(id);
  if (!s) return "That isn't for sale.";
  if (id === "egg" && state.roster.length >= MAX_CREATURES) return "Your roster is full.";
  if (s.glow) { if (g.glow < s.glow) return `You need ${Math.ceil(s.glow - g.glow)} more glow.`; g.glow -= s.glow; }
  if (s.gems) { if (state.gems < s.gems) return `You need ${s.gems - state.gems} more gem${s.gems - state.gems === 1 ? "" : "s"}.`; state.gems -= s.gems; }
  if (id === "egg") layEgg(state, rand);
  else state.items[id] = (state.items[id] || 0) + 1;
  return "";
}

/** Feed the creature in the habitat. Its element's favourite food counts double. Returns
 * {bond, loved} or an error message string. */
export function feed(state, foodId, now = new Date()) {
  const food = FOODS.find((f) => f.id === foodId);
  const c = state.creature;
  if (!food || !(state.items[foodId] > 0)) return "You have none of that.";
  if (formOf(c).id === "egg") return "Eggs don't eat. Hatch it first.";
  const today = dayKey(now);
  if (!c.fed || c.fed.day !== today) c.fed = { day: today, n: 0 };
  if (c.fed.n >= FEEDS_PER_DAY) return "It is full for today.";
  state.items[foodId]--;
  c.fed.n++;
  const loved = food.loves === c.type;
  c.bond = Math.min(MAX_BOND, (c.bond || 0) + (loved ? 2 : 1));
  return { bond: c.bond, loved };
}

/** Start an XP boost: XP from looking up, saving and reviewing words is doubled for a while. */
export function useBoost(state, now = new Date()) {
  if (!(state.items.xp_boost > 0)) return "You have no XP boost.";
  state.items.xp_boost--;
  state.boostUntil = Math.max(state.boostUntil || 0, now.getTime() / 1000) + BOOST_MINUTES * 60;
  return "";
}

/** Put an egg in the incubator: it grows at half speed alongside the creature in the habitat. */
export function incubate(state, rosterIndex) {
  const egg = state.roster[rosterIndex];
  if (!(state.items.incubator > 0)) return "You have no incubator.";
  if (!egg || formOf(egg).id !== "egg" || rosterIndex === state.active) return "Choose an egg that isn't out in the habitat.";
  if (state.incubating === egg.seed) return "That egg is already in the incubator.";
  state.items.incubator--;
  state.incubating = egg.seed;
  return "";
}
