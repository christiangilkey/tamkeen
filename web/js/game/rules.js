// The rules of the game, with no screen code: what studying earns, how creatures grow and
// evolve, the vocab review that powers battles, the shop, and badges.
//
// The guiding rule (from the design notes): studying earns breadth and identity, not raw power,
// and healthy studying is rewarded rather than volume. So:
//   - the big payout is reaching your own daily goal, the same whether the goal is 5 or 20 minutes;
//   - everything else has steep diminishing returns within a day, so grinding isn't worth it;
//   - a word only pays once a day, so tapping the same word over and over earns nothing;
//   - the bonuses that are hard to fake pay best: words that become well known over weeks,
//     answers that stay accurate, and days kept up.

import { bodyHue, formOf, leadingBranch, newGenome, readyToEvolve, rng, stageOf, weightedPick } from "./genome.js";
import { BADGES, BOSSES, BRANCHES, BRANCH_IDS, CATALOG, TYPES, VARIANTS, WEEKLY_RULES, itemById } from "./data.js";

export const VERSION = 2;
export const GOALS = [5, 10, 20];           // minutes of study a day; the owner chooses
export const DAILY_COMPLETE_XP = 120;
export const COMBO_WINDOW_MS = 30000;       // word lookups: long enough to read a definition first
export const COMBO_STEPS = [1, 1.2, 1.5, 2];
export const ADULT_XP = 6000;               // creature XP for growth 1.0 (about two months of daily goals)
export const MAX_CREATURES = 12;

const TIERS = [
  { id: "common", chance: 0.7, xp: [5, 15] },
  { id: "lucky", chance: 0.2, xp: [30, 50] },
  { id: "jackpot", chance: 0.08, xp: [100, 200] },
  { id: "surprise", chance: 0.02, xp: [0, 0] }, // no XP: an item instead
];
const SURPRISES = ["freeze", "hint"];

export const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
/** Days since 1970 in local time: a plain number, easy to compare and add to. */
export const dayNumber = (d = new Date()) => Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000);
/** Weeks since 1970, changing on Mondays. */
export const weekNumber = (d = new Date()) => Math.floor((dayNumber(d) + 3) / 7);

// ---------- saved state ----------
const freshDay = (key = "") => ({ key, seconds: 0, done: false, taps: 0, saves: 0, xp: 0, words: [], reviews: 0, battles: 0 });

/** `state.creature` is always the creature out in the habitat (one of `state.roster`). */
function attach(state) {
  Object.defineProperty(state, "creature", {
    get() { return this.roster[this.active] || this.roster[0]; },
    enumerable: false, configurable: true,
  });
  return state;
}

export function newState(seed = (Math.random() * 2 ** 32) >>> 0) {
  return attach({
    v: VERSION, xp: 0, coins: 0, goal: 10,
    roster: [newGenome(seed)], active: 0,
    items: { freeze: 1, hint: 0 },
    streak: 0, best_streak: 0, last_complete: "",
    day: freshDay(),
    owned: [],   // ids of items bought
    decor: [],   // decorations standing in the habitat: {id, x}
    scene: "meadow", // which habitat the creature lives in (data.HABITAT.themes)
    tags: [],    // earned by how and when the owner studies and fights
    review: {},  // vocab word -> [box, day it is next due, times right, times wrong]
    stats: { lookups: 0, goals: 0, reviews: 0, right: 0, battles: 0, wins: 0, friend_battles: 0, raids: 0, words: 0 },
    week: { n: 0, right: 0, total: 0, paid: false },
    league: 0,                    // 0 bronze .. 3 diamond: moved by how many days a week the goal is reached
    goalWeek: { n: 0, days: 0 },  // this week's goal days
    raid: 0,                      // the week whose raid reward has been claimed
    rating: 1000, // battle skill, nothing to do with how much has been studied
    rivals: {},   // friend id -> {name, wins, losses}
    showcase: null, // seed of the favourite creature friends see next to my name (null = the one in the habitat)
    badges: [],
    updated_at: 0,
  });
}

