// Fishing: reviewing words is how you fish (the owner chose it as the first mini-game: "make reviewing words
// addictive"). The rules, with no screen code (fishing-ui.js draws the pond; fishscreen.js the Fishing screen).
//
// - The pond shows what's due: each word due for review is a fish shadow in the water, and a bigger shadow is a
//   luckier fish (a due word, one that is often missed, a boss word). Once the due words are caught there is still
//   practice fishing on other words, at lower luck.
// - Cast, bite, answer: a fish bites and its word's card comes up: the meaning in the learner's own language, four
//   choices in the language being learnt (rules.pickQuestion, as in battles). A right answer hooks it. The answer is
//   recorded as a review exactly as battles record theirs (rules.answerQuestion), so fishing really is review.
// - Each catch rolls on the shared ten tiers (loot.js rollAnswer: luck, streaks, pity and boss words, shared with the
//   flashcards). A Legendary or better fights back: one or two more right answers in a row to land it; a wrong one
//   and it gets away: it waits in that pond for the rest of the day and is the next fish hooked there, for another
//   try. A wrong answer always lets the fish go, and the word comes back sooner.
// - What fish are for: the Fishdex (every fish at every tier), an aquarium in the habitat that friends see, food
//   for the creature (hearts), coins, and pearls (inside the rarer ones) that buy better rods (more luck).
// Rules kept on purpose: nothing here is bought with money or coins that makes a roll (rods are bought with pearls,
// which only fishing finds); nothing adds strength in battles between people; an answer given too fast to have
// been read doesn't roll (loot.js decides: a Common is all it lands), and a wrong one makes the creature re-bait.

import { FISH, FISH_ART, HARD_LUCK, HOME_LUCK, PEARLS, PONDS, RODS, SELL, SHADOWS, TANK_SIZE, TIER_GROWTH, fishById, fishOf, pondById } from "./fishdata.js";
import { answerQuestion, dayKey, dayNumber, fade, pickQuestion, quizzable, weekNumber } from "./rules.js";
import { rng } from "./genome.js";
import { hideAnswer } from "../review/deck.js";
import { feed } from "./idle.js";
import { LEGENDARY, TIERS, rollAnswer } from "./loot.js";

export { FISH, PONDS, RODS, TANK_SIZE, fishById, fishOf, pondById };

export const TIERS_N = TIERS.length;  // Common .. Eternal (loot.js)
export const BAG_SIZE = 60;           // fish the basket holds; past that the cheapest is sold for you
export const MAX_SHADOWS = 12;        // shadows swimming at once (more wait their turn)
export const PRACTICE_SHADOWS = 6;    // practice shadows once nothing is due
export const CATCH_FULL = 40;         // the day's first 40 catches sell at full price...
export const CATCH_FLOOR = 120;       // ...then less (rules.fade), and nothing after 120
export const DEX_TOTAL = FISH.length * TIERS_N;

const uidOf = (v) => String(v.uid || v.id);
const meaningOf = (v) => String(v.meaning || "").trim();
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const int = (v, lo, hi, d = lo) => (Number.isFinite(Number(v)) ? Math.max(lo, Math.min(hi, Math.round(Number(v)))) : d);

// ---------- the saved part: state.fishing ----------

const blank = () => ({
  pond: "tide",          // the pond last fished
  rod: 0, rods: [0],     // the rod in use (RODS index) and the ones owned
  pearls: 0,
  caught: 0,             // fish landed, ever
  dex: {},               // fish id -> the tiers caught, as bits (1 << tier)
  best: {},              // fish id -> the longest caught, in cm
  bag: [],               // the basket: {sp, t, cm, w (coins it sells for)}
  tank: [],              // the aquarium: {sp, t, cm}
  week: { n: 0, best: null },   // this week's biggest catch {sp, t, cm}
  escaped: null,         // the big one that got away today: {day, pond, sp, t}
  day: { key: "", n: 0 },       // catches today (selling price fades after CATCH_FULL)
});

