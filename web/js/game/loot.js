// Every right answer is a roll: the shared reward engine of the flashcards and the mini-games (fishing
// first). No screen code here; the reveal is web/js/game/reveal.js.
//
// The owner's design (2026-11-10):
//   - every right answer rolls once on a 10-tier table (TIERS); its colour and reveal show the tier;
//   - luck multiplies the odds: a due word x2, an extra (not due) word pays little, answer streaks
//     (10 in a row x2, 25 x3, 50 x5; a wrong answer resets it, a Streak shield keeps it), and now and
//     then a "Golden hour" (x3 luck for 10 minutes);
//   - "boss" words: a word missed on 4 different days turns golden, and getting it right pays at least
//     a Legendary;
//   - pity: an Epic or better at least every 50 rolls, a Legendary or better every 300;
//   - rolls come only from studying, never from money; nothing here adds strength in battles between
//     people; and answers given too fast don't roll, so random tapping is never worth it.
//
// Everything is kept in `state.loot` (lootState), so a fish caught and a card answered share one streak
// and one pity counter. Rewards per tier are a table (REWARDS); a mini-game may roll without paying
// (`pay: false`) and map the tier to its own catch.
//
// (This file imports rules.js and idle.js, and rules.js imports cleanLoot from here. That loop is safe
// because neither file uses the other at load time, only inside functions; keep it that way.)

import { FOODS, ITEMS } from "./data.js";
import { garden, totalRate } from "./idle.js";
import { MAX_CREATURES, dayKey, dayNumber, hearKey, layEgg } from "./rules.js";

// ---------- the tiers ----------
// `odds` is "1 in N" for that exact tier at luck 1 (Common is what is left: about 63%).
export const TIERS = [
  { id: "common", name: "Common", odds: 1, colour: "#aab4c3" },
  { id: "uncommon", name: "Uncommon", odds: 4, colour: "#4fd17a" },
  { id: "rare", name: "Rare", odds: 12, colour: "#3d8bff" },
  { id: "epic", name: "Epic", odds: 40, colour: "#a55bff" },
  { id: "legendary", name: "Legendary", odds: 150, colour: "#ffb11f" },
  { id: "mythic", name: "Mythic", odds: 600, colour: "#ff3d6e" },
  { id: "ancient", name: "Ancient", odds: 2500, colour: "#2ed3b7" },
  { id: "celestial", name: "Celestial", odds: 10000, colour: "#9fe8ff" },
  { id: "cosmic", name: "Cosmic", odds: 50000, colour: "#d14bff" },
  { id: "eternal", name: "Eternal", odds: 250000, colour: "#ffffff" },
];
export const RARE = 2;
export const EPIC = 3;
export const LEGENDARY = 4;
export const MYTHIC = 5;
/** A tier by its number (0 = Common .. 9 = Eternal) or its id; Common for anything else. */
export const tierOf = (x) => (typeof x === "string" ? TIERS.find((t) => t.id === x) : TIERS[x]) || TIERS[0];
const tierNumber = (x) => Math.max(0, TIERS.indexOf(tierOf(x)));

// ---------- the rules' numbers (the owner may tune any of them) ----------
export const DUE_LUCK = 2;              // a word that was due today
export const EXTRA_LUCK = 0.25;         // a word that wasn't due, or one that has already rolled today
export const STREAK_STEPS = [[10, 2], [25, 3], [50, 5]]; // [right answers in a row, luck]
export const GOLDEN_LUCK = 3;
export const GOLDEN_MS = 10 * 60 * 1000;
export const GOLDEN_CHANCE = 1 / 150;   // each full roll may start a Golden hour (at most one a day)
export const PITY = [{ tier: LEGENDARY, every: 300, key: "legendary" }, { tier: EPIC, every: 50, key: "epic" }];
export const BOSS_MISSES = 4;           // missed on this many different days: a boss word
export const BOSS_TIER = LEGENDARY;     // what a boss word pays at least
export const BOSS_DAY = 5;              // boss words beaten in a day that pay their floor (after that, a full roll)
export const EXTRA_DAY = 150;           // extra rolls a day; after that an extra answer rolls nothing
export const FAST_MS = 1200;            // a right answer quicker than this doesn't roll
export const FAST_MS_BY = { cards: 1500 }; // its own floor for a source (a card is read, turned and checked); a mini-game may set its own
export const BONUS_MAX = 3;             // the most a caller's own luck factor may multiply by
const MISS_KEPT = 400;                  // words whose misses are remembered (bosses are kept first)
const ROLLED_KEPT = 1500;               // words remembered as rolled today
const LOG_KEPT = 12;                    // Epic-or-better finds kept for the luck sheet