/** Make a saved state safe to use (older saves, hand-edited values). */
export function normalize(state) {
  const fresh = newState(1);
  let s = state && typeof state === "object" ? state : null;
  if (s && !Array.isArray(s.roster)) {
    // Saves from before there could be several creatures kept the one creature here.
    const only = Object.prototype.hasOwnProperty.call(s, "creature") ? s.creature : null;
    if (only && Number.isFinite(only.seed)) { s.roster = [only]; s.active = 0; } else s = null;
  }
  if (s) s.roster = s.roster.filter((g) => g && Number.isFinite(g.seed));
  if (!s || !s.roster.length) return fresh;
  if (Object.prototype.hasOwnProperty.call(s, "creature")) delete s.creature;
  attach(s);
  for (const [k, v] of Object.entries(fresh)) if (s[k] === undefined) s[k] = v;
  s.items = { ...fresh.items, ...(s.items || {}) };
  s.day = { ...fresh.day, ...(s.day || {}) };
  s.stats = { ...fresh.stats, ...(s.stats || {}) };
  s.week = { ...fresh.week, ...(s.week || {}) };
  s.goalWeek = { ...fresh.goalWeek, ...(s.goalWeek || {}) };
  const blank = fresh.roster[0];
  for (const g of s.roster) {
    g.traits = { ...blank.traits, ...(g.traits || {}) };
    g.equipped = g.equipped || {};
    g.branches = Array.isArray(g.branches) ? g.branches : g.branch ? [g.branch] : [];
    g.moves = Array.isArray(g.moves) ? g.moves : [];
    if (!Number.isFinite(g.growth)) g.growth = 0;
  }
  for (const k of ["owned", "decor", "tags", "badges"]) if (!Array.isArray(s[k])) s[k] = [];
  for (const k of ["review", "rivals"]) if (!s[k] || typeof s[k] !== "object") s[k] = {};
  if (!(s.active >= 0 && s.active < s.roster.length)) s.active = 0;
  if (!GOALS.includes(s.goal)) s.goal = 10;
  s.v = VERSION;
  return s;
}

export const LEVEL_COST = 10; // every level costs this many times its base price (the owner raised it from 1)

/** Player level from total XP: each level costs a little more than the last. */
export function levelOf(xp) {
  let level = 1;
  let need = 100;
  let left = Math.max(0, xp);
  while (left >= need * LEVEL_COST) { left -= need * LEVEL_COST; level++; need = Math.round(need * 1.12 + 20); }
  return { level, into: left, need: need * LEVEL_COST };
}

/** Start a new day if the date has changed. A missed day spends a streak freeze if there is
 * one; otherwise the streak quietly starts again (nothing else is lost). */
export function rollDay(state, now = new Date()) {
  const key = dayKey(now);
  if (state.day.key === key) return state;
  if (state.last_complete && state.streak) {
    const last = new Date(`${state.last_complete}T12:00:00`);
    const missed = Math.round((new Date(`${key}T12:00:00`) - last) / 86400000) - 1;
    if (missed > 0) {
      if (state.items.freeze >= missed) {
        state.items.freeze -= missed;
        // Count the frozen days as kept, so the streak carries on from today.
        const kept = new Date(`${key}T12:00:00`);
        kept.setDate(kept.getDate() - 1);
        state.last_complete = dayKey(kept);
      } else {
        state.streak = 0;
      }
    }
  }
  state.day = freshDay(key);
  rollLeague(state, now);
  return state;
}

/** How much of a reward still counts after `n` earlier ones today: full, then fading fast. */
export function fade(n, full, floor) {
  if (n < full) return 1;
  if (n < full * 2) return 0.4;
  return n < floor ? 0.1 : 0;
}

/** Roll one variable reward. `rand` is a function returning 0..1. */
export function rollReward(rand) {
  let roll = rand();
  let tier = TIERS[0];
  for (const t of TIERS) { if (roll < t.chance) { tier = t; break; } roll -= t.chance; }
  const xp = Math.round(tier.xp[0] + rand() * (tier.xp[1] - tier.xp[0]));
  return { tier: tier.id, xp, item: tier.id === "surprise" ? SURPRISES[Math.floor(rand() * SURPRISES.length)] : null };
}

/** Double XP while an XP boost is running (see idle.useBoost). */
const boost = (state, now) => (state.boostUntil && now.getTime() / 1000 < state.boostUntil ? 2 : 1);

function grant(state, tag) {
  if (state.tags.includes(tag)) return false;
  state.tags.push(tag);
  return true;
}

/** Give XP to the player and the creature in the habitat. Returns the stage it reached, if it
 * changed: "hatchling", "juvenile", or "ready" (grown enough to evolve when its owner chooses). */