/** A fish as saved: {sp, t, cm} (and `w` in the basket), or null when it isn't one the game has. */
export function cleanFish(v, withWorth = false) {
  if (!isObj(v) || !fishById(v.sp)) return null;
  const out = { sp: v.sp, t: int(v.t, 0, TIERS_N - 1, 0), cm: Math.max(1, Math.min(999, Math.round(Number(v.cm) * 10) / 10 || 1)) };
  if (withWorth) out.w = int(v.w, 0, 1000, SELL[out.t]);
  return out;
}

/** state.fishing made safe to use (older saves have none; hand-edited ones may hold anything). */
export function cleanFishing(v) {
  const f = blank();
  if (!isObj(v)) return f;
  f.pond = PONDS.some((p) => p.id === v.pond) ? v.pond : "tide";
  f.rods = [...new Set([0, ...(Array.isArray(v.rods) ? v.rods : [])].map((r) => int(r, 0, RODS.length - 1, 0)))].sort();
  f.rod = f.rods.includes(int(v.rod, 0, RODS.length - 1, 0)) ? int(v.rod, 0, RODS.length - 1, 0) : 0;
  f.pearls = int(v.pearls, 0, 1e6, 0);
  f.caught = int(v.caught, 0, 1e7, 0);
  if (isObj(v.dex)) for (const fish of FISH) if (Number.isInteger(v.dex[fish.id])) f.dex[fish.id] = v.dex[fish.id] & ((1 << TIERS_N) - 1);
  if (isObj(v.best)) for (const fish of FISH) if (Number(v.best[fish.id]) > 0) f.best[fish.id] = Math.min(999, Number(v.best[fish.id]));
  f.bag = (Array.isArray(v.bag) ? v.bag : []).map((x) => cleanFish(x, true)).filter(Boolean).slice(-BAG_SIZE);
  f.tank = (Array.isArray(v.tank) ? v.tank : []).map((x) => cleanFish(x)).filter(Boolean).slice(0, TANK_SIZE);
  if (isObj(v.week)) f.week = { n: int(v.week.n, 0, 1e6, 0), best: cleanFish(v.week.best) };
  if (isObj(v.escaped) && typeof v.escaped.day === "string" && fishById(v.escaped.sp)) {
    f.escaped = { day: v.escaped.day.slice(0, 10), pond: pondById(v.escaped.pond).id, sp: v.escaped.sp, t: int(v.escaped.t, 0, TIERS_N - 1, 0) };
  }
  if (isObj(v.day) && typeof v.day.key === "string") f.day = { key: v.day.key.slice(0, 10), n: int(v.day.n, 0, 1e6, 0) };
  return f;
}

const cleaned = new WeakSet();
/** The fishing part of a game state, made and cleaned the first time it is asked for. */
export function fishingOf(state) {
  if (!cleaned.has(state) || !isObj(state.fishing)) {
    state.fishing = cleanFishing(state.fishing);
    cleaned.add(state);
  }
  return state.fishing;
}

// ---------- the ponds ----------

/** What opens a pond and how far the owner has got: {open, gyms, caught, haveGyms, haveCaught}. */
export function pondNeed(state, id) {
  const need = pondById(id).open;
  const haveGyms = Math.max(0, Number(state.gyms && state.gyms.beaten) || 0);
  const haveCaught = fishingOf(state).caught;
  if (!need) return { open: true, gyms: 0, caught: 0, haveGyms, haveCaught };
  return { open: haveGyms >= need.gyms || haveCaught >= need.caught, gyms: need.gyms, caught: need.caught, haveGyms, haveCaught };
}
export const pondOpen = (state, id) => pondNeed(state, id).open;

/** How lucky a cast in pond `id` is, as a factor on the roll's luck: the rod, and the creature's own element's water. */
export function luckOf(state, id) {
  const f = fishingOf(state);
  const home = state.creature && state.creature.type === pondById(id).id;
  return Math.round(RODS[f.rod].luck * (home ? HOME_LUCK : 1) * 1000) / 1000;
}

