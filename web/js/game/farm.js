// The farm (prototype "farm"; the owner's design, 2026-11-26, tamkeen-plans/farming-plan.md section 1). Pure: no
// screen code (habitat.js draws it, farm-ui.js asks and shows; the art is tools/game_art/farmart.py).
//
// A fenced field west of the cottage, through a gate at the yard's edge. It starts 3 x 3 and grows one fence section
// at a time (bought with glow). Crops are ordinary crops. The owner's rules:
//   - a thirsty plant is watered by answering one due word (the question card fishing and battles use): a right answer
//     waters it for the day, a wrong one waters it a little (two wrong answers make a watering) and shows the answer;
//   - a crop ripens only after being watered on several DIFFERENT days (carrot 2, pumpkin 5, fruit tree 10): it can't
//     be rushed in one sitting, it asks to come back;
//   - nothing dies or rots: a plant missed for a day wilts and waits, and one watering revives it; harvests wait in
//     the barn;
//   - the seasons turn weekly, the same for everyone (the calendar week); a crop out of its season rests until it
//     comes back (all-year crops never rest);
//   - a harvest rolls its rarity through loot.js, Common up to Legendary (a golden pumpkin now and then);
//   - seeds are bought with glow (flashcards pay glow), never with money; one rare seed packet a week.
// Saved in `state.farm`; when two copies of a game meet, the one changed later wins (merge.js joinFarm,
// app/sync/gamemerge.py _join_farm).

import { LEGENDARY, TIERS, chances } from "./loot.js";
import { dayNumber, weekNumber } from "./rules.js";

export const SEASONS = ["spring", "summer", "autumn", "winter"];
/** This week's season: the same for everyone, turning on Mondays. */
export const seasonOf = (now = new Date()) => SEASONS[weekNumber(now) % SEASONS.length];
/** How many days until the next season (the next Monday). */
export const daysToNextSeason = (now = new Date()) => 7 - ((dayNumber(now) + 3) % 7);