// ---------- the saved part ----------
const freshDay = (key = "") => ({ key, rolled: [], extra: 0, bosses: 0 });

/** state.loot made safe (older saves have none, a friend's or hand-edited one may be anything). */
export function cleanLoot(v) {
  const s = v && typeof v === "object" && !Array.isArray(v) ? v : {};
  const n = (x, max = Number.MAX_SAFE_INTEGER) => Math.max(0, Math.min(max, Math.floor(Number(x)) || 0));
  const found = Array.isArray(s.found) ? s.found : [];
  const day = s.day && typeof s.day === "object" ? s.day : {};
  const miss = {};
  if (s.miss && typeof s.miss === "object" && !Array.isArray(s.miss)) {
    for (const [k, m] of Object.entries(s.miss)) {
      if (typeof k !== "string" || k.length > 24 || !Array.isArray(m)) continue;
      miss[k] = [n(m[0], 999), n(m[1])];
    }
  }
  return {
    streak: n(s.streak), best: n(s.best),
    rolls: n(s.rolls),
    since: { epic: n(s.since && s.since.epic), legendary: n(s.since && s.since.legendary) },
    found: TIERS.map((_, i) => n(found[i])),
    golden: n(s.golden),                        // when the Golden hour ends (ms since 1970), 0 = none
    goldenDay: typeof s.goldenDay === "string" ? s.goldenDay.slice(0, 10) : "",
    miss,                                       // word key -> [days missed, the last day missed (dayNumber)]
    day: { key: typeof day.key === "string" ? day.key.slice(0, 10) : "",
           rolled: Array.isArray(day.rolled) ? day.rolled.filter((k) => typeof k === "string" && k.length <= 24).slice(-ROLLED_KEPT) : [],
           extra: n(day.extra), bosses: n(day.bosses) },
    log: (Array.isArray(s.log) ? s.log : []).filter((e) => e && typeof e === "object")
      .map((e) => ({ tier: n(e.tier, TIERS.length - 1), t: n(e.t), what: String(e.what || "").slice(0, 60) })).slice(-LOG_KEPT),
  };
}

/** The loot part of the saved game, made the first time it is needed (the day's counts left as they are). */
function part(state) {
  if (!state.loot || typeof state.loot !== "object" || !state.loot.day || !Array.isArray(state.loot.found)) state.loot = cleanLoot(state.loot);
  return state.loot;
}

/** The same, with the day's counts started again when the date has changed. The answer streak is a day's
 * climb too (10, 25, 50 in a row): it starts again each day, so the top luck is earned, not kept. */
export function lootState(state, now = new Date()) {
  const L = part(state);
  const key = dayKey(now);
  if (L.day.key !== key) { L.day = freshDay(key); L.streak = 0; }
  return L;
}

/** A short steady key for a word (its uid), so the saved game stays small. */
const wordKey = (uid) => (uid == null || uid === "" ? "" : hearKey(String(uid)));

// ---------- luck ----------
/** Luck from the answer streak: STREAK_STEPS's step for `n` right answers in a row. */
export function streakLuck(n) {
  let x = 1;
  for (const [at, luck] of STREAK_STEPS) if (n >= at) x = luck;
  return x;
}

/** How long the Golden hour still runs, in ms (0 when there is none). */
export function golden(state, now = new Date()) {
  return Math.max(0, part(state).golden - now.getTime());
}

