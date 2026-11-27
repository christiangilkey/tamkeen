// What the farm's harvests are for (prototype "farm", slice 4 of tamkeen-plans/farming-plan.md). Pure: no screen code
// (farm-ui.js shows it; habitat.js, battle.js, loot.js, rules.js and fishing.js read the effects).
//
//   - creature food: any crop is a meal; each element has favourite crops (one a season), and a favourite makes the
//     creature "Well fed" for a day: +5% attack and defence ONLY in battles against the game (battle.fighter vsGame);
//   - fishing bait: a crop makes bait; with bait the pond's luck is a quarter more, one bait a fish landed;
//   - the Cookbook at the cook's pot in the market: dishes cooked from crops and honey, each with one effect;
//   - Muffle orders: three a day in the market ("5 carrots"); filling one pays coins (ORDER_COINS) and wakes a forgotten word;
//   - selling at the fruit stall for glow.
// The owner's rules hold: no money, nothing adds strength between people, nothing dies or spoils, no pay for tapping
// (everything here is grown with answered words first).

import { CROPS, cropById, farmOf, inSeason, seedPrice } from "./farm.js";
import { TYPES } from "./data.js";
import { formOf } from "./genome.js";
import { dayKey } from "./rules.js";

const DAY = 86400;
const sec = (now) => Math.floor(now.getTime() / 1000);
const touch = (f, now) => { f.at = sec(now); };

// ---------- crops by group (what recipes ask for) ----------
export const GROUPS = {
  grain: ["wheat", "corn"],
  fruit: ["strawberry", "blueberry", "melon", "cranberry", "grapes", "apple", "snowberry", "winter_pear", "starfruit"],
  herb: ["basil"],
  gourd: ["pumpkin", "squash", "cucumber", "melon"],
};
GROUPS.veg = CROPS.map((c) => c.id).filter((id) => !GROUPS.grain.includes(id) && !GROUPS.fruit.includes(id) && !GROUPS.herb.includes(id) && id !== "moonflower" && id !== "sunflower");
export const GROUP_NAME = { grain: "Grain", fruit: "Fruit", herb: "Herbs", gourd: "Pumpkin or squash", veg: "Vegetables" };
/** Does crop `id` count as an ingredient `want` (a group name, a crop id, or "honey")? */
export const fits = (id, want) => id === want || (GROUPS[want] || []).includes(id);

// ---------- food ----------
/** Each element's favourite crops, one a season (so one is always growing). */
export const FAVOURITES = {
  ember: ["radish", "pepper", "pumpkin", "garlic"],
  tide: ["lettuce", "melon", "grapes", "snowberry"],
  grove: ["peas", "beans", "apple", "kale"],
  spark: ["strawberry", "corn", "cranberry", "parsnip"],
  stone: ["potato", "cucumber", "sweet_potato", "turnip"],
  dusk: ["onion", "blueberry", "mushroom", "leek"],
};
export const WELL_FED = 1.05;      // attack and defence, against the game only
export const WELL_FED_HOURS = 24;
export const isFavourite = (type, id) => (FAVOURITES[type] || []).includes(id);
/** Is this creature well fed now (a favourite crop in the last day)? */
export const wellFed = (c, now = new Date()) => !!c && Number(c.wellFed) > sec(now);

