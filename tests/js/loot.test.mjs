// Run with: node --test tests/js/
// Every right answer is a roll (web/js/game/loot.js): the tiers' odds, luck, pity, the answer streak and its
// shield, boss words, the Golden hour, what each tier pays, and old saves.
// (loot.js is imported first on purpose: it and rules.js import each other, and both orders must load.)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BOSS_DAY, BOSS_MISSES, BOSS_TIER, DUE_LUCK, EPIC, EXTRA_DAY, EXTRA_LUCK, FAST_MS, FAST_MS_BY, GOLDEN_LUCK, GOLDEN_MS, LEGENDARY,
  REWARDS, STREAK_STEPS, TIERS, bossCount, chances, cleanLoot, golden, isBoss, lootState, luckFor, payReward, pityLeft, restore,
  rewardFor, roll, rollAnswer, snapshot, streakLuck, tierOf,
} from "../../web/js/game/loot.js";
import { MAX_CREATURES, layEgg, newState, normalize } from "../../web/js/game/rules.js";
import { build, garden, totalRate } from "../../web/js/game/idle.js";
import { FOODS, ITEMS } from "../../web/js/game/data.js";
import { CHIP, climb, cornerSlot, grantView, holdFor, luckText, rewardView } from "../../web/js/game/lootview.js";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const NOW = new Date("2026-11-10T10:00:00");
const day = (n) => new Date(NOW.getTime() + n * 86400000);
/** A seeded random number generator (mulberry32), so the long runs are the same every time. */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const always = (x) => () => x;
/** A right answer, slow enough to count. */
const right = (extra = {}) => ({ source: "cards", correct: true, ms: 4000, ...extra });

test("ten tiers, Common to Eternal, with the owner's odds", () => {
  assert.deepEqual(TIERS.map((t) => t.id), ["common", "uncommon", "rare", "epic", "legendary", "mythic", "ancient", "celestial", "cosmic", "eternal"]);
  assert.deepEqual(TIERS.map((t) => t.odds), [1, 4, 12, 40, 150, 600, 2500, 10000, 50000, 250000]);
  for (const t of TIERS) assert.match(t.colour, /^#[0-9a-f]{6}$/);
  assert.equal(new Set(TIERS.map((t) => t.colour)).size, TIERS.length, "every tier has its own colour");
  assert.equal(tierOf(EPIC).id, "epic");
  assert.equal(tierOf("legendary"), TIERS[LEGENDARY]);
  assert.equal(tierOf(99).id, "common");
});

test("each tier's chance is 1 in its odds, luck multiplies them, and they always add up to one", () => {
  const p = chances(1);
  for (let i = 1; i < TIERS.length; i++) assert.ok(Math.abs(p[i] - 1 / TIERS[i].odds) < 1e-12, TIERS[i].id);
  assert.ok(Math.abs(p[0] - 0.6328) < 0.001, "Common is the rest (about 63%)");
  const two = chances(2);
  for (let i = 1; i < TIERS.length; i++) assert.ok(Math.abs(two[i] - 2 / TIERS[i].odds) < 1e-12);
  for (const luck of [0.25, 1, 2, 3, 10, 30, 1000]) {
    const sum = chances(luck).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 1) < 1e-9, `luck ${luck}`);
  }
  assert.equal(chances(30)[0], 0, "with enough luck Common disappears");
  assert.ok(chances(30)[LEGENDARY] > chances(1)[LEGENDARY] * 29);
});

test("rolled many times, the tiers come up at their odds", () => {
  const s = newState(1);
  const rand = seeded(7);
  const n = 200000;
  const seen = new Array(TIERS.length).fill(0);
  for (let i = 0; i < n; i++) seen[roll(s, 1, rand, { pity: false }).tier]++;
  for (const i of [1, 2, 3, 4]) {
    const want = n / TIERS[i].odds;
    assert.ok(Math.abs(seen[i] - want) < 5 * Math.sqrt(want), `${TIERS[i].id}: ${seen[i]} for about ${Math.round(want)}`);
  }
  assert.deepEqual(lootState(s).found, seen, "what was found is counted");
});