// ---------- the shadows: which words swim in the pond ----------

/** A word the pond can ask: it has a meaning, and the meaning doesn't give the word away. */
const askable = (v) => !!hideAnswer(meaningOf(v), v.text);

/**
 * What a word is in the pond: {cls, due, extra, hard, rank}. Due: the game's own review record says its wait is over,
 * or the game has never asked it (as the Battle screen counts "words due": rules.reviewSummary). A word asked lately
 * that isn't due again is practice. `rank` orders the due ones: 0 a word whose wait is over, 1 one never asked that
 * the flashcards have due (`flashDue`, a Set of word ids), 2 any other never asked. `boss`: loot.js isBoss.
 */
export function classify(state, v, { today, flashDue = null, boss = () => false }) {
  const uid = uidOf(v);
  const r = state.review && state.review[uid];
  if (r && r[1] > today) return { cls: "s", due: false, extra: true, hard: false, rank: 3 };
  const hard = !!r && r[3] > 0 && r[3] >= r[2];
  return { cls: boss(uid) ? "boss" : hard ? "l" : "m", due: true, extra: false, hard, rank: r ? 0 : flashDue && flashDue.has(uid) ? 1 : 2 };
}

/** Which of the pond's three fish a shadow of class `cls` is (rand: 0..1). */
export function pickKind(pond, cls, rand) {
  const kinds = fishOf(pond);
  const w = SHADOWS[cls].kinds;
  let roll = rand() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < kinds.length; i++) { roll -= w[i]; if (roll < 0) return kinds[i].id; }
  return kinds[kinds.length - 1].id;
}

/** A number from a word id and the day, so a word's fish stays the same kind all day. */
function seedOf(uid, day) {
  let h = 2166136261 ^ day;
  for (const ch of String(uid)) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
  return h >>> 0;
}

const ORDER = { boss: 0, l: 1, m: 2, s: 3 };

/**
 * The pond's shadows: {due, practice, shadows}. `due` = how many words are due (all of them, the number shown on the
 * pond), `shadows` = what swims now: the due ones first (boss words, then the often missed, then the rest; at most
 * MAX_SHADOWS; among equals the longest overdue, then words never asked), or once nothing is due PRACTICE_SHADOWS
 * practice ones (the words that come due soonest). Each shadow:
 * {uid, cls, due, extra, hard, sp (its fish), luck}. `skip`: word ids not to put in the water (already out of it).
 */
export function pondShadows(state, vocab, { pond = "tide", now = new Date(), flashDue = null, boss = () => false, skip = null } = {}) {
  const today = dayNumber(now);
  const words = quizzable(vocab).filter(askable);
  const base = luckOf(state, pond);
  const all = words.map((v) => ({ v, ...classify(state, v, { today, flashDue, boss }) }));
  const due = all.filter((w) => w.due);
  const out = (w) => {
    const uid = uidOf(w.v);
    return { uid, cls: w.cls, due: w.due, extra: w.extra, hard: w.hard, sp: pickKind(pond, w.cls, rng(seedOf(uid, today))),
             luck: Math.round(base * (w.hard ? HARD_LUCK : 1) * 1000) / 1000 };
  };
  const free = (w) => !(skip && skip.has(uidOf(w.v)));
  if (due.length) {
    const list = due.filter(free).sort((a, b) => ORDER[a.cls] - ORDER[b.cls] || a.rank - b.rank || dueSince(state, a.v) - dueSince(state, b.v)
      || seedOf(uidOf(a.v), today) - seedOf(uidOf(b.v), today));
    return { due: due.length, practice: false, shadows: list.slice(0, MAX_SHADOWS).map(out) };
  }
  // Nothing due: practice on the words that come due soonest, a few at a time.
  const list = all.filter(free).sort((a, b) => dueSince(state, a.v) - dueSince(state, b.v) || (seedOf(uidOf(a.v), today) - seedOf(uidOf(b.v), today)));
  return { due: 0, practice: true, shadows: list.slice(0, PRACTICE_SHADOWS).map(out) };
}
/** The day a word was next due (the game's record), or -1 for one never asked: the longest waiting come first. */
const dueSince = (state, v) => { const r = state.review && state.review[uidOf(v)]; return r ? r[1] : -1; };