/** The barn's harvests of crop `id` (any tier), commonest first: [[barnKey, n]]. */
function stock(f, test) {
  return Object.entries(f.barn).filter(([k, n]) => n > 0 && test(k.split(":")[0])).sort((a, b) => Number(a[0].split(":")[1]) - Number(b[0].split(":")[1]));
}
/** How many of an ingredient the barn holds (honey: the jars). */
export function have(state, want) {
  const f = farmOf(state);
  if (want === "honey") return Number(f.honey) || 0;
  const flour = want === "grain" ? 2 * (Number(f.flour) || 0) : 0; // (the windmill's flour: two grain each)
  return stock(f, (id) => fits(id, want)).reduce((n, [, k]) => n + k, 0) + flour;
}
/** Take `n` of an ingredient from the barn, commonest first (honey: jars). False (nothing taken) when there isn't enough. */
function take(f, want, n) {
  if (want === "honey") { if ((Number(f.honey) || 0) < n) return false; f.honey -= n; return true; }
  const list = stock(f, (id) => fits(id, want));
  const flour = want === "grain" ? Number(f.flour) || 0 : 0;
  if (list.reduce((s, [, k]) => s + k, 0) + 2 * flour < n) return false;
  for (const [key, k] of list) {
    const use = Math.min(k, n);
    f.barn[key] -= use;
    if (!f.barn[key]) delete f.barn[key];
    n -= use;
    if (!n) break;
  }
  if (n > 0) f.flour = flour - Math.ceil(n / 2); // (the rest from flour, two grain each)
  return true;
}

/**
 * Feed a crop from the barn (`key`: "crop:tier") to a creature (the one out, or `seed`'s). A meal like any food (idle.feed:
 * three a day, it counts as eating for hunger, hearts), and a favourite makes it Well fed for a day. Returns {loved, wellFed}
 * or an error message string.
 */
export function feedCrop(state, key, seed = null, now = new Date(), feedsPerDay = 3) {
  const f = farmOf(state);
  const c = seed == null ? state.creature : state.roster.find((g) => g.seed === seed);
  const id = String(key).split(":")[0];
  if (!c) return "That creature isn't in your roster.";
  if (!(f.barn[key] > 0) || !cropById(id)) return "You have none of that.";
  if (formOf(c).id === "egg") return "Eggs don't eat. Hatch it first.";
  const today = dayKey(now);
  if (!c.fed || c.fed.day !== today) c.fed = { day: today, n: 0 };
  if (c.fed.n >= feedsPerDay) return "It is full for today.";
  f.barn[key]--;
  if (!f.barn[key]) delete f.barn[key];
  c.fed.n++;
  const loved = isFavourite(c.type, id);
  c.bond = Math.min(10, (c.bond || 0) + (loved ? 2 : 1));
  c.fedAt = Math.max(Number(c.fedAt) || 0, sec(now));
  if (loved) c.wellFed = sec(now) + WELL_FED_HOURS * 3600;
  touch(f, now);
  return { loved, wellFed: loved };
}

// ---------- bait ----------
export const BAIT_PER_CROP = 3;
export const BAIT_LUCK = 1.25;
/** Turn one crop from the barn into bait. Returns an error message, or "". */
export function makeBait(state, key, now = new Date()) {
  const f = farmOf(state);
  if (!(f.barn[key] > 0)) return "You have none of that.";
  f.barn[key]--;
  if (!f.barn[key]) delete f.barn[key];
  f.bait = Math.min(99, (Number(f.bait) || 0) + BAIT_PER_CROP);
  touch(f, now);
  return "";
}

// ---------- selling at the fruit stall ----------
/** What one of a crop sells for at the fruit stall, in glow: a little over its seed's share, more for a rarer one. */
export const sellPrice = (c, tier = 0) => Math.round((seedPrice(c) / 2) * (1 + tier * 0.75));
/** Sell `n` of a harvest. Returns the glow it fetched, or an error message string. */
export function sell(state, glow, key, n = 1, now = new Date()) {
  const f = farmOf(state);
  const [id, t] = String(key).split(":");
  const c = cropById(id);
  if (!c || !(f.barn[key] >= n) || n < 1) return "You don't have that many.";
  f.barn[key] -= n;
  if (!f.barn[key]) delete f.barn[key];
  const got = sellPrice(c, Number(t) || 0) * n;
  glow.glow += got;
  touch(f, now);
  return got;
}