/** Is this word a boss (missed on BOSS_MISSES different days since it was last beaten)? */
export function isBoss(state, uid) {
  const m = part(state).miss[wordKey(uid)];
  return !!m && m[0] >= BOSS_MISSES;
}

/**
 * The luck of an answer, and what it is made of (for the screen: "Due x2", "Streak x3"...).
 * ctx: {due, extra, luck (the caller's own factor, e.g. 1.1), streak (right answers in a row, counting this one)}
 * Returns {luck, parts: [{id: "due"|"extra"|"streak"|"golden"|"bonus", x}]}.
 */
export function luckFor(state, ctx = {}, now = new Date()) {
  const parts = [];
  if (ctx.extra) parts.push({ id: "extra", x: EXTRA_LUCK });
  else if (ctx.due) parts.push({ id: "due", x: DUE_LUCK });
  const streak = ctx.streak ?? part(state).streak;
  const s = streakLuck(streak);
  if (s > 1) parts.push({ id: "streak", x: s });
  if (golden(state, now) > 0) parts.push({ id: "golden", x: GOLDEN_LUCK });
  const bonus = Math.max(0, Math.min(BONUS_MAX, Number(ctx.luck) || 1));
  if (bonus !== 1) parts.push({ id: "bonus", x: bonus });
  return { luck: parts.reduce((x, p) => x * p.x, 1), parts };
}

/**
 * The chance of each tier at this luck, Common first. Every tier's chance is multiplied by the luck, the
 * rarest first; when they no longer fit, the commonest give way (with enough luck Common disappears).
 */
export function chances(luck = 1) {
  const p = new Array(TIERS.length).fill(0);
  let left = 1;
  for (let i = TIERS.length - 1; i >= 1; i--) { p[i] = Math.min(left, Math.max(0, luck) / TIERS[i].odds); left -= p[i]; }
  p[0] = Math.max(0, left);
  return p;
}

/** One draw at this luck, never under tier `floor`: u in [0, 1). */
function pick(luck, floor, u) {
  const p = chances(luck);
  let total = 0;
  for (let i = floor; i < p.length; i++) total += p[i];
  if (total <= 0) return floor;
  let x = u * total;
  for (let i = p.length - 1; i > floor; i--) { if (x < p[i]) return i; x -= p[i]; }
  return floor;
}

/**
 * Roll a tier. `opts.floor` is the least it may be (a boss word's); `opts.pity` false for a roll that
 * neither counts toward pity nor is helped by it (an extra answer). Counts what was found in state.loot.
 * Returns {tier, id, name, colour, luck, pity: null | "epic" | "legendary", floored: bool}.
 */
export function roll(state, luck = 1, rand = Math.random, opts = {}) {
  const L = part(state);
  const counts = opts.pity !== false;
  const floor = Math.max(0, Math.min(TIERS.length - 1, Math.floor(opts.floor || 0)));
  let tier = pick(luck, 0, rand());
  let pity = null;
  let floored = false;
  if (tier < floor) { tier = pick(luck, floor, rand()); floored = true; }
  if (counts) {
    // Pity: the 50th roll without an Epic (the 300th without a Legendary) is at least one.
    for (const p of PITY) {
      if (tier < p.tier && L.since[p.key] + 1 >= p.every) { tier = pick(luck, p.tier, rand()); pity = p.key; break; }
    }
    L.since.epic = tier >= EPIC ? 0 : L.since.epic + 1;
    L.since.legendary = tier >= LEGENDARY ? 0 : L.since.legendary + 1;
  }
  L.rolls++;
  L.found[tier]++;
  const t = TIERS[tier];
  return { tier, id: t.id, name: t.name, colour: t.colour, luck, pity, floored };
}