function grow(state, xp, trait) {
  const c = state.creature;
  state.xp += xp;
  state.day.xp += xp;
  const before = formOf(c).id;
  const wasReady = readyToEvolve(c);
  c.growth = Math.min(1, c.growth + xp / ADULT_XP);
  // An egg in the incubator grows at half speed alongside, until it hatches.
  if (state.incubating != null) {
    const egg = state.roster.find((g) => g.seed === state.incubating && g !== c);
    if (!egg || stageOf(egg.growth).id !== "egg") state.incubating = null;
    else { egg.growth = Math.min(1, egg.growth + xp / ADULT_XP / 2); if (stageOf(egg.growth).id !== "egg") state.incubating = null; }
  }
  if (trait) {
    // Traits drift toward what the owner actually does; the others fade a little.
    // (About ten daily goals of one habit to fill a trait, so one busy afternoon doesn't decide it.)
    const step = xp / 1500;
    for (const t of Object.keys(c.traits)) if (t !== trait) c.traits[t] = Math.max(0, c.traits[t] * (1 - step * 0.25));
    c.traits[trait] = Math.min(1, (c.traits[trait] || 0) + step);
  }
  // An adult keeps opening new forms as its owner's habits broaden; it can switch between them.
  if (c.branch) for (const id of BRANCH_IDS) if (!c.branches.includes(id) && c.traits[BRANCHES[id].trait] >= 0.5) c.branches.push(id);
  if (!wasReady && readyToEvolve(c)) return "ready";
  const after = formOf(c).id;
  return before === after ? null : after;
}

/** The day's goal has been reached (by study minutes, or by clearing what was due in Anki): the
 * big payout, the same whatever the goal's size, and the streak and league day that go with it. */
function reachGoal(state, now, out) {
  state.day.done = true;
  out.goalDone = true;
  out.tier = "jackpot";
  out.xp += DAILY_COMPLETE_XP;
  state.coins += 10;
  state.stats.goals++;
  rollLeague(state, now);
  state.goalWeek.days = Math.min(7, state.goalWeek.days + 1);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  state.streak = state.last_complete === dayKey(yesterday) ? state.streak + 1 : 1;
  state.best_streak = Math.max(state.best_streak, state.streak);
  state.last_complete = dayKey(now);
  if (state.streak % 7 === 0) state.items.freeze = Math.min(3, state.items.freeze + 1); // a rest day earned
  if (state.streak >= 7) grant(state, "streak_7");
  out.stage = grow(state, DAILY_COMPLETE_XP, null) || out.stage;
}

/**
 * Daily totals reported by the Anki companion: [{day, reviews, again, matured, due_left}].
 * Anki grades are the learner's own word, so volume barely pays. What pays:
 *   - clearing what was due today, whatever the count (20 cards or 300): that is the day's goal;
 *   - cards becoming mature, which takes weeks of honest answers.
 * Totals for a day only count once however often they are reported. Returns a result like
 * earn()'s, or null when there is nothing new.
 */
export function earnAnki(state, days, now = new Date()) {
  rollDay(state, now);
  state.anki = state.anki && typeof state.anki === "object" ? state.anki : {};
  const levelBefore = levelOf(state.xp).level;
  const out = { type: "anki", xp: 0, tier: "common", item: null, combo: 1, stage: null, levelUp: false, goalDone: false, badges: [], reviews: 0, matured: 0 };
  const today = dayKey(now);
  for (const d of Array.isArray(days) ? days : []) {
    if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(String(d.day))) continue;
    const seen = state.anki[d.day] || { reviews: 0, matured: 0, cleared: false };
    const total = Math.max(0, Math.floor(Number(d.reviews) || 0));
    const mature = Math.max(0, Math.floor(Number(d.matured) || 0));
    let xp = 0;
    for (let i = seen.reviews; i < Math.min(total, 200); i++) xp += fade(i, 60, 200); // a trickle that soon dries up
    xp = Math.round(xp);
    const newlyMature = Math.max(0, Math.min(mature, 10) - Math.min(seen.matured, 10)); // at most ten a day
    xp += newlyMature * 15;
    state.coins += newlyMature;
    if (xp) out.stage = grow(state, xp, "collector") || out.stage;
    out.xp += xp;
    out.reviews += Math.max(0, total - seen.reviews);
    out.matured += newlyMature;
    const cleared = d.due_left === 0 && total > 0;
    if (cleared && !seen.cleared && d.day === today && !state.day.done) reachGoal(state, now, out);
    state.anki[d.day] = { reviews: Math.max(seen.reviews, total), matured: Math.max(seen.matured, mature), cleared: seen.cleared || cleared };
  }
  for (const key of Object.keys(state.anki).sort().slice(0, -14)) delete state.anki[key];
  if (!out.xp && !out.goalDone) return null;
  out.levelUp = levelOf(state.xp).level > levelBefore;
  if (out.levelUp) state.coins += 5;
  out.badges = checkBadges(state);
  state.updated_at = now.getTime() / 1000;
  return out;
}