// ---------- the Cookbook ----------
// Each dish: what goes in ([[ingredient, n]]: a group, a crop or honey), and its one effect. `when`: only on a festival day.
export const RECIPES = [
  { id: "picnic", name: "Picnic basket", needs: [["grain", 2], ["fruit", 2]], text: "Your creatures won't get hungry for 3 days." },
  { id: "focus_tea", name: "Focus tea", needs: [["herb", 2], ["honey", 1]], text: "Better luck on your next 20 flashcards." },
  { id: "stew", name: "Growing stew", needs: [["veg", 4]], text: "Today's studying grows your creature half again as fast." },
  ...Object.keys(FAVOURITES).map((type) => ({ id: `pie_${type}`, name: `${TYPES[type] ? TYPES[type].name : type} pie`, type,
    needs: [["grain", 2], [`fav_${type}`, 2]], text: `Your next egg leans to ${TYPES[type] ? TYPES[type].name : type}.` })),
  { id: "berry_tart", name: "Berry tart", needs: [["fruit", 3], ["grain", 1]], text: "Your creature turns a warm berry colour for a day. Only its look changes." },
  { id: "moon_jelly", name: "Moon jelly", needs: [["fruit", 2], ["honey", 1]], text: "Your creature turns a cool moonlit colour for a day. Only its look changes." },
  { id: "lantern_soup", name: "Lantern soup", needs: [["gourd", 1], ["veg", 2]], text: "Tonight your creature glows in the village, and Muffles come over to say a word." },
  { id: "feast", name: "Muffle feast", needs: [["veg", 3], ["fruit", 3], ["grain", 2]], when: "festival", text: "Only on a festival day. The Muffles feast with you, and 3 of their forgotten words wake at once." },
  { id: "champion", name: "Champion's meal", needs: [["veg", 2], ["grain", 2], ["honey", 1]], text: "A boost for your next gym fight: 10% more attack and defence. Only against the game." },
  { id: "porridge", name: "Warm porridge", needs: [["grain", 2], ["honey", 1]], egg: true, text: "Fed to an egg, it raises the lowest talent the egg can roll." },
];
// (an element's pie: its favourite crops)
for (const type of Object.keys(FAVOURITES)) GROUPS[`fav_${type}`] = FAVOURITES[type];
export const recipeById = (id) => RECIPES.find((r) => r.id === id) || null;
/** A festival day in the village: Sundays (the last day of each season's week). */
export const festivalDay = (now = new Date()) => now.getDay() === 0;
/** Can the dish be cooked now: everything in the barn (and a festival, for the feast)? */
export function canCook(state, r, now = new Date()) {
  if (r.when === "festival" && !festivalDay(now)) return false;
  return r.needs.every(([w, n]) => have(state, w) >= n);
}

export const FOCUS_CARDS = 20;
export const CHAMPION_BOOST = 1.1;
export const TINTS = { berry_tart: 330, moon_jelly: 200 }; // (hue turns, for the look only)
/** The farm's dish effects that last: {focus (cards left), stew (its day), lean (an element), champion (gym fights),
 * lantern (its day)}. */
export function buffsOf(state) {
  const f = farmOf(state);
  if (!f.buffs || typeof f.buffs !== "object") f.buffs = {};
  return f.buffs;
}

/**
 * Cook a dish: its ingredients leave the barn, its effect starts. `opts.egg`: the roster index of the egg Warm
 * porridge is for (`opts.porridge(state, index)`: talents.js warmPorridge, given by the caller). Returns {effect} or an
 * error message string. (The feast's woken words are chosen by the caller, who knows the language: `wake`.)
 */