// Every crop: its season ("all": any), the different days it needs watering to ripen, what its seeds cost (glow), how
// many it gives, and `kind` (how farmart.py draws it). `rare`: only sold as the week's rare seed packet.
export const CROPS = [
  // spring
  { id: "carrot", name: "Carrot", season: "spring", days: 2, kind: "root", give: [2, 3] },
  { id: "radish", name: "Radish", season: "spring", days: 2, kind: "root", give: [2, 3] },
  { id: "lettuce", name: "Lettuce", season: "spring", days: 2, kind: "leafy", give: [1, 2] },
  { id: "peas", name: "Peas", season: "spring", days: 3, kind: "vine", give: [2, 4] },
  { id: "potato", name: "Potato", season: "spring", days: 3, kind: "root", give: [2, 4] },
  { id: "onion", name: "Onion", season: "spring", days: 3, kind: "bulb", give: [2, 3] },
  { id: "strawberry", name: "Strawberry", season: "spring", days: 4, kind: "bush", give: [3, 5] },
  { id: "cabbage", name: "Cabbage", season: "spring", days: 4, kind: "leafy", give: [1, 2] },
  // summer
  { id: "tomato", name: "Tomato", season: "summer", days: 3, kind: "bush", give: [2, 4] },
  { id: "pepper", name: "Pepper", season: "summer", days: 3, kind: "bush", give: [2, 3] },
  { id: "beans", name: "Beans", season: "summer", days: 3, kind: "vine", give: [3, 5] },
  { id: "cucumber", name: "Cucumber", season: "summer", days: 3, kind: "gourd", give: [2, 3] },
  { id: "corn", name: "Corn", season: "summer", days: 4, kind: "stalk", give: [2, 3] },
  { id: "sunflower", name: "Sunflower", season: "summer", days: 4, kind: "flower", give: [1, 2] },
  { id: "blueberry", name: "Blueberry", season: "summer", days: 4, kind: "bush", give: [3, 5] },
  { id: "melon", name: "Melon", season: "summer", days: 5, kind: "gourd", give: [1, 2] },
  // autumn
  { id: "beet", name: "Beet", season: "autumn", days: 3, kind: "root", give: [2, 3] },
  { id: "mushroom", name: "Mushroom", season: "autumn", days: 3, kind: "mushroom", give: [2, 4] },
  { id: "squash", name: "Squash", season: "autumn", days: 4, kind: "gourd", give: [1, 2] },
  { id: "sweet_potato", name: "Sweet potato", season: "autumn", days: 4, kind: "root", give: [2, 3] },
  { id: "cranberry", name: "Cranberry", season: "autumn", days: 4, kind: "bush", give: [3, 5] },
  { id: "pumpkin", name: "Pumpkin", season: "autumn", days: 5, kind: "gourd", give: [1, 1] },
  { id: "grapes", name: "Grapes", season: "autumn", days: 5, kind: "vine", give: [2, 4] },
  { id: "apple", name: "Apple tree", season: "autumn", days: 10, kind: "tree", give: [4, 6] },
  // winter
  { id: "turnip", name: "Turnip", season: "winter", days: 2, kind: "root", give: [2, 3] },
  { id: "kale", name: "Kale", season: "winter", days: 3, kind: "leafy", give: [1, 2] },
  { id: "leek", name: "Leek", season: "winter", days: 3, kind: "bulb", give: [2, 3] },
  { id: "parsnip", name: "Parsnip", season: "winter", days: 3, kind: "root", give: [2, 3] },
  { id: "garlic", name: "Garlic", season: "winter", days: 4, kind: "bulb", give: [2, 4] },
  { id: "snowberry", name: "Snowberry", season: "winter", days: 4, kind: "bush", give: [3, 5] },
  { id: "sprouts", name: "Brussels sprouts", season: "winter", days: 5, kind: "stalk", give: [2, 4] },
  { id: "winter_pear", name: "Pear tree", season: "winter", days: 10, kind: "tree", give: [4, 6] },
  // all year
  { id: "wheat", name: "Wheat", season: "all", days: 3, kind: "grain", give: [2, 4] },
  { id: "basil", name: "Basil", season: "all", days: 2, kind: "herb", give: [2, 3] },
  // the week's rare seed packet (one of these, in turn)
  { id: "starfruit", name: "Starfruit tree", season: "all", days: 8, kind: "tree", give: [3, 5], rare: true },
  { id: "moonflower", name: "Moonflower", season: "all", days: 6, kind: "flower", give: [1, 2], rare: true },
  { id: "rainbow_carrot", name: "Rainbow carrot", season: "all", days: 3, kind: "root", give: [2, 3], rare: true },
];
export const cropById = (id) => CROPS.find((c) => c.id === id) || null;
export const RARE_CROPS = CROPS.filter((c) => c.rare);
/** What a crop's seeds cost in glow (one seed, one plant). */
export const seedPrice = (c) => (c.rare ? 60 : 8) * c.days;
/** This week's rare seed packet (one may be bought a week). */
export const rareSeedOf = (now = new Date()) => RARE_CROPS[weekNumber(now) % RARE_CROPS.length];
/** Is a crop in season (and so growing) now? */
export const inSeason = (c, now = new Date()) => !!c && (c.season === "all" || c.season === seasonOf(now));
/** The seeds sold this week: the season's and the all-year ones (the rare packet is apart). */
export const seedsOnSale = (now = new Date()) => CROPS.filter((c) => !c.rare && inSeason(c, now));

// ---------- the field and its fence ----------
export const START_SIZE = [3, 3];
export const MAX_SIZE = [12, 6];
/** The field's size after `n` fence sections: it grows a column, then a row, in turn, while each still can. */
export function sizeAfter(n) {
  let [w, h] = START_SIZE;
  for (let i = 0; i < n; i++) {
    if ((w <= h * 2 || h >= MAX_SIZE[1]) && w < MAX_SIZE[0]) w++;
    else if (h < MAX_SIZE[1]) h++;
  }
  return [w, h];
}
export const FENCE_MAX = MAX_SIZE[0] - START_SIZE[0] + MAX_SIZE[1] - START_SIZE[1];
/** The glow the next fence section costs (null when the field is as big as it gets). */
export const fenceCost = (state) => { const n = farmOf(state).fence; return n >= FENCE_MAX ? null : Math.round(150 * 1.45 ** n); };