test("pity: an Epic or better at the 50th roll without one, a Legendary or better at the 300th", () => {
  const s = newState(2);
  const unlucky = always(0.999999); // every free roll is a Common
  const tiers = [];
  for (let i = 0; i < 600; i++) tiers.push(roll(s, 1, unlucky).tier);
  const epics = tiers.map((t, i) => (t >= EPIC ? i + 1 : 0)).filter(Boolean);
  assert.deepEqual(epics, [50, 100, 150, 200, 250, 300, 350, 400, 450, 500, 550, 600]);
  assert.equal(tiers[299], LEGENDARY, "the 300th is a Legendary");
  assert.equal(tiers[599], LEGENDARY);
  assert.equal(tiers[249], EPIC);
  assert.deepEqual(pityLeft(s), { epic: 50, legendary: 300 });
  roll(s, 1, unlucky);
  assert.deepEqual(pityLeft(s), { epic: 49, legendary: 299 });
});

test("a lucky Epic resets the Epic pity; extra rolls neither count toward pity nor get it", () => {
  const s = newState(3);
  const unlucky = always(0.999999);
  for (let i = 0; i < 30; i++) roll(s, 1, unlucky);
  roll(s, 1, always(0.01)); // 0.01 lands in the Epic band (the rarer tiers come first)
  assert.equal(lootState(s).since.epic, 0);
  for (let i = 0; i < 49; i++) roll(s, 1, unlucky);
  for (let i = 0; i < 100; i++) assert.equal(roll(s, EXTRA_LUCK, unlucky, { pity: false }).tier, 0);
  assert.equal(lootState(s).since.epic, 49, "extras left the count alone");
  const r = roll(s, 1, unlucky);
  assert.equal(r.tier, EPIC);
  assert.equal(r.pity, "epic");
});

test("luck: due x2, extra x0.25, streak steps x2 x3 x5, Golden hour x3, and the caller's own factor", () => {
  const s = newState(4);
  assert.equal(luckFor(s, { due: true }, NOW).luck, DUE_LUCK);
  assert.equal(luckFor(s, { extra: true, due: true }, NOW).luck, EXTRA_LUCK, "an extra word is never due");
  assert.equal(luckFor(s, {}, NOW).luck, 1);
  assert.deepEqual(STREAK_STEPS.map(([n]) => streakLuck(n)), [2, 3, 5]);
  assert.equal(streakLuck(9), 1);
  assert.equal(streakLuck(24), 2);
  assert.equal(streakLuck(49), 3);
  assert.equal(streakLuck(400), 5);
  const parts = luckFor(s, { due: true, streak: 30, luck: 1.1 }, NOW);
  assert.ok(Math.abs(parts.luck - 2 * 3 * 1.1) < 1e-9);
  assert.deepEqual(parts.parts.map((p) => p.id), ["due", "streak", "bonus"]);
  lootState(s, NOW).golden = NOW.getTime() + 60000;
  assert.equal(luckFor(s, { due: true }, NOW).luck, DUE_LUCK * GOLDEN_LUCK);
  assert.equal(luckFor(s, { luck: 99 }, NOW).luck, 3 * GOLDEN_LUCK, "a caller's factor is capped");
});