// ---------- rewards ----------
// What each tier pays in the flashcards (a mini-game may pay its own instead). Each tier lists choices
// with a weight; each choice is one or more grants:
//   {kind: "glow", minutes, min}             glow: that many minutes of the garden's output (as clearing the
//                                            day's cards pays an hour of it), never less than `min`; so a
//                                            bigger garden makes every roll worth more
//   {kind: "gems", n}                        gems
//   {kind: "food", n}                        food, often the creature's favourite
//   {kind: "supply", id, n}                  a supply (data.SUPPLIES), or "shield": a Streak shield
//   {kind: "egg"}                            a Mystery egg (gems instead when the roster is full)
//   {kind: "wearable", min}                  a thing to wear the owner hasn't got, priced at least `min`
//                                            coins in the shop (gems instead when there is none left)
// No coins: flashcards and battles are paid apart (the owner's rule: battles pay coins, cards pay glow),
// and coins buy battle moves, while nothing here may add strength in battles between people.
export const REWARDS = [
  [{ w: 1, grants: [{ kind: "glow", minutes: 1, min: 1 }] }],
  [{ w: 1, grants: [{ kind: "glow", minutes: 3, min: 3 }] }],
  [{ w: 3, grants: [{ kind: "glow", minutes: 10, min: 10 }] }, { w: 1, grants: [{ kind: "supply", id: "shield", n: 1 }] }],
  [{ w: 2, grants: [{ kind: "glow", minutes: 30, min: 30 }] }, { w: 2, grants: [{ kind: "food", n: 1 }] }],
  [{ w: 3, grants: [{ kind: "glow", minutes: 180, min: 150 }] }, { w: 2, grants: [{ kind: "food", n: 3 }] },
   { w: 2, grants: [{ kind: "supply", id: "shield", n: 2 }] }, { w: 1, grants: [{ kind: "gems", n: 1 }] }],
  [{ w: 2, grants: [{ kind: "gems", n: 2 }] }, { w: 1, grants: [{ kind: "supply", id: "xp_boost", n: 1 }, { kind: "gems", n: 1 }] },
   { w: 1, grants: [{ kind: "glow", minutes: 720, min: 600 }] }],
  [{ w: 1, grants: [{ kind: "egg" }] }, { w: 1, grants: [{ kind: "gems", n: 5 }] }],
  [{ w: 1, grants: [{ kind: "wearable", min: 0 }, { kind: "gems", n: 5 }] }],
  [{ w: 1, grants: [{ kind: "wearable", min: 30 }, { kind: "gems", n: 15 }] }],
  [{ w: 1, grants: [{ kind: "wearable", min: 45 }, { kind: "gems", n: 50 }] }],
];
const WEARABLE_GEMS = 10; // a wearable when the owner already has every one

/** The things to wear a reward may give: any in the shop's catalogue (never a colouring's prize) not owned yet. */
function unownedWearables(state, min) {
  const owned = new Set(state.owned || []);
  const all = ITEMS.filter((it) => !it.prize && !owned.has(it.id));
  const dear = all.filter((it) => (it.price || 0) >= min);
  return dear.length ? dear : all;
}

/** Work out a tier's reward, concretely (which food, which wearable). Returns {tier, grants: [...]}. */
export function rewardFor(state, tier, rand = Math.random) {
  const n = tierNumber(tier);
  const choices = REWARDS[n] || REWARDS[0];
  let x = rand() * choices.reduce((s, c) => s + c.w, 0);
  let choice = choices[choices.length - 1];
  for (const c of choices) { if (x < c.w) { choice = c; break; } x -= c.w; }
  const grants = choice.grants.map((g) => {
    if (g.kind === "glow") {
      const made = g.minutes ? Math.round((totalRate(state) * g.minutes) / 60) : 0;
      return { kind: "glow", n: Math.max(g.min || 0, g.n || 0, made) };
    }
    if (g.kind === "food") {
      const loved = state.creature && FOODS.find((f) => f.loves === state.creature.type);
      const food = loved && rand() < 0.5 ? loved : FOODS[Math.floor(rand() * FOODS.length)];
      return { kind: "food", id: food.id, n: g.n || 1 };
    }
    if (g.kind === "wearable") {
      const list = unownedWearables(state, g.min || 0);
      if (!list.length) return { kind: "gems", n: WEARABLE_GEMS, instead: "wearable" };
      return { kind: "wearable", id: list[Math.floor(rand() * list.length)].id, n: 1 };
    }
    return { ...g, n: g.n || 1 };
  });
  return { tier: n, grants };
}