/** Can the pond ask questions at all (pickQuestion needs four different meanings)? */
export const canFish = (state, vocab) => quizzable(vocab).some(askable) && !!pickQuestion(state, vocab, () => 0.5);

/**
 * The card for shadow `uid`: the meaning, and four words to choose from (rules.pickQuestion, exactly as battles ask),
 * always about this word. null when it can't be asked. `dict`: dictwords.js, as in battles.
 */
export function questionFor(state, vocab, uid, { rand = Math.random, now = new Date(), dict = null } = {}) {
  // pickQuestion asks among the words not in `avoid`: everything but this one.
  const others = { includes: (id) => id !== uid };
  const q = pickQuestion(state, vocab, rand, now, others, dict);
  return q && q.uid === uid ? q : null;
}

// ---------- an answer: recorded as a review, then rolled ----------

/**
 * Record one answer about word `uid`: as a review (rules.answerQuestion, the same as in battles) and as a roll
 * (loot.js rollAnswer, which also needs the wrong ones: they end the answer streak and make boss words). `ms`: how
 * long the answer took. Returns {review, roll}: answerQuestion's result and rollAnswer's. (`roller`: for tests.)
 */
export function record(state, { uid, correct, ms, due, extra, luck }, rand = Math.random, now = new Date(), roller = rollAnswer) {
  const review = answerQuestion(state, uid, !!correct, now);
  const roll = roller(state, { source: "fish", correct: !!correct, ms: Math.max(0, Number(ms) || 0), uid, due: !!due, extra: !!extra, luck: luck || 1, pay: false }, rand, now);
  return { review, roll: roll || { rolled: false, why: "spent" } };
}

/** The tier a roll gives the fish: its tier, or a Common when it didn't roll (too fast, or spent). */
export const tierOfRoll = (roll) => (roll && roll.rolled ? int(roll.tier, 0, TIERS_N - 1, 0) : 0);

/** How many more right answers in a row a hooked fish of `tier` needs before it is landed: none below Legendary,
 * one for Legendary to the third tier above it, two for the rarest. */
export function fightLength(tier, legendary = LEGENDARY) {
  if (tier < legendary) return 0;
  return tier < legendary + 3 ? 1 : 2;
}

// ---------- the one that got away ----------

/** A fighting fish got away: it waits in that pond for the rest of the day (the biggest one, if several did). */
export function escape(state, { pond, sp, tier }, now = new Date()) {
  const f = fishingOf(state);
  const prev = f.escaped && f.escaped.day === dayKey(now) && f.escaped.pond === pond ? f.escaped : null;
  if (prev && prev.t >= tier) return prev; // (the bigger one is still out there)
  f.escaped = { day: dayKey(now), pond, sp, t: tier };
  return f.escaped;
}
/** The fish that got away from pond `pond` today, or null. */
export function escapedIn(state, pond, now = new Date()) {
  const e = fishingOf(state).escaped;
  return e && e.day === dayKey(now) && e.pond === pond ? e : null;
}
/**
 * A fish is on the hook: which fish it really is. The one that got away from this pond earlier today is the next one
 * hooked there, when it is at least as rare as what was rolled (so it fights again: a second try at it). Returns
 * {sp, tier, back} (back: it is the one that got away).
 */
export function hook(state, { pond, sp, tier }, now = new Date()) {
  const e = escapedIn(state, pond, now);
  return e && e.t >= tier ? { sp: e.sp, tier: e.t, back: true } : { sp, tier, back: false };
}

// ---------- landing a fish ----------

/** A fish's length: somewhere in its kind's range, longer at higher tiers (rand: 0..1). */
export function lengthOf(sp, tier, rand) {
  const [lo, hi] = fishById(sp).cm;
  return Math.round((lo + (hi - lo) * rand()) * (1 + TIER_GROWTH * tier) * 10) / 10;
}