test("the answer streak: right answers build it, a wrong one resets it, a Streak shield keeps one of 10 or more", () => {
  const s = newState(5);
  const unlucky = always(0.999999);
  for (let i = 0; i < 9; i++) rollAnswer(s, right({ uid: `w${i}` }), unlucky, NOW);
  s.items.shield = 2;
  let r = rollAnswer(s, { correct: false, uid: "w0" }, unlucky, NOW);
  assert.equal(r.streak, 0, "under 10, a shield isn't spent");
  assert.equal(s.items.shield, 2);
  for (let i = 0; i < 12; i++) r = rollAnswer(s, right({ uid: `x${i}` }), unlucky, NOW);
  assert.equal(r.streak, 12);
  assert.ok(r.parts.some((p) => p.id === "streak" && p.x === 2));
  r = rollAnswer(s, { correct: false, uid: "x1" }, unlucky, NOW);
  assert.deepEqual([r.rolled, r.why, r.streak, r.shielded, s.items.shield], [false, "wrong", 12, true, 1]);
  rollAnswer(s, { correct: false, uid: "x2" }, unlucky, NOW);
  r = rollAnswer(s, { correct: false, uid: "x3" }, unlucky, NOW);
  assert.equal(r.streak, 0, "no shield left");
  assert.equal(r.lost, 12, "it says how long the run was");
  assert.equal(s.items.shield, 0);
  assert.equal(lootState(s).best, 12);
});

test("the streak is a day's climb: it starts again the next day", () => {
  const s = newState(51);
  for (let i = 0; i < 30; i++) rollAnswer(s, right({ uid: `w${i}` }), always(0.999999), NOW);
  assert.equal(lootState(s, NOW).streak, 30);
  assert.equal(luckFor(s, { due: true, streak: lootState(s, NOW).streak + 1 }, NOW).luck, DUE_LUCK * 3);
  const r = rollAnswer(s, right({ uid: "tomorrow" }), always(0.999999), day(1));
  assert.equal(r.streak, 1);
  assert.equal(lootState(s, day(1)).best, 30, "the best run is kept");
});

test("Undo: the streak, a shield spent and a miss counted are put back; what a roll paid stays", () => {
  const s = newState(52);
  const unlucky = always(0.999999);
  for (let i = 0; i < 11; i++) rollAnswer(s, right({ uid: `w${i}` }), unlucky, NOW);
  s.items.shield = 1;
  // A wrong answer by mistake, with a shield: taken back, the shield and the clean record return.
  let snap = snapshot(s, "slip", NOW);
  rollAnswer(s, { correct: false, uid: "slip" }, unlucky, NOW);
  assert.equal(s.items.shield, 0);
  restore(s, snap);
  assert.deepEqual([lootState(s, NOW).streak, s.items.shield, Object.keys(s.loot.miss).length], [11, 1, 0]);
  // Without a shield: the run comes back.
  s.items.shield = 0;
  snap = snapshot(s, "slip", NOW);
  assert.equal(rollAnswer(s, { correct: false, uid: "slip" }, unlucky, NOW).streak, 0);
  restore(s, snap);
  assert.equal(lootState(s, NOW).streak, 11);
  // A right answer taken back: the streak steps back, the glow stays, and answering again is an extra.
  const glow = garden(s).glow;
  snap = snapshot(s, "again", NOW);
  const first = rollAnswer(s, right({ uid: "again", due: true }), unlucky, NOW);
  assert.equal(first.streak, 12);
  restore(s, snap);
  assert.equal(lootState(s, NOW).streak, 11);
  assert.ok(garden(s).glow > glow);
  const second = rollAnswer(s, right({ uid: "again", due: true }), unlucky, NOW);
  assert.deepEqual([second.extra, second.luck, second.streak], [true, EXTRA_LUCK * 2, 12]);
});

test("an answer given too fast doesn't roll and doesn't move the streak; a source may have its own floor", () => {
  const s = newState(6);
  rollAnswer(s, right({ uid: "a" }), always(0.5), NOW);
  const r = rollAnswer(s, right({ uid: "b", ms: FAST_MS - 1, source: "pond" }), always(0.5), NOW);
  assert.deepEqual([r.rolled, r.why, r.streak], [false, "fast", 1]);
  assert.equal(lootState(s).rolls, 1);
  assert.equal(rollAnswer(s, right({ uid: "b", ms: FAST_MS, source: "pond" }), always(0.5), NOW).rolled, true);
  // A flashcard is read, turned and checked: its floor is higher.
  assert.ok(FAST_MS_BY.cards > FAST_MS);
  assert.equal(rollAnswer(s, right({ uid: "c", ms: FAST_MS_BY.cards - 1 }), always(0.5), NOW).why, "fast");
  assert.equal(rollAnswer(s, right({ uid: "c", ms: FAST_MS_BY.cards }), always(0.5), NOW).rolled, true);
  assert.equal(rollAnswer(s, right({ uid: "d", ms: undefined }), always(0.5), NOW).rolled, true, "no time given: it rolls");
});

