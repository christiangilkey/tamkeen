// Run with: node --test tests/js/
// The garden: buildings that make glow, plots, releasing a creature, food and hearts, supplies.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { FOODS, PLOTS, STRUCTURES, SUPPLIES, TIER_COST, TIER_RATE } from "../../web/js/game/data.js";
import { newGenome } from "../../web/js/game/genome.js";
import { answerQuestion, earn, finishBattle, newState } from "../../web/js/game/rules.js";
import {
  AUTO_GOALS, FEEDS_PER_DAY, OFFLINE_HOURS, automated, build, buySupply, collect, costOf, feed, garden, hearts, incubate, meets, rateOf,
  release, tick, totalRate, upgrade, useBoost, useKey,
} from "../../web/js/game/idle.js";
import { fighters, newBattle, usePotion } from "../../web/js/game/battle.js";

const at = (iso) => new Date(iso);
const T0 = at("2026-10-12T08:00:00");
const hours = (n) => new Date(T0.getTime() + n * 3600000);
const hatched = (seed = 61) => { const s = newState(seed); s.creature.growth = 0.2; return s; };
const art = (file) => existsSync(new URL(`../../web/game-art/${file}`, import.meta.url));

test("every building, plot, food and supply has its picture", () => {
  assert.equal(STRUCTURES.length, 6);
  for (const s of STRUCTURES) for (const tier of [1, 2, 3]) assert.ok(art(`structure/${s.id}_${tier}.png`), `${s.id} tier ${tier}`);
  assert.ok(art("structure/plot.png"));
  assert.equal(FOODS.length, 6);
  for (const f of FOODS) assert.ok(art(`icon/${f.id}.png`), f.id);
  for (const s of SUPPLIES) assert.ok(art(`icon/${s.icon || s.id}.png`), s.id);
  for (const id of ["potion", "key", "ticket", "incubator", "xp_boost", "gem", "stardust", "heart_full", "heart_empty", "glow", "release", "egg"]) assert.ok(art(`icon/${id}.png`), id);
  assert.equal(PLOTS.length, 6);
  assert.equal(new Set(FOODS.map((f) => f.loves)).size, 6, "one favourite food for each element");
});

test("plots open with study milestones, in turn; a key opens the next one early", () => {
  const egg = newState(62);
  tick(egg, T0);
  assert.deepEqual(garden(egg).plots.map((p) => p.open), [false, false, false, false, false, false], "nothing before the egg hatches");
  const s = hatched();
  tick(s, T0);
  assert.deepEqual(garden(s).plots.map((p) => p.open), [true, false, false, false, false, false]);
  s.stats.goals = 3;
  s.stats.words = 30;
  tick(s, T0);
  assert.equal(garden(s).plots.filter((p) => p.open).length, 3);
  assert.match(useKey(s), /no key/);
  s.items.key = 1;
  assert.equal(useKey(s), "");
  assert.equal(garden(s).plots.filter((p) => p.open).length, 4);
  assert.equal(s.items.key, 0);
  assert.ok(meets(s, null) && !meets(s, { streak: 5 }) && !meets(s, { mature: 1 }) && !meets(s, { stardust: 1 }));
  s.review = { a: [4, 0, 4, 0], b: [2, 0, 2, 0] };
  assert.ok(meets(s, { mature: 1 }) && !meets(s, { mature: 2 }));
});

