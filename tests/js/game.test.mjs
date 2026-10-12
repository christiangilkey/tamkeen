// Run with: node --test tests/js/
// The creature game's rules and creature generator (no screen code).
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { artFiles, BRANCH_IDS, SPECIES_IDS, TYPE_IDS } from "../../web/js/game/data.js";
import { describe, leadingBranch, newGenome, rng, stageOf, weightedPick } from "../../web/js/game/genome.js";
import { ADULT_XP, DAILY_COMPLETE_XP, earn, fade, levelOf, newState, normalize, rollDay, rollReward, wordMultiplier } from "../../web/js/game/rules.js";

const at = (iso) => new Date(iso);
const seq = (...values) => { let i = 0; return () => values[i++ % values.length]; };

test("the same seed is always the same creature", () => {
  const a = describe(newGenome(84213));
  const b = describe(newGenome(84213));
  assert.deepEqual(a, b);
  assert.ok(SPECIES_IDS.includes(a.species) && TYPE_IDS.includes(a.type));
  const looks = new Set();
  for (let s = 1; s <= 60; s++) looks.add(JSON.stringify(describe(newGenome(s))));
  assert.ok(looks.size > 50, "different seeds give different creatures");
  const r = rng(7);
  assert.equal(rng(7)(), r(), "the generator is repeatable");
});

test("growing changes proportions and unlocks features, never the creature's identity", () => {
  const g = newGenome(4242);
  const egg = describe(g);
  assert.equal(egg.stage, "egg");
  g.growth = 0.1;
  const baby = describe(g);
  g.growth = 0.5;
  const teen = describe(g);
  g.growth = 0.9;
  assert.equal(describe(g).size, "m", "it waits as a juvenile until its owner evolves it");
  g.branch = "echo";
  g.branches = ["echo"];
  const adult = describe(g);
  assert.deepEqual([baby.size, teen.size, adult.size], ["s", "m", "l"]);
  for (const k of ["species", "ear", "tail", "eyes", "pattern", "type"]) assert.equal(adult[k], baby[k], `${k} carries over`);
  assert.deepEqual(adult.colors, baby.colors, "colours carry over");
  assert.equal(baby.horn, "none", "horns come in with age");
  assert.equal(teen.branch, null);
  assert.ok(BRANCH_IDS.includes(adult.branch));
});

test("the adult form follows how the owner studies", () => {
  const g = newGenome(99);
  g.traits.reader = 0.6;
  g.traits.listener = 0.2;
  assert.equal(leadingBranch(g), "sage");
  g.traits.listener = 0.9;
  assert.equal(leadingBranch(g), "echo");
  g.traits.collector = 0.95;
  assert.equal(leadingBranch(g), "keeper");
  const blank = newGenome(99);
  assert.equal(leadingBranch(blank), leadingBranch(newGenome(99)), "no habits yet: decided by the seed, consistently");
  // Traits bias which optional parts are rolled.
  const picks = { gem: 0 };
  const list = [{ id: "plain" }, { id: "gem", weight_by: { collector: 9 } }];
  const r = rng(1);
  for (let i = 0; i < 200; i++) if (weightedPick(list, r, { collector: 1 }).id === "gem") picks.gem++;
  assert.ok(picks.gem > 150);
});

test("variable rewards follow the documented odds", () => {
  const r = rng(123);
  const count = { common: 0, lucky: 0, jackpot: 0, surprise: 0 };
  for (let i = 0; i < 20000; i++) {
    const w = rollReward(r);
    count[w.tier]++;
    if (w.tier === "common") assert.ok(w.xp >= 5 && w.xp <= 15);
    if (w.tier === "lucky") assert.ok(w.xp >= 30 && w.xp <= 50);
    if (w.tier === "jackpot") assert.ok(w.xp >= 100 && w.xp <= 200);
    if (w.tier === "surprise") assert.ok(w.xp === 0 && ["freeze", "hint"].includes(w.item));
  }
  assert.ok(Math.abs(count.common / 20000 - 0.7) < 0.02);
  assert.ok(Math.abs(count.lucky / 20000 - 0.2) < 0.02);
  assert.ok(Math.abs(count.jackpot / 20000 - 0.08) < 0.01);
  assert.ok(Math.abs(count.surprise / 20000 - 0.02) < 0.006);
});

test("a word pays once a day, and combos multiply the next roll", () => {
  const s = newState(5);
  const combo = { count: 0, at: 0 };
  const common = seq(0.1, 0.5); // tier roll, then amount: common, 10 XP
  const first = earn(s, { type: "word", key: "es:hola" }, { rand: common, now: at("2026-10-10T10:00:00"), combo });
  assert.deepEqual([first.tier, first.xp, first.combo], ["common", 10, 1]);
  assert.equal(earn(s, { type: "word", key: "es:hola" }, { rand: common, now: at("2026-10-10T10:00:05"), combo }), null);
  const second = earn(s, { type: "word", key: "es:mundo" }, { rand: common, now: at("2026-10-10T10:00:10"), combo });
  assert.deepEqual([second.combo, second.xp], [1.2, 12]);
  assert.deepEqual([second.base, second.mult], [10, 1.2], "the popup's sum: 10 ×1.2 = 12");
  const later = earn(s, { type: "word", key: "es:gato" }, { rand: common, now: at("2026-10-10T10:05:00"), combo });
  assert.equal(later.combo, 1, "the chain breaks after a pause");
  assert.equal(s.xp, 32);
  // Tomorrow the same word pays again.
  assert.ok(earn(s, { type: "word", key: "es:hola" }, { rand: common, now: at("2026-10-11T09:00:00"), combo }));
});