/**
 * Something happened while studying. Returns what it earned (or null for nothing):
 *   {type, xp, tier, item, combo, stage, levelUp, goalDone, badges}
 * Events: {type: "word", key}            a word was looked up (key identifies the word)
 *         {type: "save"}                 a word was saved to vocab
 *         {type: "study", seconds, mode} time spent listening ("listen") or reading ("read")
 * `ctx` carries {rand, now (Date), combo: {count, at}} so the outcome is reproducible in tests.
 */
export function earn(state, event, ctx = {}) {
  const rand = ctx.rand || Math.random;
  const now = ctx.now || new Date();
  rollDay(state, now);
  const day = state.day;
  const levelBefore = levelOf(state.xp).level;
  const out = { type: event.type, xp: 0, tier: "common", item: null, combo: 1, stage: null, levelUp: false, goalDone: false, badges: [] };

  if (event.type === "word") {
    const key = String(event.key || "");
    if (!key || day.words.includes(key)) return null; // each word pays once a day
    day.words.push(key);
    state.stats.lookups++;
    const reward = rollReward(rand);
    const combo = ctx.combo || { count: 0, at: 0 };
    combo.count = now.getTime() - combo.at <= COMBO_WINDOW_MS ? combo.count + 1 : 0;
    combo.at = now.getTime();
    out.combo = COMBO_STEPS[Math.min(combo.count, COMBO_STEPS.length - 1)];
    out.tier = reward.tier;
    out.item = reward.item;
    out.xp = Math.round(reward.xp * out.combo * fade(day.taps, 40, 120) * boost(state, now));
    day.taps++;
    if (out.item) state.items[out.item] = (state.items[out.item] || 0) + 1;
    if (!out.xp && !out.item) return null;
    out.stage = grow(state, out.xp, "curious");
  } else if (event.type === "save") {
    out.xp = Math.round(20 * fade(day.saves, 15, 45) * boost(state, now));
    day.saves++;
    if (!out.xp) return null;
    state.coins += 1;
    out.stage = grow(state, out.xp, "collector");
  } else if (event.type === "study") {
    const seconds = Math.max(0, Math.min(60, Number(event.seconds) || 0));
    if (!seconds) return null;
    const before = day.seconds;
    day.seconds += seconds;
    if (now.getHours() >= 22) grant(state, "night_owl");
    if (now.getHours() < 7 && now.getHours() >= 4) grant(state, "early_bird");
    const goal = state.goal * 60;
    // A trickle while studying, which dries up well past the goal.
    const rate = before < goal ? 0.25 : before < goal * 3 ? 0.08 : 0;
    out.xp = Math.round(seconds * rate);
    out.stage = grow(state, out.xp, event.mode === "read" ? "reader" : "listener");
    if (!day.done && day.seconds >= goal) {
      reachGoal(state, now, out);
    }
    if (!out.xp) return null;
  } else {
    return null;
  }
  out.levelUp = levelOf(state.xp).level > levelBefore;
  if (out.levelUp) state.coins += 5;
  out.badges = checkBadges(state);
  state.updated_at = now.getTime() / 1000;
  return out;
}

// ---------- evolving: a moment the owner chooses, with more than one way to go ----------

/** The adult forms open to a creature right now: [{id, name, open, why}]. Its strongest habit
 * is always open; the others open once that habit has had real use. */
export function branchOptions(genome) {
  const lead = leadingBranch(genome);
  return BRANCH_IDS.map((id) => {
    const trait = genome.traits[BRANCHES[id].trait] || 0;
    const open = genome.branches.includes(id) || id === lead || trait >= 0.25;
    return { id, name: BRANCHES[id].name, open, why: open ? BRANCHES[id].blurb : `Needs more ${BRANCHES[id].trait === "listener" ? "listening" : BRANCHES[id].trait === "reader" ? "reading" : "word collecting"}` };
  });
}

/** Special forms and whether this owner has earned them: [{id, name, open, why}]. */
export function variantOptions(state, genome) {
  return Object.entries(VARIANTS).map(([id, v]) => {
    let open;
    if (id === "twin") open = state.roster.some((g) => g !== genome && formOf(g).id !== "egg" && g.type !== genome.type);
    else open = [].concat(v.needs).some((t) => state.tags.includes(t));
    return { id, name: v.name, open, why: open ? v.blurb : v.how };
  });
}

