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
import { BUILD_SPOTS, UPGRADE_SPOTS, canPlace, spotXY } from "./farmmap.js";

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
  if (!inSeason(c, now) && !underGlass(state, key)) return "Those seeds are out of season: plant them under the greenhouse's glass, or wait for their season.";
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
  const resting = !ripe && !inSeason(c, now) && !underGlass(state, key); // (slice 5: the greenhouse's row grows any season)
  const watered = p.lastWater === today; // (`last`: the day it was planted or last watered, for wilting)
  const stage = ripe ? 3 : p.days === 0 ? 0 : p.days * 2 >= c.days ? 2 : 1;
  return {
    crop: c, stage, ripe, resting, watered, days: p.days, need: c.days,
    thirsty: !ripe && !resting && !watered,
    wilted: !ripe && !resting && !watered && today - p.last >= 2 && !sprinklerOn(state), // (slice 5: the sprinkler keeps them fresh)
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
  const need = cropById(p.crop).days;
  const lit = lanternLit(state, now) && nearTier(state, "lantern", key) > 0; // (the Page Lantern: a reading day)
  p.days = Math.min(need, p.days + (lit ? 2 : 1));
  p.last = today;
  p.lastWater = today;
  delete p.wet;
  if (f.lastFarmDay !== today) { f.lastFarmDay = today; f.farmDays = (Number(f.farmDays) || 0) + 1; } // (days watered: the sprinkler is earned)
  return { grew: true, ripe: p.days >= need, revived, lantern: lit };
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
  if (barnCount(state) >= barnCap(state)) return "Your barn is full. Sell, cook or feed some first, or build a bigger barn: the crop waits, ripe.";
  const c = s.crop;
  const tier = rollTier((1 + c.days / 10) * stoneLuck(state) * (level(state, "scarecrow") ? 1.25 : 1), rand); // (the Memory Stone, the scarecrow: luck)
  const [lo, hi] = c.give;
  const bees = beesToday(state, now) ? nearTier(state, "hive", key) : 0; // (bees about: one more, two near a big hive)
  const n = lo + Math.floor(rand() * (hi - lo + 1)) + (bees ? (bees >= 3 ? 2 : 1) : 0) + (level(state, "compost") && rand() < 0.5 ? 1 : 0); // (the compost bin)
  f.barn[barnKey(c.id, tier)] = (f.barn[barnKey(c.id, tier)] || 0) + n;
  delete f.plots[key];
  f.dex = f.dex && typeof f.dex === "object" ? f.dex : {};
  f.dex[c.id] = Math.max(f.dex[c.id] || 0, tier + 1); // (the Cropdex: the rarest of each crop grown)
  const wk = weekNumber(now); // (this week's harvests, for the friends' harvest board: publicFarm)
  if (!f.week || f.week.n !== wk) f.week = { n: wk, count: 0, best: null };
  f.week.count += n;
  if (!f.week.best || tier > f.week.best.t) f.week.best = { c: c.id, t: tier };
  touch(f, now);
  return { crop: c, tier, n };
}

// ---------- the garden's buildings on the farm, and their farm jobs (slice 2) ----------
// Each building does a farm job matched to its study habit (the owner's plan):
//   Word Sprout (looking words up): a seed tree; looked-up words drop free seeds (one each `SPROUT_EVERY[tier]`
//     lookups, at most 2 + tier a day, of this week's crops).
//   Echo Shell (listening): a rain chime; each `ECHO_EVERY[tier]` seconds of listening today waters one thirsty plant.
//   Page Lantern (reading): on a day with 10 minutes of reading, a plant near it grows two days for one watering.
//   Spelling Bee Hive (saving words; the Ink Well's place): each word saved today brings a bee (3 a tier at most);
//     with bees about, crops near it give one more (two near a big hive); every few words saved make honey (recipes).
//   Memory Stone (knowing words well): well-known words make better harvests everywhere (more luck on the roll).
// Minutes and saved words count, taps don't (the owner's rule); nothing here is bought.
export const SPROUT_EVERY = [0, 10, 7, 5];
export const ECHO_EVERY = [0, 600, 480, 360];
export const LANTERN_READ = 600;
export const HONEY_EVERY = [0, 6, 5, 4];
const MATURE = 4; // (rules.MATURE_BOX: a word well known)
export const FARM_KIND = { word_sprout: "sprout", echo_shell: "echo", page_lantern: "lantern", ink_well: "hive", memory_stone: "stone" };