/** Pearls inside a fish of `tier` (a share below 1 is a chance of one). */
export function pearlsOf(tier, rand) {
  const p = PEARLS[tier] || 0;
  return p >= 1 ? Math.floor(p) : rand() < p ? 1 : 0;
}

/**
 * Land a fish (what hook() said it was, at the best tier its fight rolled): it goes in the basket (when the basket is
 * full, its cheapest fish is sold for you), into the Fishdex, and may hold pearls. Returns {fish, pearls, newKind,
 * newTier, longest, weekBest, sold: coins from a fish sold for room}. `back`: it was the one that got away, which is
 * no longer out there.
 */
export function land(state, { pond, sp, tier, back = false }, rand = Math.random, now = new Date()) {
  const f = fishingOf(state);
  const e = escapedIn(state, pond, now);
  if (e && (back || tier >= e.t)) f.escaped = null;
  const key = dayKey(now);
  if (f.day.key !== key) f.day = { key, n: 0 };
  const worth = Math.round(SELL[tier] * fade(f.day.n, CATCH_FULL, CATCH_FLOOR));
  f.day.n++;
  const fish = { sp, t: tier, cm: lengthOf(sp, tier, rand), w: worth };
  const mask = f.dex[sp] || 0;
  const newKind = !mask;
  const newTier = !(mask & (1 << tier));
  f.dex[sp] = mask | (1 << tier);
  const longest = fish.cm > (f.best[sp] || 0);
  if (longest) f.best[sp] = fish.cm;
  const week = weekNumber(now);
  if (f.week.n !== week) f.week = { n: week, best: null };
  const weekBest = !f.week.best || fish.cm > f.week.best.cm;
  if (weekBest) f.week.best = { sp, t: tier, cm: fish.cm };
  const pearls = pearlsOf(tier, rand);
  f.pearls += pearls;
  f.caught++;
  let sold = 0;
  f.bag.push(fish);
  if (f.bag.length > BAG_SIZE) {
    const i = cheapest(f.bag);
    sold = f.bag[i].w;
    state.coins = (Number(state.coins) || 0) + sold;
    f.bag.splice(i, 1);
  }
  state.updated_at = now.getTime() / 1000;
  return { fish, pearls, newKind, newTier, longest, weekBest, sold };
}
/** The basket's least valuable fish (the oldest of them): what goes first when there is no room. */
function cheapest(bag) {
  let best = 0;
  for (let i = 1; i < bag.length; i++) if (bag[i].t < bag[best].t || (bag[i].t === bag[best].t && bag[i].w < bag[best].w)) best = i;
  return best;
}

// ---------- the basket ----------

/** Sell the basket's fish at `indexes`: returns the coins. */
export function sell(state, indexes) {
  const f = fishingOf(state);
  const set = new Set(indexes.filter((i) => i >= 0 && i < f.bag.length));
  let coins = 0;
  for (const i of set) coins += f.bag[i].w;
  f.bag = f.bag.filter((_, i) => !set.has(i));
  state.coins = (Number(state.coins) || 0) + coins;
  return coins;
}
/** Sell every Common and Uncommon in the basket at once: returns {n, coins}. */
export function sellCommon(state) {
  const f = fishingOf(state);
  const idx = f.bag.map((x, i) => (x.t <= 1 ? i : -1)).filter((i) => i >= 0);
  return { n: idx.length, coins: sell(state, idx) };
}

/** Feed the basket's fish at `index` to the creature out in the habitat (a meal: up to idle.FEEDS_PER_DAY a day, and
 * a tide creature loves fish). Returns idle.feed's {bond, loved}, or an error message (the fish stays). */
export function feedFish(state, index, now = new Date()) {
  const f = fishingOf(state);
  if (!(index >= 0 && index < f.bag.length)) return "That fish isn't in your basket.";
  state.items.food_fish = (state.items.food_fish || 0) + 1;
  const r = feed(state, "food_fish", now);
  if (typeof r === "string") { state.items.food_fish--; return r; }
  f.bag.splice(index, 1);
  return r;
}