/** Pay a reward into the game. Returns it, with each grant as really given (an egg with a full roster
 * becomes gems, a wearable already owned becomes gems). */
export function payReward(state, reward, rand = Math.random) {
  if (!reward || !Array.isArray(reward.grants)) return reward;
  if (!state.items || typeof state.items !== "object") state.items = {};
  const add = (id, n) => { state.items[id] = (Number(state.items[id]) || 0) + n; };
  reward.grants = reward.grants.map((g) => {
    const n = Math.max(0, Math.floor(Number(g.n) || 0));
    switch (g.kind) {
      case "glow": garden(state).glow += n; return g;
      case "coins": state.coins = (Number(state.coins) || 0) + n; return g;
      case "gems": state.gems = (Number(state.gems) || 0) + n; return g;
      case "food": case "supply": add(g.id, n); return g;
      case "egg":
        if (state.roster.length >= MAX_CREATURES) { state.gems = (Number(state.gems) || 0) + 6; return { kind: "gems", n: 6, instead: "egg" }; }
        layEgg(state, rand);
        return g;
      case "wearable":
        if (!Array.isArray(state.owned)) state.owned = [];
        if (state.owned.includes(g.id)) { state.gems = (Number(state.gems) || 0) + WEARABLE_GEMS; return { kind: "gems", n: WEARABLE_GEMS, instead: "wearable" }; }
        state.owned.push(g.id);
        return g;
      default: return g;
    }
  });
  return reward;
}

// ---------- an answer ----------
/** Count a miss toward the word becoming a boss: once a day per word. */
function missed(L, key, today) {
  if (!key) return;
  const m = L.miss[key] || [0, 0];
  if (m[1] !== today) { m[0] = Math.min(999, m[0] + 1); m[1] = today; }
  L.miss[key] = m;
  const keys = Object.keys(L.miss);
  if (keys.length > MISS_KEPT) {
    // Forget the words missed longest ago, ordinary ones before bosses.
    keys.sort((a, b) => (L.miss[a][0] >= BOSS_MISSES) - (L.miss[b][0] >= BOSS_MISSES) || L.miss[a][1] - L.miss[b][1]);
    for (const k of keys.slice(0, keys.length - MISS_KEPT)) delete L.miss[k];
  }
}

/**
 * An answer was given. Right answers roll; wrong ones reset the answer streak (a Streak shield keeps
 * a streak of 10 or more) and count toward the word becoming a boss.
 *   ctx = {source: "cards" | "fish" | ..., correct, ms (time taken), uid (the word), due, extra,
 *          luck (the caller's own factor, e.g. 1.1), pay (default true: pay REWARDS; false: roll only)}
 * Returns {rolled: true, tier, id, name, colour, luck, parts, pity, boss, golden, streak, extra, reward}
 *      or {rolled: false, why: "wrong" | "fast" | "spent", streak, shielded, lost (the run a wrong answer ended)}.
 * `golden` is true when this roll started a Golden hour (from the next answer on). A word rolls in full
 * once a day, whatever the source: the same word again that day rolls as an extra.
 */