export function cook(state, id, opts = {}, now = new Date()) {
  const r = recipeById(id);
  if (!r) return "There's no such dish.";
  if (r.when === "festival" && !festivalDay(now)) return "The Muffle feast is only cooked on a festival day (Sundays).";
  if (!canCook(state, r, now)) return "You don't have everything it needs.";
  if (r.egg) { // Warm porridge: the egg first (talents.js decides if it can have it)
    const porridge = opts.porridge;
    if (typeof porridge !== "function") return "Warm porridge isn't ready yet.";
    const err = porridge(state, opts.egg);
    if (err) return err;
  }
  const f = farmOf(state);
  for (const [w, n] of r.needs) take(f, w, n);
  const b = buffsOf(state);
  const t = sec(now);
  if (id === "picnic") { // fed for three days: no creature turns hungry until then (idle.isHungry: a day after fedAt)
    for (const c of state.roster || []) if (c && formOf(c).id !== "egg") c.fedAt = Math.max(Number(c.fedAt) || 0, t + 2 * DAY);
  } else if (id === "focus_tea") b.focus = (Number(b.focus) || 0) + FOCUS_CARDS;
  else if (id === "stew") b.stew = dayKey(now);
  else if (r.type) b.lean = r.type;
  else if (TINTS[id] && state.creature) state.creature.tint = { hue: TINTS[id], until: t + DAY };
  else if (id === "lantern_soup") b.lantern = dayKey(now);
  else if (id === "champion") b.champion = (Number(b.champion) || 0) + 1;
  touch(f, now);
  return { effect: id };
}

// ---------- the Muffles' forgotten words, woken ----------
/** Words of the Muffles' that have woken (they show in their speech as if known): keys for `lang`. */
export function wokenKeys(state, lang) {
  const w = farmOf(state).woken;
  return new Set(w && Array.isArray(w[lang]) ? w[lang] : []);
}
/** Wake words (their keys, muffles.readLine's) for `lang`. */
export function wake(state, lang, keys, now = new Date()) {
  const f = farmOf(state);
  if (!f.woken || typeof f.woken !== "object") f.woken = {};
  const list = Array.isArray(f.woken[lang]) ? f.woken[lang] : [];
  for (const k of keys) if (k && !list.includes(k)) list.push(k);
  f.woken[lang] = list.slice(-500);
  touch(f, now);
}

// ---------- Muffle orders ----------
export const ORDER_FOLK = ["grocer", "baker", "barkeep", "florist", "tailor", "fisher"]; // (not the cook: a tap on her opens the Cookbook)
const hash = (s) => { let h = 2166136261; for (const ch of String(s)) h = Math.imul(h ^ ch.codePointAt(0), 16777619) >>> 0; return h; };
/** What a filled order pays, in coins (the owner, 2026-11-27: "I feel like muffle orders should pay you gold"): in line
 * with a battle win (4) and the daily goal (10); three orders a day at most, so 15 a day at most. This bends the old
 * "flashcards pay glow, battles pay coins" rule for orders only. */
export const ORDER_COINS = 5;
/** Today's three orders (the same for everyone on a day): [{i, folk, crop, n, coins, done}]. A Muffle asks for crops
 * of this week, a few of one kind; filling it pays ORDER_COINS and wakes one of their words. */
export function ordersToday(state, now = new Date()) {
  const f = farmOf(state);
  const day = dayKey(now);
  if (!f.orders || f.orders.day !== day) f.orders = { day, done: [] };
  const crops = CROPS.filter((c) => !c.rare && inSeason(c, now));
  const out = [];
  for (let i = 0; i < 3; i++) {
    const h = hash(`${day}:${i}`);
    const c = crops[h % crops.length];
    const n = 2 + ((h >>> 8) % 4);
    out.push({ i, folk: ORDER_FOLK[(h >>> 4) % ORDER_FOLK.length], crop: c, n, coins: ORDER_COINS, done: f.orders.done.includes(i) });
  }
  // (two orders from one Muffle: the later one waits for another day)
  return out.filter((o, k) => out.findIndex((p) => p.folk === o.folk) === k);
}
/** Fill order `i` from the barn: its coins go to `state.coins`. Returns {coins} or an error message string (the
 * caller wakes a word). (`_glow`: kept for the callers; orders paid glow before 2026-11-27.) */
export function fillOrder(state, _glow, i, now = new Date()) {
  const o = ordersToday(state, now).find((x) => x.i === i);
  if (!o) return "There's no such order today.";
  if (o.done) return "You've filled that order.";
  const f = farmOf(state);
  if (!take(f, o.crop.id, o.n)) return "You don't have enough in your barn.";
  f.orders.done.push(i);
  state.coins = (Number(state.coins) || 0) + o.coins;
  touch(f, now);
  return { coins: o.coins };
}