/** A new egg for the roster. Its element leans toward how its owner studies. */
export function layEgg(state, rand = Math.random) {
  if (state.roster.length >= MAX_CREATURES) return null;
  const traits = { ...state.creature.traits };
  for (const t of state.tags) traits[t] = 1;
  const type = weightedPick([
    { id: "ember", weight_by: { curious: 2 } }, { id: "tide", weight_by: { listener: 2 } }, { id: "grove", weight_by: { collector: 2 } },
    { id: "stone", weight_by: { reader: 2 } }, { id: "spark", weight_by: { early_bird: 2 } }, { id: "dusk", weight_by: { night_owl: 2 } },
  ], rand, traits).id;
  const egg = newGenome((rand() * 2 ** 32) >>> 0, type);
  state.roster.push(egg);
  return egg;
}

/** Evolve a ready creature into an adult form (and optionally a special form). Returns an error
 * message, or "" when done. A grown creature leaves an egg behind for the roster. */
export function evolve(state, index, branch, variant = null, rand = Math.random) {
  const g = state.roster[index];
  if (!g || !readyToEvolve(g)) return "It isn't ready to evolve yet.";
  if (!branchOptions(g).some((b) => b.id === branch && b.open)) return "That form isn't open to it yet.";
  if (variant && !variantOptions(state, g).some((v) => v.id === variant && v.open)) return "That special form hasn't been earned yet.";
  g.branch = branch;
  g.branches = [branch];
  g.show = null;
  setVariant(state, g, variant);
  layEgg(state, rand);
  checkBadges(state);
  return "";
}

function setVariant(state, g, variant) {
  g.variant = variant || null;
  delete g.partnerHue;
  if (variant === "twin") {
    const partner = state.roster.find((o) => o !== g && formOf(o).id !== "egg" && o.type !== g.type);
    if (partner) g.partnerHue = bodyHue(partner);
  }
}

/** Change how a creature looks among what it has unlocked: another adult form, a special form,
 * or an earlier stage (pass {show: null} to let it look its age again). Nothing is lost by it. */
export function reshape(state, index, change) {
  const g = state.roster[index];
  if (!g) return;
  if ("show" in change) g.show = change.show && change.show !== "egg" ? change.show : null;
  if (!g.branch) return;
  if (change.branch && g.branches.includes(change.branch)) g.branch = change.branch;
  if ("variant" in change && (!change.variant || variantOptions(state, g).some((v) => v.id === change.variant && v.open))) setVariant(state, g, change.variant);
}

/** Choose which creature is out in the habitat (and so the one that grows as you study). */
export function setActive(state, index) {
  if (index >= 0 && index < state.roster.length) state.active = index;
}

// ---------- vocab review: what battles are made of ----------
// Every saved word with a meaning can be asked. A word moves up a box each time it is answered
// right and comes back after a longer wait; a wrong answer drops it two boxes. A word that climbs
// to MATURE_BOX is "well known": it took weeks of right answers to get there, which is why
// reaching it pays the best bonus.
const INTERVALS = [0, 1, 2, 4, 8, 16, 32]; // days until a word comes round again, by box
export const MATURE_BOX = 4;
const uidOf = (v) => String(v.uid || v.id);
const meaningOf = (v) => String(v.meaning || "").trim();

export const quizzable = (vocab) => (vocab || []).filter((v) => v && String(v.text || "").trim() && meaningOf(v));

/** Choose the creature friends see next to my name (pass null to follow the one in the habitat). */
export function setShowcase(state, seed) {
  state.showcase = state.roster.some((g) => g.seed === seed) ? seed : null;
}

/** The creature shown to friends: the chosen favourite, else the one in the habitat, else the
 * first that has hatched. Null while there are only eggs. */
export function showcaseOf(state) {
  const hatched = (g) => g && stageOf(g.growth).id !== "egg";
  return [state.roster.find((g) => g.seed === state.showcase), state.creature, ...state.roster].find(hatched) || null;
}

/** How well the owner has been answering lately (0..1), or null before there is enough to go on. */
export function retention(state) {
  if (state.week.total >= 10) return state.week.right / state.week.total;
  return state.stats.reviews >= 10 ? state.stats.right / state.stats.reviews : null;
}

/**
 * A question from the owner's own vocab: words that are due come first, so every player is
 * tested at their own level. Returns {uid, prompt, sentence, options, answer, reverse} or null
 * when there aren't enough different meanings to make four choices.
 * `reverse` questions show the meaning and ask for the word.
 */