test("a word rolls in full once a day, whatever the source; again it is an extra, and extras run out", () => {
  const s = newState(7);
  const unlucky = always(0.999999);
  let r = rollAnswer(s, right({ uid: "w", due: true }), unlucky, NOW);
  assert.equal(r.extra, false);
  assert.equal(r.luck, DUE_LUCK);
  r = rollAnswer(s, right({ uid: "w", due: true, source: "fish" }), unlucky, NOW);
  assert.equal(r.extra, true, "the same word fished the same day");
  assert.equal(r.luck, EXTRA_LUCK);
  assert.equal(rollAnswer(s, right({ uid: "w", due: true }), unlucky, day(1)).extra, false, "the next day it rolls in full again");
  for (let i = 0; i < EXTRA_DAY; i++) assert.equal(rollAnswer(s, right({ uid: `e${i}`, extra: true }), unlucky, day(1)).rolled, true);
  r = rollAnswer(s, right({ uid: "e-last", extra: true }), unlucky, day(1));
  assert.deepEqual([r.rolled, r.why], [false, "spent"]);
  assert.equal(rollAnswer(s, right({ uid: "new-word" }), unlucky, day(1)).rolled, true, "full rolls never run out");
});

test("boss words: missed on 4 different days, then right pays at least a Legendary, once", () => {
  const s = newState(8);
  const unlucky = always(0.999999);
  for (let i = 0; i < 3; i++) rollAnswer(s, { correct: false, uid: "hard" }, unlucky, NOW); // one day counts once
  assert.equal(isBoss(s, "hard"), false);
  for (let d = 1; d < BOSS_MISSES; d++) rollAnswer(s, { correct: false, uid: "hard" }, unlucky, day(d));
  assert.equal(isBoss(s, "hard"), true);
  assert.equal(isBoss(s, "other"), false);
  assert.equal(bossCount(s), 1);
  const r = rollAnswer(s, right({ uid: "hard" }), unlucky, day(5));
  assert.equal(r.boss, true);
  assert.ok(r.tier >= BOSS_TIER);
  assert.equal(isBoss(s, "hard"), false, "beaten");
  // Only BOSS_DAY bosses a day pay their floor; the rest stay bosses for tomorrow.
  for (let w = 0; w <= BOSS_DAY; w++) for (let d = 0; d < BOSS_MISSES; d++) rollAnswer(s, { correct: false, uid: `b${w}` }, unlucky, day(10 + d));
  const tiers = [];
  for (let w = 0; w <= BOSS_DAY; w++) tiers.push(rollAnswer(s, right({ uid: `b${w}` }), unlucky, day(20)));
  assert.equal(tiers.filter((x) => x.boss).length, BOSS_DAY);
  assert.equal(isBoss(s, `b${BOSS_DAY}`), true);
  assert.equal(rollAnswer(s, right({ uid: `b${BOSS_DAY}` }), unlucky, day(21)).boss, true);
});