test("the multiplier shown beside a word is the one that was really applied", () => {
  // Combo, an XP boost and the day's fade all multiply a lookup. The popup shows one number for
  // all of them, so base x mult must always equal the XP that was given.
  const common = seq(0.1, 0.5); // rolls 10 XP
  const now = at("2026-10-10T10:00:00");
  const s = newState(8);
  s.boostUntil = now.getTime() / 1000 + 600; // a double-XP boost is running
  const combo = { count: 2, at: now.getTime() - 1000 }; // this lookup is the fourth of a chain: x2
  const boosted = earn(s, { type: "word", key: "a" }, { rand: common, now, combo });
  assert.deepEqual([boosted.base, boosted.combo, boosted.mult, boosted.xp], [10, 2, 4, 40]);
  const tired = newState(9);
  rollDay(tired, now);
  tired.day.taps = 40; // past the day's first 40 lookups, rewards are worth 0.4
  const faded = earn(tired, { type: "word", key: "a" }, { rand: common, now, combo: { count: 2, at: now.getTime() - 1000 } });
  assert.deepEqual([faded.base, faded.combo, faded.mult, faded.xp], [10, 2, 0.8, 8]);
  assert.equal(wordMultiplier(tired, 0, now), 0.4, "what the next lookup will be worth once the chain breaks");
});

test("grinding fades fast; a surprise gives an item instead of XP", () => {
  assert.deepEqual([fade(0, 40, 120), fade(39, 40, 120), fade(40, 40, 120), fade(80, 40, 120), fade(120, 40, 120)], [1, 1, 0.4, 0.1, 0]);
  const s = newState(6);
  const now = at("2026-10-10T10:00:00");
  let total = 0;
  for (let i = 0; i < 300; i++) {
    const r = earn(s, { type: "word", key: `w${i}` }, { rand: seq(0.1, 0.5), now, combo: { count: 0, at: 0 } });
    total += r ? r.xp : 0;
  }
  assert.equal(total, 40 * 10 + 40 * 4 + 40 * 1, "300 taps earn barely more than 80");
  const before = s.items.freeze + s.items.hint;
  const surprise = earn(newState(7), { type: "word", key: "x" }, { rand: seq(0.99, 0.1), now });
  assert.equal(surprise.xp, 0);
  assert.ok(surprise.item);
  assert.equal(before, 1);
});

test("the daily goal is the big payout, the same whatever its size", () => {
  for (const goal of [5, 20]) {
    const s = newState(8);
    s.goal = goal;
    let done = null;
    let ticks = 0;
    while (!done && ticks < 1000) {
      const r = earn(s, { type: "study", seconds: 5, mode: "listen" }, { now: at("2026-10-10T10:00:00") });
      ticks++;
      if (r && r.goalDone) done = r;
    }
    assert.equal(ticks, goal * 12, "reached after exactly the goal's minutes");
    assert.ok(done.xp >= DAILY_COMPLETE_XP);
    assert.equal(s.streak, 1);
    assert.ok(s.coins >= 10, "10 coins for the goal, plus 5 for each level gained on the way");
    const xpAtGoal = s.xp;
    for (let i = 0; i < 12 * 180; i++) earn(s, { type: "study", seconds: 5, mode: "listen" }, { now: at("2026-10-10T12:00:00") });
    assert.ok(s.xp - xpAtGoal < xpAtGoal, "three more hours earn less than reaching the goal did");
    assert.ok(s.creature.traits.listener > s.creature.traits.reader);
  }
});

test("streaks: a freeze covers a missed day; without one the streak restarts quietly", () => {
  const s = newState(9);
  const study = (day) => { for (let i = 0; i < 120; i++) earn(s, { type: "study", seconds: 5, mode: "read" }, { now: at(`2026-10-${day}T10:00:00`) }); };
  study("10");
  study("11");
  assert.equal(s.streak, 2);
  study("13"); // the 12th was missed: the one freeze is spent
  assert.deepEqual([s.streak, s.items.freeze], [3, 0]);
  const xp = s.xp;
  study("16"); // two days missed, no freezes left
  assert.equal(s.streak, 1);
  assert.equal(s.best_streak, 3);
  assert.ok(s.xp > xp, "nothing else is lost");
});

test("an egg hatches on the first day's goal, and growth reaches adulthood", () => {
  const s = newState(10);
  assert.equal(stageOf(s.creature.growth).id, "egg");
  let hatched = false;
  for (let i = 0; i < 120; i++) {
    const r = earn(s, { type: "study", seconds: 5, mode: "listen" }, { now: at("2026-10-10T10:00:00") });
    if (r && r.stage === "hatchling") hatched = true;
  }
  assert.ok(hatched);
  s.creature.growth = 0.699;
  s.creature.traits.reader = 0.9;
  const r = earn(s, { type: "save" }, { now: at("2026-10-10T11:00:00") });
  assert.equal(r.stage, "ready", "grown enough: now it waits for its owner");
  assert.equal(s.creature.branch, null);
  assert.ok(ADULT_XP > 3000);
});