export function pickQuestion(state, vocab, rand = Math.random, now = new Date(), avoid = []) {
  const pool = quizzable(vocab);
  const distinct = new Set(pool.map((v) => meaningOf(v).toLowerCase()));
  if (distinct.size < 4) return null;
  const today = dayNumber(now);
  const fresh = pool.filter((v) => !avoid.includes(uidOf(v)));
  const from = fresh.length ? fresh : pool;
  const due = from.filter((v) => { const r = state.review[uidOf(v)]; return !r || r[1] <= today; });
  const list = due.length ? due : from;
  const word = list[Math.floor(rand() * list.length)];
  const reverse = rand() < 0.35;
  const right = reverse ? String(word.text).trim() : meaningOf(word);
  const seen = new Set([right.toLowerCase(), meaningOf(word).toLowerCase()]);
  const others = [];
  const shuffled = pool.slice();
  for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
  for (const v of shuffled) {
    if (others.length === 3) break;
    const text = reverse ? String(v.text).trim() : meaningOf(v);
    if (seen.has(text.toLowerCase()) || seen.has(meaningOf(v).toLowerCase())) continue;
    seen.add(text.toLowerCase());
    seen.add(meaningOf(v).toLowerCase());
    others.push(text);
  }
  if (others.length < 3) return null;
  const answer = Math.floor(rand() * 4);
  const options = others.slice();
  options.splice(answer, 0, right);
  return { uid: uidOf(word), prompt: reverse ? meaningOf(word) : String(word.text).trim(), sentence: reverse ? "" : String(word.sentence || ""), options, answer, reverse };
}

/** Record an answer. Returns {xp, graduated, retentionBonus, stage}. */
export function answerQuestion(state, uid, correct, now = new Date()) {
  rollDay(state, now);
  const week = weekNumber(now);
  if (state.week.n !== week) state.week = { n: week, right: 0, total: 0, paid: false };
  const rec = state.review[uid] || [0, 0, 0, 0];
  const before = rec[0];
  rec[0] = correct ? Math.min(INTERVALS.length - 1, before + 1) : Math.max(0, before - 2);
  rec[1] = dayNumber(now) + INTERVALS[rec[0]];
  rec[correct ? 2 : 3]++;
  state.review[uid] = rec;
  state.stats.reviews++;
  state.week.total++;
  if (correct) { state.stats.right++; state.week.right++; }
  const out = { xp: 0, graduated: false, retentionBonus: false, stage: null };
  if (correct) out.xp = Math.round(3 * fade(state.day.reviews, 40, 120) * boost(state, now));
  state.day.reviews++;
  if (correct && before < MATURE_BOX && rec[0] >= MATURE_BOX) { // well known at last: the bonus that can't be rushed
    out.graduated = true;
    out.xp += 15;
    state.coins += 1;
  }
  if (!state.week.paid && state.week.total >= 30 && state.week.right / state.week.total >= 0.8) { // accuracy kept up all week
    state.week.paid = true;
    out.retentionBonus = true;
    out.xp += 60;
    state.coins += 5;
  }
  if (out.xp) out.stage = grow(state, out.xp, "collector");
  state.updated_at = now.getTime() / 1000;
  return out;
}

/** How many of the owner's words are well known, and how many are due today. */
export function reviewSummary(state, vocab, now = new Date()) {
  const today = dayNumber(now);
  let mature = 0;
  let due = 0;
  for (const v of quizzable(vocab)) {
    const r = state.review[uidOf(v)];
    if (r && r[0] >= MATURE_BOX) mature++;
    if (!r || r[1] <= today) due++;
  }
  return { mature, due };
}

// ---------- battles: what they pay ----------
export const weeklyRule = (now = new Date()) => WEEKLY_RULES[weekNumber(now) % WEEKLY_RULES.length];

/** A little extra strength from a creature's age, used ONLY against wild creatures and bosses.
 * Battles between people ignore it: there, everyone fights at the same level. */
export const wildBonus = (genome) => 1 + 0.15 * Math.min(1, genome.growth);

/**
 * Settle a finished battle. `result` = {mode: "wild" | "rental" | "friend", won, flawless,
 * comeback, rival: {id, name, rating}}. Returns {xp, coins, tags, egg, rating, badges}.
 */