test("a Golden hour: started now and then by a roll, x3 luck for 10 minutes, at most once a day", () => {
  const s = newState(9);
  const script = (...xs) => { let i = 0; return () => (i < xs.length ? xs[i++] : 0.999999); };
  // The roll (a Common), then the Golden hour's draw.
  const r = rollAnswer(s, right({ uid: "a" }), script(0.999999, 0), NOW);
  assert.equal(r.golden, true);
  assert.equal(golden(s, NOW), GOLDEN_MS);
  const later = new Date(NOW.getTime() + 60000);
  const next = rollAnswer(s, right({ uid: "b" }), script(0.999999, 0), later);
  assert.equal(next.golden, false, "not a second one");
  assert.ok(next.parts.some((p) => p.id === "golden" && p.x === GOLDEN_LUCK));
  assert.equal(golden(s, new Date(NOW.getTime() + GOLDEN_MS + 1)), 0, "over after 10 minutes");
  const nextDay = new Date(NOW.getTime() + 86400000);
  assert.equal(rollAnswer(s, right({ uid: "c" }), script(0.999999, 0), nextDay).golden, true, "a new day may have one again");
});

test("the rewards: glow, food, gems, supplies, an egg and things to wear, never coins", () => {
  assert.equal(REWARDS.length, TIERS.length);
  for (const tier of REWARDS) for (const c of tier) for (const g of c.grants) assert.notEqual(g.kind, "coins", "flashcards never pay coins");
  const s = newState(10);
  const g = garden(s);
  const glow = g.glow;
  const coins = s.coins;
  const r = rollAnswer(s, right({ uid: "a" }), always(0.999999), NOW);
  assert.equal(r.tier, 0);
  assert.deepEqual(r.reward.grants, [{ kind: "glow", n: 1 }], "with nothing built, a Common's floor");
  assert.equal(g.glow, glow + 1);
  assert.equal(s.coins, coins);
  // Glow is so many minutes of the garden's output, so a bigger garden makes every roll worth more.
  const rich = newState(101);
  garden(rich).plots[0].open = true;
  garden(rich).glow = 100000;
  assert.equal(build(rich, 0, "word_sprout"), "");
  const rate = totalRate(rich);
  assert.ok(rate > 0);
  const minutes = [1, 3, 10, 30, 180];
  const floors = [1, 3, 10, 30, 150];
  for (let t = 0; t < 5; t++) {
    const poor = rewardFor(newState(102), t, always(0)).grants[0];
    const well = rewardFor(rich, t, always(0)).grants[0];
    assert.deepEqual(poor, { kind: "glow", n: floors[t] }, `tier ${t} with no garden`);
    assert.equal(well.n, Math.max(floors[t], Math.round((rate * minutes[t]) / 60)), `tier ${t} with a garden`);
  }
  garden(rich).plots[0].tier = 3;
  assert.ok(rewardFor(rich, 3, always(0)).grants[0].n > 30, "a grown building lifts an Epic over its floor");
  // Every tier's reward works out and pays.
  const rand = seeded(11);
  for (let t = 0; t < TIERS.length; t++) {
    for (let i = 0; i < 20; i++) {
      const paid = payReward(s, rewardFor(s, t, rand), rand);
      assert.equal(paid.tier, t);
      assert.ok(paid.grants.length >= 1);
      for (const x of paid.grants) assert.ok(["glow", "gems", "food", "supply", "egg", "wearable"].includes(x.kind), x.kind);
    }
  }
  assert.equal(s.coins, coins, "still no coins");
});

test("an egg with a full roster, and a wearable when there is none left, become gems", () => {
  const s = newState(12);
  while (s.roster.length < MAX_CREATURES) layEgg(s);
  const gems = s.gems || 0;
  const paid = payReward(s, { tier: 6, grants: [{ kind: "egg" }] });
  assert.deepEqual(paid.grants, [{ kind: "gems", n: 6, instead: "egg" }]);
  assert.equal(s.gems, gems + 6);
  assert.equal(s.roster.length, MAX_CREATURES);
  s.owned = ITEMS.map((it) => it.id);
  const r = rewardFor(s, 7, always(0.3));
  assert.equal(r.grants[0].kind, "gems");
  assert.equal(r.grants[0].instead, "wearable");
  const fresh = newState(13);
  const w = rewardFor(fresh, 9, always(0.3)).grants[0];
  assert.equal(w.kind, "wearable");
  const it = ITEMS.find((x) => x.id === w.id);
  assert.ok(it && !it.prize && it.price >= 45, "an Eternal's wearable is one of the dearest, never a colouring's prize");
  payReward(fresh, { tier: 9, grants: [w] });
  assert.ok(fresh.owned.includes(w.id));
});