test("levels, new days and old saves", () => {
  assert.deepEqual(levelOf(0), { level: 1, into: 0, need: 1000 });
  assert.equal(levelOf(999).level, 1);
  assert.equal(levelOf(1000).level, 2);
  assert.deepEqual(levelOf(1000 + 1320), { level: 3, into: 0, need: 1680 }, "ten times the old 100, 132, 168");
  assert.ok(levelOf(50000).level > levelOf(10000).level);
  const s = newState(11);
  rollDay(s, at("2026-10-10T08:00:00"));
  s.day.taps = 5;
  rollDay(s, at("2026-10-10T23:00:00"));
  assert.equal(s.day.taps, 5);
  rollDay(s, at("2026-10-11T00:01:00"));
  assert.equal(s.day.taps, 0);
  const old = normalize({ creature: { seed: 3, growth: 0.2 }, xp: 50 });
  assert.equal(old.xp, 50);
  assert.equal(old.goal, 10);
  assert.ok(old.creature.traits && old.items && old.day);
  assert.ok(normalize(null).creature);
});

test("every art file the game needs exists at the right place", () => {
  const files = artFiles();
  assert.ok(files.length > 150);
  assert.equal(new Set(files.map((f) => f.file)).size, files.length, "no duplicates");
  for (const f of files) {
    assert.ok(existsSync(new URL(`../../web/game-art/${f.file}`, import.meta.url)), f.file);
    assert.ok(f.w > 0 && f.h > 0);
  }
});

test("the shop: a daily selection that suits the creature, bought with coins", async () => {
  const { buy, equip, placeDecor, shopStock, SHOP_SIZE } = await import("../../web/js/game/rules.js");
  const { CATALOG } = await import("../../web/js/game/data.js");
  const s = newState(12);
  const monday = shopStock(s, at("2026-10-12T09:00:00"));
  assert.equal(monday.length, SHOP_SIZE);
  assert.deepEqual(shopStock(s, at("2026-10-12T21:00:00")), monday, "the same all day");
  assert.notDeepEqual(shopStock(s, at("2026-10-13T09:00:00")).map((i) => i.id), monday.map((i) => i.id), "different tomorrow");
  assert.ok(monday.every((it) => !it.requires), "locked items stay out until their tag is earned");
  s.tags.push("night_owl", "streak_7");
  const seen = new Set();
  for (let d = 1; d <= 28; d++) for (const it of shopStock(s, at(`2026-11-${String(d).padStart(2, "0")}T09:00:00`))) seen.add(it.id);
  assert.ok([...seen].some((id) => CATALOG.find((x) => x.id === id).requires), "earned tags unlock items");

  const hat = CATALOG.find((x) => x.id === "hat/cap");
  assert.match(buy(s, hat.id), /need 15 more coins/);
  s.coins = 40;
  assert.equal(buy(s, hat.id), "");
  assert.equal(s.coins, 25);
  assert.equal(s.creature.equipped.hat, "hat/cap", "a new item goes straight on");
  assert.match(buy(s, hat.id), /already/);
  assert.ok(!shopStock(s, at("2026-10-12T09:00:00")).some((it) => it.id === hat.id), "owned items leave the shop");
  equip(s, "hat", null);
  assert.equal(s.creature.equipped.hat, undefined);
  equip(s, "hat", "hat/crown");
  assert.equal(s.creature.equipped.hat, undefined, "can't wear what you don't own");
  equip(s, "face", hat.id);
  assert.equal(s.creature.equipped.face, undefined, "or wear a hat as glasses");

  assert.equal(buy(s, "decor/mushroom"), "");
  assert.equal(s.decor.length, 1);
  assert.ok(s.decor[0].x >= 16 && s.decor[0].x <= 304);
  const x = s.decor[0].x;
  placeDecor(s, "decor/mushroom", false);
  assert.equal(s.decor.length, 0);
  placeDecor(s, "decor/mushroom", true);
  assert.equal(s.decor[0].x, x, "it goes back to the same spot");
  assert.equal(describe(s.creature).equipped.hat, undefined);
});

test("study habits earn tags; levelling up pays coins", () => {
  const s = newState(13);
  earn(s, { type: "study", seconds: 5, mode: "listen" }, { now: at("2026-10-10T23:10:00") });
  assert.deepEqual(s.tags, ["night_owl"]);
  earn(s, { type: "study", seconds: 5, mode: "listen" }, { now: at("2026-10-11T05:30:00") });
  assert.ok(s.tags.includes("early_bird"));
  const coins = s.coins;
  s.xp = 999;
  const r = earn(s, { type: "save" }, { now: at("2026-10-11T12:00:00") });
  assert.ok(r.levelUp);
  assert.equal(s.coins, coins + 1 + 5);
});