export function finishBattle(state, result, ctx = {}) {
  const now = ctx.now || new Date();
  const rand = ctx.rand || Math.random;
  rollDay(state, now);
  let share = fade(state.day.battles, 3, 9); // the first few battles of the day are the ones that pay
  const ticket = share < 1 && state.items.ticket > 0; // a battle ticket makes one more pay in full
  if (ticket) { state.items.ticket--; share = 1; }
  state.day.battles++;
  state.stats.battles++;
  const out = { xp: Math.round((result.won ? 40 : 15) * share), coins: result.won && share ? Math.ceil(4 * share) : 0, tags: [], egg: false, rating: 0, badges: [], ticket };
  if (result.won) {
    state.stats.wins++;
    // Feats in battle, not hours of grinding, open the special forms and moves.
    if (result.flawless && grant(state, "flawless")) out.tags.push("flawless");
    if (result.comeback && grant(state, "comeback")) out.tags.push("comeback");
    if (result.mode === "wild" && state.roster.length < 6 && rand() < 0.15) out.egg = !!layEgg(state, rand);
  }
  if (result.mode !== "wild") {
    const theirs = (result.rival && result.rival.rating) || 1000;
    const expected = 1 / (1 + 10 ** ((theirs - state.rating) / 400));
    out.rating = Math.round(24 * ((result.won ? 1 : 0) - expected));
    state.rating += out.rating;
  }
  if (result.mode === "friend" && result.rival && result.rival.id) {
    state.stats.friend_battles++;
    const r = state.rivals[result.rival.id] || { name: result.rival.name || "", wins: 0, losses: 0 };
    r.name = result.rival.name || r.name;
    r[result.won ? "wins" : "losses"]++;
    state.rivals[result.rival.id] = r;
  }
  state.coins += out.coins;
  if (out.xp) grow(state, out.xp, null);
  out.badges = checkBadges(state);
  state.updated_at = now.getTime() / 1000;
  return out;
}

// ---------- friends: league, raid, gifts ----------
// The league is about keeping your own promise, not about volume: it counts the days this week
// you reached your own daily goal, so someone with a 5-minute goal can top someone with 20.

/** Start a new league week when the date calls for it, moving up or down on last week's result. */
export function rollLeague(state, now = new Date()) {
  const n = weekNumber(now);
  if (state.goalWeek.n === n) return;
  if (state.goalWeek.n) {
    if (state.goalWeek.days >= 5) state.league = Math.min(3, state.league + 1);
    else if (state.goalWeek.days <= 1) state.league = Math.max(0, state.league - 1);
    state.league = Math.max(0, state.league - Math.max(0, n - state.goalWeek.n - 1)); // whole weeks away
  }
  state.goalWeek = { n, days: 0 };
}

/** Share of this week's days so far on which the goal was reached, as a whole percentage. */
export function leaguePercent(days, now = new Date()) {
  const elapsed = ((dayNumber(now) + 3) % 7) + 1; // Monday is day 1
  return Math.min(100, Math.round((100 * Math.min(days, elapsed)) / elapsed));
}

export const weeklyBoss = (now = new Date()) => BOSSES[weekNumber(now) % BOSSES.length];

/** Right answers this week: what this player has dealt to the guild's raid boss. */
export const raidDamage = (state, now = new Date()) => (state.week.n === weekNumber(now) ? state.week.right : 0);

/** Take the reward for a defeated raid boss, once a week. Returns {xp, coins, badges} or null. */
export function claimRaid(state, now = new Date()) {
  const n = weekNumber(now);
  if (state.raid === n) return null;
  state.raid = n;
  state.stats.raids++;
  state.coins += 20;
  grow(state, 150, null);
  state.updated_at = now.getTime() / 1000;
  return { xp: 150, coins: 20, badges: checkBadges(state) };
}

/** A defence result came in: a friend challenged this player's team while they were away. */
export function recordDefence(state, rival, challengerWon) {
  if (!rival || !rival.id) return;
  const r = state.rivals[rival.id] || { name: rival.name || "", wins: 0, losses: 0 };
  r.name = rival.name || r.name;
  r[challengerWon ? "losses" : "wins"]++;
  state.rivals[rival.id] = r;
}

/** Take an owned item out of the game to give it away. Returns what to send, or null. */
export function giveItem(state, id) {
  if (!state.owned.includes(id)) return null;
  state.owned = state.owned.filter((x) => x !== id);
  state.decor = state.decor.filter((d) => d.id !== id);
  for (const g of state.roster) for (const [slot, worn] of Object.entries(g.equipped)) if (worn === id) delete g.equipped[slot];
  return { id };
}

/** Take an unhatched egg out of the roster to give it away. Returns what to send, or null. */
export function giveEgg(state, index) {
  const g = state.roster[index];
  if (!g || index === state.active || state.roster.length < 2 || stageOf(g.growth).id !== "egg") return null;
  state.roster.splice(index, 1);
  if (state.active > index) state.active--;
  return { seed: g.seed, type: g.type };
}

/** Add a gift to the game. Whatever arrives is checked: a gift can only ever be a known item or
 * a fresh egg. Returns a sentence saying what happened. */