/** The farm's saved state (made the first time it is needed, so older saves just gain it). */
export function farmOf(state) {
  if (!state.farm || typeof state.farm !== "object") state.farm = {};
  const f = state.farm;
  if (!Number.isFinite(f.fence) || f.fence < 0) f.fence = 0;
  f.fence = Math.min(FENCE_MAX, Math.floor(f.fence));
  if (!f.plots || typeof f.plots !== "object" || Array.isArray(f.plots)) f.plots = {};
  if (!f.seeds || typeof f.seeds !== "object" || Array.isArray(f.seeds)) f.seeds = {};
  if (!f.barn || typeof f.barn !== "object" || Array.isArray(f.barn)) f.barn = {};
  if (!Number.isFinite(f.at)) f.at = 0;
  return f;
}
/** The field's width and height now. */
export const fieldSize = (state) => sizeAfter(farmOf(state).fence);
const keyOf = (c, r) => `${c},${r}`;
/** Every spot of the field: [{c, r, key}]. */
export function spots(state) {
  const [w, h] = fieldSize(state);
  const out = [];
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) out.push({ c, r, key: keyOf(c, r) });
  return out;
}
const onField = (state, key) => spots(state).some((s) => s.key === key);
const touch = (f, now) => { f.at = Math.floor(now.getTime() / 1000); };

/** Buy the next fence section. Returns an error message, or "". */
export function growFence(state, glow, now = new Date()) {
  const f = farmOf(state);
  const cost = fenceCost(state);
  if (cost === null) return "Your field is as big as it gets.";
  if (glow.glow < cost) return `You need ${Math.ceil(cost - glow.glow)} more glow.`;
  glow.glow -= cost;
  f.fence++;
  touch(f, now);
  return "";
}

/** Buy seeds with glow (`glow`: the garden, idle.garden(state)). The rare packet: one a week. Returns an error, or "". */
export function buySeeds(state, glow, id, n = 1, now = new Date()) {
  const f = farmOf(state);
  const c = cropById(id);
  if (!c) return "Those seeds aren't for sale.";
  if (c.rare) {
    if (rareSeedOf(now).id !== id) return "That rare seed isn't on sale this week.";
    if (f.rareWeek === weekNumber(now)) return "You've had this week's rare seed packet.";
    n = 1;
  } else if (!inSeason(c, now)) return "Those seeds are out of season.";
  const cost = seedPrice(c) * n;
  if (glow.glow < cost) return `You need ${Math.ceil(cost - glow.glow)} more glow.`;
  glow.glow -= cost;
  f.seeds[id] = (f.seeds[id] || 0) + n;
  if (c.rare) f.rareWeek = weekNumber(now);
  touch(f, now);
  return "";
}

/** Plant one of your seeds on an empty spot. Returns an error message, or "". */
export function plant(state, key, id, now = new Date()) {
  const f = farmOf(state);
  const c = cropById(id);
  if (!onField(state, key)) return "That isn't part of your field.";
  if (f.plots[key]) return "Something is growing there already.";
  if (!c || !(f.seeds[id] > 0)) return "You have none of those seeds.";
  f.seeds[id]--;
  if (!f.seeds[id]) delete f.seeds[id];
  const today = dayNumber(now);
  f.plots[key] = { crop: id, days: 0, last: today, planted: today };
  touch(f, now);
  return "";
}

/**
 * How a plant is doing: {crop, stage (0 seed, 1 sprout, 2 growing, 3 ripe), ripe, thirsty (it can be watered now),
 * wilted (missed a day: it waits for its water), resting (out of season: it waits for its season), watered (has had
 * today's water), days, need}. Null for an empty spot.
 */