// ---------- the aquarium ----------

/** Move the basket's fish at `index` into the aquarium (refused when the aquarium is full): "" or why not. */
export function toTank(state, index) {
  const f = fishingOf(state);
  if (!(index >= 0 && index < f.bag.length)) return "That fish isn't in your basket.";
  if (f.tank.length >= TANK_SIZE) return "The aquarium is full. Take a fish out first.";
  const [fish] = f.bag.splice(index, 1);
  f.tank.push({ sp: fish.sp, t: fish.t, cm: fish.cm });
  return "";
}
/** Take the aquarium's fish at `index` back into the basket: "" or why not. */
export function fromTank(state, index) {
  const f = fishingOf(state);
  if (!(index >= 0 && index < f.tank.length)) return "That fish isn't in your aquarium.";
  if (f.bag.length >= BAG_SIZE) return "Your basket is full. Sell some fish first.";
  const [fish] = f.tank.splice(index, 1);
  f.bag.push({ ...fish, w: SELL[fish.t] });
  return "";
}

// ---------- rods ----------

/** Buy rod `i` with pearls (it is used straight away): "" or why not. */
export function buyRod(state, i) {
  const f = fishingOf(state);
  const rod = RODS[i];
  if (!rod) return "There is no such rod.";
  if (f.rods.includes(i)) { f.rod = i; return ""; }
  if (f.pearls < rod.pearls) return `You need ${rod.pearls - f.pearls} more pearls.`;
  f.pearls -= rod.pearls;
  f.rods.push(i);
  f.rods.sort();
  f.rod = i;
  return "";
}

// ---------- the Fishdex ----------

/** Is fish `sp` at `tier` in the Fishdex? */
export const dexHas = (state, sp, tier) => !!((fishingOf(state).dex[sp] || 0) & (1 << tier));
/** How many of the Fishdex's DEX_TOTAL (every fish at every tier) are filled in. */
export function dexCount(state) {
  let n = 0;
  for (const mask of Object.values(fishingOf(state).dex)) for (let t = 0; t < TIERS_N; t++) if (mask & (1 << t)) n++;
  return n;
}
/** A fish's Fishdex line: {id, name, size, tiers: [bool x 10], n, best (cm)}. */
export function dexRow(state, sp) {
  const fish = fishById(sp);
  const mask = fishingOf(state).dex[sp] || 0;
  const tiers = Array.from({ length: TIERS_N }, (_, t) => !!(mask & (1 << t)));
  return { id: sp, name: fish.name, size: fish.size, pond: fish.pond, tiers, n: tiers.filter(Boolean).length, best: fishingOf(state).best[sp] || 0 };
}

// ---------- what friends see ----------

/** My aquarium for friends (and guild-mates) to see, and this week's biggest catch: no words, nothing else. */
export function publicAquarium(state, now = new Date()) {
  const f = fishingOf(state);
  const week = weekNumber(now);
  return { tank: f.tank.map((x) => ({ sp: x.sp, t: x.t, cm: x.cm })), week, best: f.week.n === week ? f.week.best : null, dex: dexCount(state) };
}

/** The biggest catch board: friends' (checked) aquariums and mine, this week's only, longest first.
 * `rows`: [{id, name, me, aquarium}] → [{id, name, me, fish}]. */
export function catchBoard(rows, now = new Date()) {
  const week = weekNumber(now);
  return rows.filter((r) => r && r.aquarium && r.aquarium.week === week && r.aquarium.best)
    .map((r) => ({ id: r.id, name: r.name, me: !!r.me, fish: r.aquarium.best }))
    .sort((a, b) => b.fish.cm - a.fish.cm || b.fish.t - a.fish.t);
}

/** The size of a fish picture, for whoever draws one. */
export const FISH_SIZE = FISH_ART;