export function receiveGift(state, kind, payload) {
  if (kind === "item") {
    const it = itemById(payload && payload.id);
    if (!it) return "The gift couldn't be opened.";
    if (state.owned.includes(it.id)) { state.coins += Math.ceil(it.price / 2); return `You already have ${it.name}, so it became ${Math.ceil(it.price / 2)} coins.`; }
    state.owned.push(it.id);
    return `You received ${it.name}. It's in My things.`;
  }
  if (kind === "egg" && payload && Number.isFinite(payload.seed) && TYPES[payload.type]) {
    if (state.roster.length >= MAX_CREATURES) { state.coins += 20; return "Your roster is full, so the egg became 20 coins."; }
    state.roster.push(newGenome(payload.seed >>> 0, payload.type));
    return `You received a ${TYPES[payload.type].name} egg. It's with your creatures.`;
  }
  return "The gift couldn't be opened.";
}

// ---------- badges ----------
/** Award any badges newly earned. `extra.words` is the number of saved vocab words, when known. */
export function checkBadges(state, extra = {}) {
  if (Number.isFinite(extra.words)) state.stats.words = Math.max(state.stats.words, extra.words);
  const s = state.stats;
  const anyTrait = (t) => state.roster.some((g) => (g.traits[t] || 0) >= 0.99);
  const anyForm = (b) => state.roster.some((g) => g.branches.includes(b));
  const earned = {
    first_word: s.lookups > 0, first_hatch: state.roster.some((g) => stageOf(g.growth).id !== "egg"), goal_10: s.goals >= 10,
    streak_7: state.best_streak >= 7, streak_30: state.best_streak >= 30, streak_100: state.best_streak >= 100,
    words_100: s.words >= 100, words_1000: s.words >= 1000,
    listener: anyTrait("listener"), reader: anyTrait("reader"), collector: anyTrait("collector"),
    adult_echo: anyForm("echo"), adult_sage: anyForm("sage"), adult_keeper: anyForm("keeper"),
    friend_battle: s.friend_battles > 0, raid_win: s.raids > 0,
  };
  const fresh = BADGES.map((b) => b.id).filter((id) => earned[id] && !state.badges.includes(id));
  state.badges.push(...fresh);
  return fresh;
}

// ---------- the shop ----------
export const SHOP_SIZE = 8;

/** Today's shop: a few items the owner doesn't have yet, different each day, leaning toward
 * what suits this creature. Items needing a tag only appear once the tag is earned. */
export function shopStock(state, now = new Date()) {
  const pool = CATALOG.filter((it) => !state.owned.includes(it.id) && (it.requires || []).every((t) => state.tags.includes(t)));
  const key = dayKey(now);
  let seed = state.roster[0].seed;
  for (const ch of key) seed = (Math.imul(seed, 31) + ch.charCodeAt(0)) >>> 0;
  const rand = rng(seed);
  const weights = { ...state.creature.traits };
  for (const t of state.tags) weights[t] = 1;
  const stock = [];
  while (pool.length && stock.length < SHOP_SIZE) {
    const pick = weightedPick(pool, rand, weights);
    stock.push(pick);
    pool.splice(pool.indexOf(pick), 1);
  }
  return stock;
}

/** Buy an item with coins. Returns an error message, or "" when bought. */
export function buy(state, id) {
  const it = itemById(id);
  if (!it) return "That item doesn't exist.";
  if (state.owned.includes(id)) return "You already have it.";
  if (state.coins < it.price) return `You need ${it.price - state.coins} more coin${it.price - state.coins === 1 ? "" : "s"}.`;
  state.coins -= it.price;
  state.owned.push(id);
  if (it.slot === "decor") placeDecor(state, id, true);
  else state.creature.equipped[it.slot] = id; // put it straight on
  return "";
}

/** Wear an owned item, or pass null to take off whatever is in that slot. */
export function equip(state, slot, id) {
  if (id && (!state.owned.includes(id) || (itemById(id) || {}).slot !== slot)) return;
  if (id) state.creature.equipped[slot] = id;
  else delete state.creature.equipped[slot];
}

/** Put an owned decoration out in the habitat (at a spot fixed by the first creature's seed) or away. */
export function placeDecor(state, id, out) {
  state.decor = state.decor.filter((d) => d.id !== id);
  if (!out || !state.owned.includes(id)) return;
  let seed = state.roster[0].seed;
  for (const ch of id) seed = (Math.imul(seed, 33) + ch.charCodeAt(0)) >>> 0;
  state.decor.push({ id, x: Math.round(16 + rng(seed)() * 288) });
}