test("pay: false rolls without paying; a mini-game and the cards share one streak and one pity count", () => {
  const s = newState(14);
  const unlucky = always(0.999999);
  const glow = garden(s).glow;
  for (let i = 0; i < 49; i++) {
    const r = rollAnswer(s, { source: "fish", correct: true, ms: 3000, uid: `f${i}`, pay: false }, unlucky, NOW);
    assert.equal(r.reward, null);
  }
  assert.equal(garden(s).glow, glow);
  const card = rollAnswer(s, right({ uid: "card" }), unlucky, NOW);
  assert.equal(card.tier, EPIC, "the 50th roll, from the cards, is the pity Epic");
  assert.equal(card.streak, 50);
});

test("normalize: old saves gain a clean loot part, broken ones are put right, good ones kept", () => {
  const old = JSON.parse(JSON.stringify(newState(15)));
  delete old.loot;
  const s = normalize(old);
  assert.deepEqual(s.loot.found, new Array(TIERS.length).fill(0));
  assert.equal(s.loot.streak, 0);
  assert.equal(rollAnswer(s, right({ uid: "a" }), always(0.5), NOW).rolled, true);

  const broken = JSON.parse(JSON.stringify(newState(16)));
  broken.loot = { streak: "lots", since: null, found: "x", miss: { ok: [5, 20000], bad: "x", [`${"k".repeat(40)}`]: [1, 1] }, golden: -5, log: [null, { tier: 99, t: 1, what: 5 }], day: { rolled: [1, "a"] } };
  const b = normalize(broken).loot;
  assert.equal(b.streak, 0);
  assert.deepEqual(b.since, { epic: 0, legendary: 0 });
  assert.equal(b.found.length, TIERS.length);
  assert.deepEqual(Object.keys(b.miss), ["ok"]);
  assert.equal(b.golden, 0);
  assert.deepEqual(b.log, [{ tier: TIERS.length - 1, t: 1, what: "5" }]);
  assert.deepEqual(b.day.rolled, ["a"]);

  const played = newState(17);
  for (let i = 0; i < 20; i++) rollAnswer(played, right({ uid: `w${i}`, due: true }), seeded(3), NOW);
  rollAnswer(played, { correct: false, uid: "m" }, seeded(3), NOW);
  const again = normalize(JSON.parse(JSON.stringify(played)));
  assert.deepEqual(again.loot, cleanLoot(played.loot));
  assert.equal(again.loot.rolls, 20);
  assert.equal(again.loot.streak, 0);
  assert.equal(Object.keys(again.loot.miss).length, 1);
});

// ----- what the reveal shows (lootview.js) -----
const artFile = (art) => fileURLToPath(new URL(`../../web/game-art/${art}.png`, import.meta.url));

