// The rules of the game, with no screen code: what studying earns and how a creature grows.
//
// The guiding rule (from the design notes): studying earns breadth and identity, not raw power,
// and healthy studying is rewarded rather than volume. So:
//   - the big payout is reaching your own daily goal, the same whether the goal is 5 or 20 minutes;
//   - everything else has steep diminishing returns within a day, so grinding isn't worth it;
//   - a word only pays once a day, so tapping the same word over and over earns nothing.

import { leadingBranch, newGenome, stageOf } from "./genome.js";

export const VERSION = 1;
export const GOALS = [5, 10, 20];           // minutes of study a day; the owner chooses
export const DAILY_COMPLETE_XP = 120;
export const COMBO_WINDOW_MS = 30000;       // long enough to read a definition before the next word
export const COMBO_STEPS = [1, 1.2, 1.5, 2];
export const ADULT_XP = 6000;               // creature XP for growth 1.0 (about two months of daily goals)

const TIERS = [
  { id: "common", chance: 0.7, xp: [5, 15] },
  { id: "lucky", chance: 0.2, xp: [30, 50] },
  { id: "jackpot", chance: 0.08, xp: [100, 200] },
  { id: "surprise", chance: 0.02, xp: [0, 0] }, // no XP: an item instead
];
const SURPRISES = ["freeze", "hint"];

export const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function newState(seed = (Math.random() * 2 ** 32) >>> 0) {
  return {
    v: VERSION, xp: 0, coins: 0, goal: 10,
    creature: newGenome(seed),
    items: { freeze: 1, hint: 0 },
    streak: 0, best_streak: 0, last_complete: "",
    day: { key: "", seconds: 0, done: false, taps: 0, saves: 0, xp: 0, words: [] },
    updated_at: 0,
  };
}

/** Make a saved state safe to use (older saves, hand-edited values). */
export function normalize(state) {
  const fresh = newState(1);
  const s = state && typeof state === "object" && state.creature && Number.isFinite(state.creature.seed) ? state : fresh;
  for (const [k, v] of Object.entries(fresh)) if (s[k] === undefined) s[k] = v;
  s.items = { ...fresh.items, ...(s.items || {}) };
  s.day = { ...fresh.day, ...(s.day || {}) };
  s.creature.traits = { ...fresh.creature.traits, ...(s.creature.traits || {}) };
  if (!GOALS.includes(s.goal)) s.goal = 10;
  return s;
}

/** Player level from total XP: each level costs a little more than the last. */
export function levelOf(xp) {
  let level = 1;
  let need = 100;
  let left = Math.max(0, xp);
  while (left >= need) { left -= need; level++; need = Math.round(need * 1.12 + 20); }
  return { level, into: left, need };
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
  state.day = { key, seconds: 0, done: false, taps: 0, saves: 0, xp: 0, words: [] };
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

function grow(state, xp, trait) {
  const c = state.creature;
  state.xp += xp;
  state.day.xp += xp;
  const before = stageOf(c.growth).id;
  c.growth = Math.min(1, c.growth + xp / ADULT_XP);
  if (trait) {
    // Traits drift toward what the owner actually does; the others fade a little.
    // (About ten daily goals of one habit to fill a trait, so one busy afternoon doesn't decide it.)
    const step = xp / 1500;
    for (const t of Object.keys(c.traits)) if (t !== trait) c.traits[t] = Math.max(0, c.traits[t] * (1 - step * 0.25));
    c.traits[trait] = Math.min(1, (c.traits[trait] || 0) + step);
  }
  const after = stageOf(c.growth).id;
  if (after === "adult" && !c.branch) c.branch = leadingBranch(c);
  return before === after ? null : after;
}

/**
 * Something happened while studying. Returns what it earned (or null for nothing):
 *   {xp, tier, item, combo, stage, levelUp, goalDone}
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
  const out = { type: event.type, xp: 0, tier: "common", item: null, combo: 1, stage: null, levelUp: false, goalDone: false };

  if (event.type === "word") {
    const key = String(event.key || "");
    if (!key || day.words.includes(key)) return null; // each word pays once a day
    day.words.push(key);
    const reward = rollReward(rand);
    const combo = ctx.combo || { count: 0, at: 0 };
    combo.count = now.getTime() - combo.at <= COMBO_WINDOW_MS ? combo.count + 1 : 0;
    combo.at = now.getTime();
    out.combo = COMBO_STEPS[Math.min(combo.count, COMBO_STEPS.length - 1)];
    out.tier = reward.tier;
    out.item = reward.item;
    out.xp = Math.round(reward.xp * out.combo * fade(day.taps, 40, 120));
    day.taps++;
    if (out.item) state.items[out.item] = (state.items[out.item] || 0) + 1;
    if (!out.xp && !out.item) return null;
    out.stage = grow(state, out.xp, "curious");
  } else if (event.type === "save") {
    out.xp = Math.round(20 * fade(day.saves, 15, 45));
    day.saves++;
    if (!out.xp) return null;
    state.coins += 1;
    out.stage = grow(state, out.xp, "collector");
  } else if (event.type === "study") {
    const seconds = Math.max(0, Math.min(60, Number(event.seconds) || 0));
    if (!seconds) return null;
    const before = day.seconds;
    day.seconds += seconds;
    const goal = state.goal * 60;
    // A trickle while studying, which dries up well past the goal.
    const rate = before < goal ? 0.25 : before < goal * 3 ? 0.08 : 0;
    out.xp = Math.round(seconds * rate);
    out.stage = grow(state, out.xp, event.mode === "read" ? "reader" : "listener");
    if (!day.done && day.seconds >= goal) {
      day.done = true;
      out.goalDone = true;
      out.tier = "jackpot";
      out.xp += DAILY_COMPLETE_XP;
      state.coins += 10;
      const key = dayKey(now);
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      state.streak = state.last_complete === dayKey(yesterday) ? state.streak + 1 : 1;
      state.best_streak = Math.max(state.best_streak, state.streak);
      state.last_complete = key;
      if (state.streak % 7 === 0) state.items.freeze = Math.min(3, state.items.freeze + 1); // a rest day earned
      out.stage = grow(state, DAILY_COMPLETE_XP, null) || out.stage;
    }
    if (!out.xp) return null;
  } else {
    return null;
  }
  out.levelUp = levelOf(state.xp).level > levelBefore;
  state.updated_at = now.getTime() / 1000;
  return out;
}