/** The garden's buildings standing on the farm: [{i (its slot), id, kind, tier, x, y}] (not the Star Loom). */
export function buildingsOn(state) {
  const plots = state.idle && Array.isArray(state.idle.plots) ? state.idle.plots : [];
  const out = [];
  plots.forEach((p, i) => {
    if (!p || !p.tier || !FARM_KIND[p.id]) return;
    const at = p.at && Number.isFinite(p.at.x) && Number.isFinite(p.at.y) ? p.at : BUILD_SPOTS[i] || BUILD_SPOTS[0];
    out.push({ i, id: p.id, kind: FARM_KIND[p.id], tier: p.tier, x: at.x, y: at.y });
  });
  return out;
}
/** The best tier of a farm job's building (0: none built). */
const tierOf = (state, kind) => buildingsOn(state).filter((b) => b.kind === kind).reduce((m, b) => Math.max(m, b.tier), 0);
/** The tier of the biggest building doing `kind` within reach of field spot `key` ((3 + tier) tiles; 0: none near). */
export function nearTier(state, kind, key) {
  const [c, r] = String(key).split(",").map(Number);
  const at = spotXY(c, r);
  return buildingsOn(state).filter((b) => b.kind === kind && Math.hypot(b.x - at.x, b.y - at.y) <= (3 + b.tier) * 16)
    .reduce((m, b) => Math.max(m, b.tier), 0);
}
const dayKeyOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const isToday = (state, now) => !!(state.day && state.day.key === dayKeyOf(now));
/** Bees out today around the Spelling Bee Hive: one a word saved today, three a tier at most. */
export const beesToday = (state, now = new Date()) => { const t = tierOf(state, "hive"); return t && isToday(state, now) ? Math.min(3 * t, Number(state.day.saves) || 0) : 0; };
const matureCount = (state) => Object.values(state.review || {}).filter((r) => Array.isArray(r) && r[0] >= MATURE).length;
/** The harvest luck the Memory Stone gives: 1 without one; with one, more for its tier and for words known well. */
export const stoneLuck = (state) => { const t = tierOf(state, "stone"); return t ? 1 + 0.2 * t + Math.min(0.9, matureCount(state) / 200) : 1; };
/** Is today a reading day for the Page Lantern? */
export const lanternLit = (state, now = new Date()) => isToday(state, now) && (Number(state.day.read) || 0) >= LANTERN_READ;

/**
 * Let the farm jobs happen: the Word Sprout's seeds for lookups, the Echo Shell's waterings for listening, the hive's
 * honey for saved words. Safe to call often (it counts only what is new). Returns {seeds: [crop ids], watered: [keys],
 * honey: n} for the screen to show.
 */