test("building and growing: costs rise faster than output, and a second of a kind costs more", () => {
  const s = hatched();
  tick(s, T0);
  const g = garden(s);
  assert.equal(g.glow, 40, "enough to plant the first building");
  assert.match(build(s, 1, "word_sprout"), /isn't open/);
  assert.match(build(s, 0, "echo_shell"), /Reach your daily goal twice/);
  assert.equal(build(s, 0, "word_sprout"), "");
  assert.equal(g.glow, 0);
  assert.match(build(s, 0, "word_sprout"), /already built/);
  assert.match(upgrade(s, 0), /need 200 more glow/);
  g.glow = 2000;
  assert.equal(upgrade(s, 0), "");
  assert.equal(upgrade(s, 0), "");
  assert.equal(g.plots[0].tier, 3);
  assert.match(upgrade(s, 0), /fully grown/);
  assert.equal(costOf(s, 0), null);
  for (let t = 1; t < 3; t++) assert.ok(TIER_COST[t + 1] / TIER_COST[t] > TIER_RATE[t + 1] / TIER_RATE[t], "each tier costs more than it adds");
  g.plots[1].open = true;
  assert.equal(costOf(s, 1, "word_sprout"), Math.round(40 * 1.6), "a second sprout costs more than the first did");
});

test("glow builds up while away, for eight hours at most; reaching the goal and good habits speed it up", () => {
  const s = hatched();
  tick(s, T0);
  build(s, 0, "word_sprout");
  const g = garden(s);
  const base = rateOf(s, g.plots[0], T0);
  assert.equal(base, 12, "a plain sprout: 12 glow an hour");
  assert.equal(tick(s, hours(2)).made, 24);
  assert.equal(Math.round(g.plots[0].stored), 24);
  tick(s, hours(100));
  assert.equal(Math.round(g.plots[0].stored), 12 * OFFLINE_HOURS, "it stops at eight hours' worth: no need to hover");
  assert.equal(collect(s, 0), 96);
  assert.equal(g.glow, 96);
  assert.equal(collect(s), 0);
  // Habits, hearts and today's goal each speed it up.
  s.creature.traits.curious = 1;
  assert.equal(rateOf(s, g.plots[0], hours(100)), 24, "the habit a building likes doubles it at most");
  s.creature.bond = 10;
  assert.ok(Math.abs(rateOf(s, g.plots[0], hours(100)) - 24 * 1.2) < 1e-9, "five hearts: a fifth more");
  s.creature.bond = 0;
  s.creature.traits.curious = 0;
  const day = at("2026-10-20T10:00:00");
  for (let i = 0; i < 120; i++) earn(s, { type: "study", seconds: 5, mode: "listen" }, { now: day });
  assert.equal(rateOf(s, g.plots[0], day), 18, "today's goal reached: half as much again");
  const before = g.glow;
  const r = tick(s, day);
  assert.equal(r.burst, Math.round(totalRate(s, day) * 2), "and two hours of glow arrive at once");
  assert.ok(g.glow >= before + r.burst);
  assert.equal(tick(s, day).burst, 0, "once a day");
});

test("collecting by hand is replaced by automation that is earned, not bought", () => {
  const s = hatched();
  tick(s, T0);
  build(s, 0, "word_sprout");
  assert.equal(automated(s), false);
  tick(s, hours(1));
  assert.equal(garden(s).glow, 0, "it waits in the building until collected");
  s.stats.goals = AUTO_GOALS;
  assert.equal(automated(s), true);
  tick(s, hours(2));
  assert.equal(Math.round(garden(s).glow), 24);
  assert.equal(garden(s).plots[0].stored, 0);
});

test("releasing a fully grown creature starts the garden over, faster for good; full bloom is the end", () => {
  const s = hatched();
  tick(s, T0);
  const g = garden(s);
  assert.match(release(s, 0), /Only a fully grown/);
  s.creature.growth = 0.9;
  s.creature.name = "Pip";
  for (const p of g.plots) Object.assign(p, { open: true, id: "word_sprout", tier: 3 });
  const bloom = tick(s, T0);
  assert.ok(bloom.bloom && g.bloom, "every plot fully grown is full bloom");
  assert.equal(bloom.gems, 10);
  assert.equal(tick(s, T0).gems, 0);
  const slow = totalRate(s, T0);
  s.owned.push("hat/cap");
  const r = release(s, 0, () => 0.5);
  assert.deepEqual(r, { stardust: 4 }, "one, plus one for every two fully grown buildings");
  assert.equal(g.stardust, 4);
  assert.deepEqual(g.released.map((c) => c.name), ["Pip"], "it is remembered");
  assert.ok(g.plots.every((p) => p.open && !p.tier && !p.stored), "plots stay open; buildings start over");
  assert.equal(g.glow, 40);
  assert.equal(s.roster.length, 1, "you are never left without a creature");
  assert.ok(s.owned.includes("hat/cap"), "what you own is kept");
  for (const p of g.plots) Object.assign(p, { id: "word_sprout", tier: 3 });
  assert.equal(totalRate(s, T0), slow * 3, "four stardust: three times as fast as last time");
  assert.ok(meets(s, { stardust: 1 }));
});

test("gems come only from things done: badges, raids won, rising a league", () => {
  const s = hatched();
  assert.equal(tick(s, T0).gems, 0);
  s.badges.push("first_hatch", "first_word");
  s.stats.raids = 1;
  s.league = 2;
  assert.equal(tick(s, T0).gems, 4 + 3 + 4);
  assert.equal(s.gems, 11);
  s.league = 1; // dropping a league takes nothing back, and rising again to the same one pays nothing
  tick(s, T0);
  s.league = 2;
  assert.equal(tick(s, T0).gems, 0);
  assert.match(buySupply(s, "key"), /^$/);
  assert.equal(s.gems, 6);
  assert.match(buySupply(s, "egg", () => 0.3), /^$/);
  assert.equal(s.roster.length, 2);
  assert.match(buySupply(s, "incubator"), /need 4 more gems/);
  assert.match(buySupply(s, "nothing"), /isn't for sale/);
});

test("food raises hearts, the favourite counts double, three times a day; eggs don't eat", () => {
  const s = hatched();
  s.creature.type = "tide";
  garden(s).glow = 500;
  assert.match(feed(s, "food_fish", T0), /none of that/);
  for (let i = 0; i < 5; i++) assert.equal(buySupply(s, "food_fish"), "");
  assert.equal(buySupply(s, "food_leaf"), "");
  assert.equal(garden(s).glow, 500 - 6 * 30);
  assert.deepEqual(feed(s, "food_fish", T0), { bond: 2, loved: true });
  assert.deepEqual(feed(s, "food_leaf", T0), { bond: 3, loved: false });
  assert.equal(hearts(s.creature), 1);
  feed(s, "food_fish", T0);
  assert.match(feed(s, "food_fish", T0), /full for today/);
  assert.equal(s.creature.fed.n, FEEDS_PER_DAY);
  assert.ok(feed(s, "food_fish", hours(24)).bond > 5, "hungry again tomorrow");
  s.creature.bond = 10;
  assert.equal(feed(s, "food_fish", hours(24)).bond, 10, "five hearts is the most");
  const egg = newState(63);
  egg.items.food_berry = 1;
  assert.match(feed(egg, "food_berry", T0), /Eggs don't eat/);
});

test("supplies do what they say: XP boost, battle ticket, incubator, potion", () => {
  // XP boost: looking up, saving and reviewing words pays double while it runs.
  const plain = newState(64);
  const boosted = newState(64);
  boosted.items.xp_boost = 1;
  assert.equal(useBoost(boosted, T0), "");
  assert.match(useBoost(boosted, T0), /no XP boost/);
  const word = (s, now) => earn(s, { type: "word", key: "es:hola" }, { rand: (() => { let i = 0; return () => [0.1, 0.5][i++ % 2]; })(), now, combo: { count: 0, at: 0 } }).xp;
  assert.equal(word(boosted, T0), word(plain, T0) * 2);
  assert.equal(answerQuestion(boosted, "w1", true, T0).xp, answerQuestion(plain, "w1", true, T0).xp * 2);
  const late = hours(1);
  assert.equal(earn(boosted, { type: "save" }, { now: late }).xp, earn(plain, { type: "save" }, { now: late }).xp, "it wears off after twenty minutes");

  // Ticket: one more battle pays in full once the day's first three are done.
  const s = hatched(65);
  s.items.ticket = 1;
  for (let i = 0; i < 3; i++) assert.equal(finishBattle(s, { mode: "wild", won: true }, { now: T0, rand: () => 0.9 }).ticket, false);
  const fourth = finishBattle(s, { mode: "wild", won: true }, { now: T0, rand: () => 0.9 });
  assert.deepEqual([fourth.xp, fourth.ticket, s.items.ticket], [40, true, 0]);
  assert.ok(finishBattle(s, { mode: "wild", won: true }, { now: T0, rand: () => 0.9 }).xp < 40);

  // Incubator: a spare egg grows at half speed alongside the creature in the habitat, until it hatches.
  const inc = hatched(66);
  inc.roster.push(newGenome(700, "dusk"));
  assert.match(incubate(inc, 1), /no incubator/);
  inc.items.incubator = 1;
  assert.match(incubate(inc, 0), /Choose an egg/);
  assert.equal(incubate(inc, 1), "");
  const before = inc.creature.growth;
  for (let i = 0; i < 120; i++) earn(inc, { type: "study", seconds: 5, mode: "read" }, { now: T0 });
  const gained = inc.creature.growth - before;
  assert.ok(Math.abs(inc.roster[1].growth - gained / 2) < 1e-9);
  inc.roster[1].growth = 0.039;
  earn(inc, { type: "save" }, { now: T0 });
  earn(inc, { type: "save" }, { now: T0 });
  assert.equal(inc.incubating, null, "once hatched it leaves the incubator");

  // Potion: half a creature's health back, once, and only against wild creatures.
  const team = () => fighters(null, [{ ...newGenome(500, "tide"), growth: 0.5 }]);
  const wild = newBattle({ mine: team(), theirs: team(), mode: "wild", rand: () => 0.5 });
  assert.equal(usePotion(wild), 0, "nothing to heal at full health");
  wild.mine[0].hp = 10;
  assert.equal(usePotion(wild), Math.round(wild.mine[0].max / 2));
  wild.mine[0].hp = 10;
  assert.equal(usePotion(wild), 0, "once a battle");
  const friend = newBattle({ mine: team(), theirs: team(), mode: "friend", rand: () => 0.5 });
  friend.mine[0].hp = 10;
  assert.equal(usePotion(friend), 0, "never between people");
});