export function rollAnswer(state, ctx = {}, rand = Math.random, now = new Date()) {
  const L = lootState(state, now);
  const key = wordKey(ctx.uid);
  if (!ctx.correct) {
    missed(L, key, dayNumber(now));
    let shielded = false;
    let lost = 0;
    if (L.streak >= STREAK_STEPS[0][0] && Number(state.items && state.items.shield) > 0) {
      state.items.shield--;
      shielded = true;
    } else { lost = L.streak; L.streak = 0; }
    return { rolled: false, why: "wrong", streak: L.streak, shielded, lost };
  }
  const floorMs = FAST_MS_BY[ctx.source] ?? FAST_MS;
  if (Number.isFinite(ctx.ms) && ctx.ms < floorMs) return { rolled: false, why: "fast", streak: L.streak, shielded: false };

  const repeat = key && L.day.rolled.includes(key);
  const extra = Boolean(ctx.extra) || repeat;
  if (extra && L.day.extra >= EXTRA_DAY) {
    L.streak++;
    L.best = Math.max(L.best, L.streak);
    return { rolled: false, why: "spent", streak: L.streak, shielded: false };
  }
  L.streak++;
  L.best = Math.max(L.best, L.streak);
  const { luck, parts } = luckFor(state, { due: ctx.due && !extra, extra, luck: ctx.luck, streak: L.streak }, now);
  const boss = !extra && isBoss(state, ctx.uid);
  const bossPays = boss && L.day.bosses < BOSS_DAY;
  const r = roll(state, luck, rand, { floor: bossPays ? BOSS_TIER : 0, pity: !extra });
  if (extra) L.day.extra++;
  else if (key) { L.day.rolled.push(key); if (L.day.rolled.length > ROLLED_KEPT) L.day.rolled.splice(0, L.day.rolled.length - ROLLED_KEPT); }
  if (bossPays) { delete L.miss[key]; L.day.bosses++; } // beaten (past the day's limit it stays a boss for tomorrow)
  // Now and then a full roll starts a Golden hour (one a day; never while one is running).
  let started = false;
  if (!extra && L.goldenDay !== L.day.key && L.golden <= now.getTime() && rand() < GOLDEN_CHANCE) {
    L.golden = now.getTime() + GOLDEN_MS;
    L.goldenDay = L.day.key;
    started = true;
  }
  let reward = null;
  if (ctx.pay !== false) reward = payReward(state, rewardFor(state, r.tier, rand), rand);
  if (r.tier >= EPIC) {
    L.log.push({ tier: r.tier, t: now.getTime(), what: reward ? reward.grants.map((g) => `${g.kind}${g.id ? `:${g.id}` : ""}${g.n > 1 ? `x${g.n}` : ""}`).join(" ").slice(0, 60) : String(ctx.source || "") });
    if (L.log.length > LOG_KEPT) L.log.splice(0, L.log.length - LOG_KEPT);
  }
  return { rolled: true, ...r, parts, boss: bossPays, golden: started, streak: L.streak, extra, reward };
}

/** What an answer may change that Undo must put back: the streak, the shields, the word's misses.
 * Take it before rollAnswer; give it to `restore` when the answer is taken back. (What a roll paid stays
 * paid, and the word stays rolled for today, so answering it again rolls as an extra.) */
export function snapshot(state, uid, now = new Date()) {
  const L = lootState(state, now);
  const key = wordKey(uid);
  return { streak: L.streak, shield: Number(state.items && state.items.shield) || 0, key, miss: L.miss[key] ? [...L.miss[key]] : null };
}

/** Put back what `snapshot` took. A boss word beaten in between stays beaten (it was paid for). */
export function restore(state, snap) {
  if (!snap) return;
  const L = part(state);
  L.streak = snap.streak;
  if (state.items) state.items.shield = Math.max(Number(state.items.shield) || 0, snap.shield);
  if (!snap.key) return;
  if (snap.miss && L.miss[snap.key]) L.miss[snap.key] = [...snap.miss];
  else if (!snap.miss) delete L.miss[snap.key];
}

/** The words that are bosses now, as their keys (wordKey), for a screen that wants to count them. */
export const bossCount = (state) => Object.values(part(state).miss).filter((m) => m[0] >= BOSS_MISSES).length;

/** Where the pity counters stand: rolls left until an Epic (and a Legendary) is sure. */
export function pityLeft(state) {
  const L = part(state);
  return { epic: Math.max(1, PITY[1].every - L.since.epic), legendary: Math.max(1, PITY[0].every - L.since.legendary) };
}