export function farmJobs(state, rand = Math.random, now = new Date()) {
  const f = farmOf(state);
  const day = dayKeyOf(now);
  const j = f.jobs && typeof f.jobs === "object" ? f.jobs : (f.jobs = {});
  if (j.day !== day) { j.day = day; j.seeds = 0; j.echo = 0; }
  const out = { seeds: [], watered: [], honey: 0 };
  // the Word Sprout: lookups since last time (only counted once one stands)
  const lookups = Number((state.stats || {}).lookups) || 0;
  const sprout = tierOf(state, "sprout");
  if (!Number.isFinite(j.lookups) || !sprout) j.lookups = lookups;
  if (sprout) {
    j.acc = (Number(j.acc) || 0) + Math.max(0, lookups - j.lookups);
    j.lookups = lookups;
    const sale = seedsOnSale(now);
    while (j.acc >= SPROUT_EVERY[sprout] && j.seeds < 2 + sprout && sale.length) {
      j.acc -= SPROUT_EVERY[sprout];
      j.seeds++;
      const c = sale[Math.floor(rand() * sale.length)];
      f.seeds[c.id] = (f.seeds[c.id] || 0) + 1;
      out.seeds.push(c.id);
    }
    if (j.seeds >= 2 + sprout) j.acc = 0; // (the day's seeds are all dropped: nothing banks for tomorrow)
  }
  // the Echo Shell: today's listening waters the thirstiest plants (wilted ones first)
  const echo = tierOf(state, "echo");
  if (echo && isToday(state, now)) {
    const due = Math.floor((Number(state.day.listen) || 0) / ECHO_EVERY[echo]);
    while (j.echo < due) {
      const thirsty = spots(state).map((s) => ({ s, st: plantState(state, s.key, now) })).filter((x) => x.st && x.st.thirsty)
        .sort((a, b) => Number(b.st.wilted) - Number(a.st.wilted) || a.st.days - b.st.days);
      if (!thirsty.length) break;
      j.echo++;
      water(state, thirsty[0].s.key, true, now);
      out.watered.push(thirsty[0].s.key);
    }
  }
  // the sprinkler (earned): two thirsty plants watered each day
  if (sprinklerOn(state) && j.sprinkled !== day) {
    j.sprinkled = day;
    let left = 2;
    for (const s of spots(state)) {
      if (!left) break;
      const st = plantState(state, s.key, now);
      if (st && st.thirsty && typeof water(state, s.key, true, now) === "object") { out.watered.push(s.key); left--; }
    }
  }
  // the hive's honey: a jar every few words saved today
  const hive = tierOf(state, "hive");
  const saves = isToday(state, now) ? Number(state.day.saves) || 0 : 0;
  if (j.savesDay !== day) { j.savesDay = day; j.saves = 0; }
  if (hive && saves > j.saves) {
    const before = Math.floor(j.saves / HONEY_EVERY[hive]);
    j.saves = saves;
    out.honey = Math.floor(saves / HONEY_EVERY[hive]) - before;
    f.honey = Math.min(99, (Number(f.honey) || 0) + out.honey);
  } else if (!hive) j.saves = saves;
  if (out.seeds.length || out.watered.length || out.honey) touch(f, now);
  return out;
}

/** Move building slot `i` on the farm to (x, y), if it can stand there. Returns an error message, or "". */
export function placeBuilding(state, i, x, y, now = new Date()) {
  const p = state.idle && state.idle.plots && state.idle.plots[i];
  if (!p || !p.tier || !FARM_KIND[p.id]) return "There's no building there.";
  const others = buildingsOn(state).filter((b) => b.i !== i);
  if (!canPlace(x, y, others)) return "It can't stand there. Try an open patch of grass.";
  p.at = { x: Math.round(x), y: Math.round(y) };
  touch(farmOf(state), now);
  return "";
}