test("every reward a roll can pay has words and a picture that exists", () => {
  const grants = [
    { kind: "glow", n: 1 }, { kind: "glow", n: 12500 }, { kind: "gems", n: 1 }, { kind: "gems", n: 50 }, { kind: "egg" },
    { kind: "supply", id: "shield", n: 1 }, { kind: "supply", id: "shield", n: 3 }, { kind: "supply", id: "xp_boost", n: 1 },
    ...FOODS.map((f) => ({ kind: "food", id: f.id, n: 3 })),
    ...ITEMS.filter((it) => !it.prize).map((it) => ({ kind: "wearable", id: it.id, n: 1 })),
  ];
  // (every kind the table can pay is in that list)
  const kinds = new Set(REWARDS.flat().flatMap((c) => c.grants.map((g) => g.kind)));
  assert.deepEqual([...kinds].sort(), ["egg", "food", "gems", "glow", "supply", "wearable"]);
  for (const id of new Set(REWARDS.flat().flatMap((c) => c.grants.filter((g) => g.kind === "supply").map((g) => g.id)))) {
    assert.ok(grants.some((g) => g.kind === "supply" && g.id === id), `supply ${id}`);
  }
  for (const g of grants) {
    const v = grantView(g);
    assert.ok(v.text, JSON.stringify(g));
    assert.ok(existsSync(artFile(v.art)), `${v.art}.png for ${JSON.stringify(g)}`);
  }
  assert.equal(grantView({ kind: "glow", n: 12500 }).text, `+${(12500).toLocaleString()} glow`);
  assert.equal(grantView({ kind: "gems", n: 1 }).text, "+1 gem");
  assert.equal(grantView({ kind: "food", id: "food_fish", n: 3 }).text, "Fish ×3");
  assert.equal(grantView({ kind: "supply", id: "shield", n: 2 }).text, "Streak shield ×2");
  const two = rewardView({ tier: 9, grants: [{ kind: "wearable", id: "hat/crown", n: 1 }, { kind: "gems", n: 50 }] });
  assert.deepEqual(two, { art: "item/hat/crown", text: "Crown + +50 gems", lines: ["Crown", "+50 gems"] });
  assert.deepEqual(rewardView(null), { art: "", text: "", lines: [] });
  assert.equal(luckText([{ id: "due", x: 2 }, { id: "streak", x: 3 }, { id: "bonus", x: 1.25 }]), "Due ×2 · Streak ×3 · Bonus ×1.25");
});

test("the reveal climbs one tier at a time, slower the higher it goes, and only Epic and better break out", () => {
  for (let tier = 0; tier < TIERS.length; tier++) {
    const steps = climb(tier);
    assert.deepEqual(steps.map((x) => x.tier), [...Array(tier).keys()], `tier ${tier} passes every tier under it`);
    assert.equal(steps.filter((x) => x.breakout).length, tier >= EPIC ? 1 : 0);
    const total = steps.reduce((n, x) => n + x.ms, 0);
    if (tier < EPIC) assert.ok(total <= 300, `a small find is quick (${total} ms)`);
    for (let i = EPIC + 1; i < steps.length; i++) assert.ok(steps[i].ms > steps[i - 1].ms, "each tier past Epic waits longer");
  }
  assert.equal(climb(LEGENDARY).find((x) => x.breakout).tier, 2, "it looks like a Rare until it breaks out");
  assert.ok(climb(9).reduce((n, x) => n + x.ms, 0) > 4000, "an Eternal keeps you waiting");
  assert.equal(climb(1, true).filter((x) => x.breakout).length, 1, "a mini-game may ask for a big reveal of a small find");
  assert.ok(holdFor(9) > holdFor(LEGENDARY) && holdFor(LEGENDARY) > holdFor(EPIC));
});

// ----- where a chip goes on a flashcard (the owner: "so they do not cover any information on the screen") -----
test("a chip sits in the card's empty top corner, across from the status badge and level with it", () => {
  // A phone 412 px wide: the card 18 px in from each side, 60 px down; a "NEW WORD" badge 106 px wide.
  const card = { left: 18, top: 60, width: 376 };
  const at = cornerSlot({ card, host: { width: 412 }, badge: 106, free: 215 });
  assert.deepEqual(at, { top: 60 + CHIP.top, right: 18 + CHIP.inset, maxWidth: 376 - CHIP.inset - (CHIP.badgeInset + 106 + CHIP.gap), small: false });
  assert.ok(!("left" in at), "its corner is the right one");
  // Right to left (the Arabic interface): the badge is on the right, so the empty corner is the left one.
  const rtl = cornerSlot({ card, host: { width: 412 }, badge: 106, free: 215, rtl: true });
  assert.deepEqual(rtl, { top: 60 + CHIP.top, left: 18 + CHIP.inset, maxWidth: at.maxWidth, small: false });
  // A card in the middle of a wide window.
  assert.equal(cornerSlot({ card: { left: 350, top: 70, width: 580 }, host: { width: 1280 }, badge: 80, free: 300 }).right, 1280 - 350 - 580 + CHIP.inset);
  // No badge (the place a big find starts from, between two cards): the whole width less the two insets.
  assert.equal(cornerSlot({ card, host: { width: 412 } }).maxWidth, 376 - 2 * CHIP.inset);
  // It never asks for less room than it needs to say anything at all.
  assert.equal(cornerSlot({ card: { left: 0, top: 0, width: 200 }, host: { width: 200 }, badge: 150 }).maxWidth, CHIP.minWidth);
});