export function plantState(state, key, now = new Date()) {
  const p = farmOf(state).plots[key];
  const c = p && cropById(p.crop);
  if (!c) return null;
  const today = dayNumber(now);
  const ripe = p.days >= c.days;
  const resting = !ripe && !inSeason(c, now);
  const watered = p.lastWater === today; // (`last`: the day it was planted or last watered, for wilting)
  const stage = ripe ? 3 : p.days === 0 ? 0 : p.days * 2 >= c.days ? 2 : 1;
  return {
    crop: c, stage, ripe, resting, watered, days: p.days, need: c.days,
    thirsty: !ripe && !resting && !watered,
    wilted: !ripe && !resting && !watered && today - p.last >= 2,
    half: !!(p.wet && p.wet.d === today && p.wet.n > 0 && !watered), // (one wrong answer: a little water)
  };
}

/**
 * Water a plant with an answer: right, it has its water for today (one more day towards ripening); wrong, a little
 * (two wrong answers make a watering). Returns {grew (a day counted), ripe, revived (it had wilted)} or an error
 * message string.
 */
export function water(state, key, correct, now = new Date()) {
  const f = farmOf(state);
  const p = f.plots[key];
  const s = plantState(state, key, now);
  if (!p || !s) return "Nothing is growing there.";
  if (s.ripe) return "It's ripe: harvest it.";
  if (s.resting) return "It's resting until its season comes back.";
  if (s.watered) return "It has had its water today.";
  const today = dayNumber(now);
  if (!p.wet || p.wet.d !== today) p.wet = { d: today, n: 0 };
  p.wet.n += correct ? 2 : 1;
  touch(f, now);
  if (p.wet.n < 2) return { grew: false, ripe: false, revived: false };
  const revived = s.wilted;
  p.days++;
  p.last = today;
  p.lastWater = today;
  delete p.wet;
  return { grew: true, ripe: p.days >= cropById(p.crop).days, revived };
}

/** A harvest's rarity: the flashcards' odds at this luck (loot.js chances), Legendary at most. Not counted in the
 * flashcards' luck record (loot.roll's), so the farm never moves their pity. */
export function rollTier(luck = 1, rand = Math.random) {
  const p = chances(luck).slice(0, LEGENDARY + 1);
  let x = rand() * p.reduce((a, b) => a + b, 0);
  for (let i = p.length - 1; i > 0; i--) { if (x < p[i]) return i; x -= p[i]; }
  return 0;
}

/** The barn's key for a harvest: its crop and its rarity tier. */
export const barnKey = (id, tier) => `${id}:${tier}`;
/** What waits in the barn: [{crop, tier, n}], rarest first, then by crop. */
export function barnList(state) {
  const out = [];
  for (const [k, n] of Object.entries(farmOf(state).barn)) {
    const [id, t] = k.split(":");
    const c = cropById(id);
    if (c && n > 0) out.push({ crop: c, tier: Math.max(0, Math.min(TIERS.length - 1, Number(t) || 0)), n });
  }
  return out.sort((a, b) => b.tier - a.tier || CROPS.indexOf(a.crop) - CROPS.indexOf(b.crop));
}

/**
 * Harvest a ripe plant: its rarity rolled as fishing's catches are (loot.js roll; Legendary at most, a pumpkin's
 * golden one), how many it gives, all into the barn; the spot is empty again. Returns {crop, tier, n} or an error.
 */
export function harvest(state, key, rand = Math.random, now = new Date()) {
  const f = farmOf(state);
  const s = plantState(state, key, now);
  if (!s) return "Nothing is growing there.";
  if (!s.ripe) return "It isn't ripe yet.";
  const c = s.crop;
  const tier = rollTier(1 + c.days / 10, rand);
  const [lo, hi] = c.give;
  const n = lo + Math.floor(rand() * (hi - lo + 1));
  f.barn[barnKey(c.id, tier)] = (f.barn[barnKey(c.id, tier)] || 0) + n;
  delete f.plots[key];
  f.dex = f.dex && typeof f.dex === "object" ? f.dex : {};
  f.dex[c.id] = Math.max(f.dex[c.id] || 0, tier + 1); // (the Cropdex: the rarest of each crop grown)
  touch(f, now);
  return { crop: c, tier, n };
}