// ---------- slice 5: upgrades, the earned sprinkler, decorations, the week's harvests ----------
// Bought with glow (the owner's plan), except the sprinkler, which is EARNED: SPRINKLER_DAYS farm days (days a plant was
// watered). Nothing here adds strength in battles, and none of it is for sale for money.
export const UPGRADES = [
  { id: "can", name: "Watering can", cost: [300, 1200], text: "One right answer also waters a thirsty plant next to it (two at the second level)." },
  { id: "greenhouse", name: "Greenhouse", cost: [2500], text: "Glass over the top row of your field: anything grows there in any season." },
  { id: "scarecrow", name: "Scarecrow", cost: [600], text: "It keeps the birds off: your harvests come out rarer more often." },
  { id: "compost", name: "Compost bin", cost: [800], text: "Richer soil: a harvest sometimes gives one more." },
  { id: "windmill", name: "Windmill", cost: [3000], text: "Grinds wheat into flour. In the Cookbook, one flour counts as two grain." },
  { id: "barn", name: "Bigger barn", cost: [500, 2000, 6000], text: "Room for more harvests in your barn." },
];
export const BARN_CAP = [80, 200, 500, 1500];
export const SPRINKLER_DAYS = 10;
export const upgradeById = (id) => UPGRADES.find((u) => u.id === id) || null;
/** An upgrade's level (0: not built). */
export function level(state, id) {
  const f = farmOf(state);
  return f.up && Number.isFinite(f.up[id]) ? f.up[id] : 0;
}
/** What the next level of an upgrade costs (null when it is as built as it gets). */
export const upgradeCost = (state, id) => { const u = upgradeById(id); const l = level(state, id); return u && l < u.cost.length ? u.cost[l] : null; };
/** Build an upgrade's next level. Returns an error message, or "". */
export function buyUpgrade(state, glow, id, now = new Date()) {
  const cost = upgradeCost(state, id);
  if (cost === null) return upgradeById(id) ? "It's built as far as it goes." : "There's no such upgrade.";
  if (glow.glow < cost) return `You need ${Math.ceil(cost - glow.glow)} more glow.`;
  glow.glow -= cost;
  const f = farmOf(state);
  if (!f.up || typeof f.up !== "object") f.up = {};
  f.up[id] = level(state, id) + 1;
  touch(f, now);
  return "";
}
/** How much the barn holds, and how much is in it. */
export const barnCap = (state) => BARN_CAP[Math.min(BARN_CAP.length - 1, level(state, "barn"))];
export const barnCount = (state) => Object.values(farmOf(state).barn).reduce((n, k) => n + (Number(k) || 0), 0);
/** Is the sprinkler earned (SPRINKLER_DAYS days a plant was watered)? */
export const sprinklerOn = (state) => (Number(farmOf(state).farmDays) || 0) >= SPRINKLER_DAYS;
/** Is field spot `key` under the greenhouse's glass (its top row, once built)? */
export const underGlass = (state, key) => level(state, "greenhouse") > 0 && String(key).split(",")[1] === "0";

/** The watering can: after a right answer, water up to its level's thirsty neighbours of `key`. Returns their keys. */
export function waterAround(state, key, now = new Date()) {
  const n = level(state, "can");
  if (!n) return [];
  const [c, r] = String(key).split(",").map(Number);
  const near = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]].map(([dc, dr]) => `${c + dc},${r + dr}`);
  const out = [];
  for (const k of near) {
    if (out.length >= n) break;
    const st = plantState(state, k, now);
    if (st && st.thirsty && typeof water(state, k, true, now) === "object") out.push(k);
  }
  return out;
}

/** The windmill: grind wheat from the barn (commonest first) into flour. Returns how many were ground, or an error. */
export function grind(state, n = 1, now = new Date()) {
  if (!level(state, "windmill")) return "Build the windmill first.";
  const f = farmOf(state);
  let done = 0;
  for (const key of Object.keys(f.barn).filter((k) => k.startsWith("wheat:")).sort()) {
    while (done < n && f.barn[key] > 0) { f.barn[key]--; done++; }
    if (!f.barn[key]) delete f.barn[key];
  }
  if (!done) return "You have no wheat to grind.";
  f.flour = (Number(f.flour) || 0) + done;
  touch(f, now);
  return done;
}