test("a crowded card gets the one-line chip, which keeps to the badge's own band", () => {
  const card = { left: 18, top: 60, width: 376 };
  const need = CHIP.top + CHIP.height + CHIP.gap;
  assert.equal(cornerSlot({ card, host: { width: 412 }, badge: 106, free: need }).small, false, "just enough room for the usual chip");
  const tight = cornerSlot({ card, host: { width: 412 }, badge: 106, free: need - 1 });
  assert.deepEqual([tight.small, tight.top], [true, 60 + CHIP.smallTop]);
  // The numbers come from the stylesheets: a card's front keeps its top padding free, the timer bar is above
  // the chip, and the one-line chip is as tall as its tile, padding and border make it.
  const css = (file) => readFileSync(new URL(`../../web/css/${file}`, import.meta.url), "utf8");
  const review = css("review.css"), app = css("app.css");
  const padTop = Number(/\.rv-front \{[^}]*padding: (\d+)px/.exec(review)[1]);
  const [, barTop, barHeight] = /\.rv-timer \{[^}]*top: (\d+)px;[^}]*height: (\d+)px/.exec(review).map(Number);
  assert.ok(CHIP.smallTop + CHIP.smallHeight <= padTop, "the one-line chip ends where the card's padding does");
  assert.ok(Math.min(CHIP.top, CHIP.smallTop) >= barTop + barHeight, "under the timer bar");
  const tile = Number(/\.loot\.small \.loot-tile \{ width: (\d+)px/.exec(app)[1]);
  const pad = Number(/\.loot\.small \.loot-pill \{ padding: (\d+)px/.exec(app)[1]);
  assert.equal(tile + 2 * pad + 2 * 2, CHIP.smallHeight, "tile + padding + a 2px border each side");
  const big = Number(/\.loot-tile \{[^}]*width: (\d+)px/.exec(app)[1]);
  assert.equal(big + 2 * 4 + 2 * 2, CHIP.height);
  // The reviewer asks for the corner, and puts the chips away when the card is turned.
  const js = readFileSync(new URL("../../web/js/pages/review.js", import.meta.url), "utf8");
  assert.match(js, /cornerSlot\(\{/);
  assert.match(js, /busy = true;\s+clearChips\(\);/, "flip() clears the corner: the back has no empty one");
  assert.match(js, /if \(showBack\) clearChips\(\);/);
});

test("the reviewer's chip helper never takes the place of its `say` option (v0.53.0: dead answer buttons)", () => {
  // openReview({ say }) is the Vocab page's voice. In v0.53.0 a `function say(chips)` inside openReview took
  // its place, so turning a card that says its word threw inside flip() and left `busy` set: Remembered and
  // Not remembered did nothing.
  const js = readFileSync(new URL("../../web/js/pages/review.js", import.meta.url), "utf8");
  assert.match(js, /export function openReview\(\{[^}]*\bsay = null\b/, "openReview still takes `say`");
  assert.doesNotMatch(js, /\bfunction say\s*\(/, "no function named `say` in the reviewer (it would replace the option everywhere)");
  assert.match(js, /function sayChips\(chips\)/);
  // And flip() always lets the answer buttons go, whatever goes wrong while the card turns.
  assert.match(js, /async function flip\(\) \{[\s\S]*?try \{[\s\S]*?\} finally \{\s*busy = false;\s*\}/);
});