// Decorations with no power at all (the owner's plan): bought with glow, placed anywhere on the farm, moved, put away.
export const DECOR = [
  { id: "flowerbed", name: "Flower bed", cost: 120, prop: "bush_flower" },
  { id: "stones", name: "Stepping stones", cost: 60, art: "farm/stones.png" },
  { id: "bench", name: "Bench", cost: 150, prop: "bench" },
  { id: "picnic", name: "Picnic table", cost: 250, prop: "table" },
  { id: "lamp", name: "Lamp post", cost: 200, prop: "lamp_post" },
  { id: "weathervane", name: "Weathervane", cost: 300, art: "farm/weathervane.png" },
  { id: "haystack", name: "Haystack", cost: 100, prop: "haystack" },
  { id: "cart", name: "Cart", cost: 250, prop: "cart" },
];
export const DECOR_MAX = 24;
export const decorById = (id) => DECOR.find((d) => d.id === id) || null;
/** The farm's decorations: [{i, id, x, y}]. */
export function decorOn(state) {
  const f = farmOf(state);
  return (Array.isArray(f.decor) ? f.decor : []).map((d, i) => ({ i, ...d })).filter((d) => decorById(d.id));
}
/** Everything standing on the farm a new thing mustn't stand on: buildings, decorations, the upgrades. */
const standing = (state, skip = null) => [...buildingsOn(state).map((b) => ({ x: b.x, y: b.y })),
  ...decorOn(state).filter((d) => d.i !== skip).map((d) => ({ x: d.x, y: d.y })), ...UPGRADE_SPOTS];
/** Buy a decoration: it stands on the first open patch of grass (move it after). Returns an error message, or "". */
export function buyDecor(state, glow, id, now = new Date()) {
  const d = decorById(id);
  const f = farmOf(state);
  if (!d) return "There's no such decoration.";
  if (decorOn(state).length >= DECOR_MAX) return "Your farm has all the decorations it can hold.";
  if (glow.glow < d.cost) return `You need ${Math.ceil(d.cost - glow.glow)} more glow.`;
  const others = standing(state);
  let at = null;
  for (let y = 136; y >= 40 && !at; y -= 12) for (let x = 24; x <= 560 && !at; x += 16) if (canPlace(x, y, others)) at = { x, y };
  if (!at) return "There's no open patch of grass left. Move something first.";
  glow.glow -= d.cost;
  if (!Array.isArray(f.decor)) f.decor = [];
  f.decor.push({ id, x: at.x, y: at.y });
  touch(f, now);
  return "";
}
/** Move decoration `i` to (x, y). Returns an error message, or "". */
export function placeDecor(state, i, x, y, now = new Date()) {
  const f = farmOf(state);
  if (!Array.isArray(f.decor) || !f.decor[i]) return "There's no decoration there.";
  if (!canPlace(x, y, standing(state, i))) return "It can't stand there. Try an open patch of grass.";
  f.decor[i] = { ...f.decor[i], x: Math.round(x), y: Math.round(y) };
  touch(f, now);
  return "";
}
/** Put decoration `i` away for good: half its glow back. Returns the glow, or an error message string. */
export function removeDecor(state, glow, i, now = new Date()) {
  const f = farmOf(state);
  const d = Array.isArray(f.decor) && f.decor[i] && decorById(f.decor[i].id);
  if (!d) return "There's no decoration there.";
  f.decor.splice(i, 1);
  const back = Math.floor(d.cost / 2);
  glow.glow += back;
  touch(f, now);
  return back;
}

/** What friends may see of the farm (the weekly harvest board, friends only; supabase/v20-farm.sql): this week's
 * harvests and the rarest of them, the field's size, how much of the Cropdex is filled. Never words. */
export function publicFarm(state, now = new Date()) {
  const f = farmOf(state);
  const wk = weekNumber(now);
  const w = f.week && f.week.n === wk ? f.week : { n: wk, count: 0, best: null };
  return { week: wk, n: Math.min(100000, Number(w.count) || 0), best: w.best || null, size: fieldSize(state), dex: Object.keys(f.dex || {}).length };
}
