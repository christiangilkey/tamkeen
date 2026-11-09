// Run with: node --test tests/js/
// The creature game's rules and creature generator (no screen code).
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { BEASTS, SPECIES_IDS, TYPE_IDS, artFiles, beastLayers, beastsOf } from "../../web/js/game/data.js";
import { describe, isGrown, newGenome, rng, stageOf, weightedPick } from "../../web/js/game/genome.js";
import { ADULT_XP, DAILY_COMPLETE_XP, HABIT_XP, earn, fade, levelOf, newState, normalize, rollDay, rollReward, wordMultiplier } from "../../web/js/game/rules.js";

const at = (iso) => new Date(iso);
const seq = (...values) => { let i = 0; return () => values[i++ % values.length]; };

test("the same seed is always the same creature", () => {
  const a = describe(newGenome(84213));
  const b = describe(newGenome(84213));
  assert.deepEqual(a, b);
  assert.ok(SPECIES_IDS.includes(a.species) && TYPE_IDS.includes(a.type));
  // Each element has its three creatures (an original, a cyberpunk and a fantasy one), and seeds reach them all.
  for (const type of TYPE_IDS) {
    assert.deepEqual(beastsOf(type).map((b) => b.set), ["original", "cyberpunk", "fantasy"], type);
    const seen = new Set();
    for (let s = 1; s <= 60; s++) seen.add(describe(newGenome(s, type)).beast);
    assert.equal(seen.size, 3, `different seeds give each of ${type}'s creatures`);
  }
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
  g.growth = 1;
  const grown = describe(g);
  assert.ok(isGrown(g));
  assert.deepEqual([baby.size, teen.size, grown.size], ["s", "m", "m"], "it stays a juvenile: no adult size");
  assert.equal(grown.stage, "juvenile");
  for (const k of ["beast", "species", "type", "tint"]) assert.deepEqual(grown[k], baby[k], `${k} carries over`);
});

test("habits nudge which optional parts are rolled", () => {
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

test("a word pays once a day, and lookups in the same session build a combo, however slow", () => {
  const s = newState(5);
  const combo = { count: 0, at: 0, session: 0 };
  const common = seq(0.1, 0.5); // tier roll, then amount: common, 10 XP
  const first = earn(s, { type: "word", key: "es:hola" }, { rand: common, now: at("2026-10-10T10:00:00"), combo, session: 1 });
  assert.deepEqual([first.tier, first.xp, first.combo], ["common", 10, 1]);
  assert.equal(earn(s, { type: "word", key: "es:hola" }, { rand: common, now: at("2026-10-10T10:00:05"), combo, session: 1 }), null);
  // Five minutes later, still in the same session: the combo goes on (no timer).
  const second = earn(s, { type: "word", key: "es:mundo" }, { rand: common, now: at("2026-10-10T10:05:10"), combo, session: 1 });
  assert.deepEqual([second.combo, second.xp], [1.2, 12]);
  assert.deepEqual([second.base, second.mult], [10, 1.2], "the popup's sum: 10 ×1.2 = 12");
  const later = earn(s, { type: "word", key: "es:gato" }, { rand: common, now: at("2026-10-10T11:00:00"), combo, session: 2 });
  assert.equal(later.combo, 1, "a new session starts the chain again");
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
  const combo = { count: 2, at: now.getTime() - 1000, session: 1 }; // this lookup is the fourth of a chain: x2
  const boosted = earn(s, { type: "word", key: "a" }, { rand: common, now, combo, session: 1 });
  assert.deepEqual([boosted.base, boosted.combo, boosted.mult, boosted.xp], [10, 2, 4, 40]);
  const tired = newState(9);
  rollDay(tired, now);
  tired.day.taps = 40; // past the day's first 40 lookups, rewards are worth 0.4
  const faded = earn(tired, { type: "word", key: "a" }, { rand: common, now, combo: { count: 2, at: now.getTime() - 1000, session: 1 }, session: 1 });
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

test("an egg hatches on the first day's goal, and growth reaches fully grown (still a juvenile)", () => {
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
  assert.equal(r.stage, "grown", "fully grown: it pays once and leaves an egg");
  assert.equal(stageOf(s.creature.growth).id, "juvenile");
  assert.ok(ADULT_XP > 3000);
});

test("curiosity fills 20 times more slowly than the other habits, and old saves are converted once", () => {
  assert.equal(HABIT_XP.curious, HABIT_XP.collector * 20);
  const now = at("2026-10-10T10:00:00");
  const looker = newState(21);
  const r = earn(looker, { type: "word", key: "a" }, { rand: seq(0.1, 0.5), now }); // rolls 10 XP
  assert.equal(r.xp, 10);
  assert.ok(Math.abs(looker.creature.traits.curious - 10 / 30000) < 1e-12);
  const saver = newState(22);
  earn(saver, { type: "save" }, { now }); // 20 XP of collecting
  assert.ok(Math.abs(saver.creature.traits.collector - 20 / 1500) < 1e-12);
  // A save from before the change: its curiosity is brought onto the new scale, once.
  const old = normalize({ roster: [{ seed: 5, growth: 0.5, traits: { curious: 1, reader: 0.6 } }], xp: 900 });
  assert.deepEqual([old.creature.traits.curious, old.creature.traits.reader, old.curious20], [0.05, 0.6, true]);
  assert.equal(normalize(JSON.parse(JSON.stringify(old))).creature.traits.curious, 0.05, "not divided a second time");
  assert.equal(normalize(JSON.parse(JSON.stringify(newState(23)))).curious20, true);
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

test("every creature is drawn, cut into layers, with somewhere for each worn thing", () => {
  assert.equal(BEASTS.length, 18);
  assert.equal(new Set(BEASTS.map((b) => b.id)).size, 18);
  for (const b of BEASTS) {
    assert.ok(SPECIES_IDS.includes(b.plan), b.id);
    assert.ok(b.name && Number.isFinite(b.hue), b.id);
    for (const slot of ["hat", "face", "neck", "held", "back"]) {
      const [x, y] = b.sockets[slot];
      assert.ok(x >= 0 && y >= 0 && x < b.size[0] && y < b.size[1], `${b.id} ${slot} socket inside its drawing`);
    }
    for (const layer of beastLayers(b)) assert.ok(existsSync(new URL(`../../web/game-art/creature/beast/${b.id}/${layer}.png`, import.meta.url)), `${b.id} ${layer}`);
    // ...and a hatchling look of its own: smaller, with its own layers and sockets.
    assert.ok(b.young, `${b.id} has a hatchling look`);
    assert.ok(b.young.box[3] - b.young.box[1] < b.box[3] - b.box[1], `${b.id}'s hatchling is smaller`);
    for (const slot of ["hat", "face", "neck", "held", "back"]) assert.ok(b.young.sockets[slot], `${b.id} hatchling ${slot}`);
    for (const layer of beastLayers(b.young)) assert.ok(existsSync(new URL(`../../web/game-art/creature/beast/${b.id}/hatchling/${layer}.png`, import.meta.url)), `${b.id} hatchling ${layer}`);
  }
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

test("a grammar lesson finished pays once a day, more the first time and for more right answers", () => {
  const s = newState(5);
  const now = at("2026-10-24T10:00:00");
  const first = earn(s, { type: "grammar", key: "en-ar/say-what-you-want", right: 4, of: 4, first: true }, { now });
  assert.equal(first.xp, 80);
  assert.equal(earn(s, { type: "grammar", key: "en-ar/say-what-you-want", right: 4, of: 4 }, { now }), null, "the same lesson again today: nothing");
  const again = earn(s, { type: "grammar", key: "en-ar/say-who-you-are", right: 2, of: 4 }, { now });
  assert.equal(again.xp, 23, "a lesson done before, half right: 15 + 8");
  assert.equal(s.stats.grammar, 2);
  assert.ok(earn(s, { type: "grammar", key: "en-ar/say-what-you-want", right: 4, of: 4 }, { now: at("2026-10-25T10:00:00") }), "it pays again tomorrow");
  assert.equal(earn(s, { type: "grammar", key: "", right: 1, of: 1 }, { now }), null);
  const old = normalize({ ...newState(6), day: { key: "2026-10-24", seconds: 0 } });
  assert.ok(earn(old, { type: "grammar", key: "review:20385", right: 6, of: 8 }, { now }), "a save from before grammar lessons");
});

test("a creature with wings of its own doesn't wear wings as well (the owner's rule)", async () => {
  const { CATALOG, OWN_WINGS } = await import("../../web/js/game/data.js");
  const { beastOf } = await import("../../web/js/game/genome.js");
  const { buy, equip, fits } = await import("../../web/js/game/rules.js");
  assert.deepEqual([...OWN_WINGS].sort(), ["chick", "dragon_whelp", "griffin", "winged_fox"], "the four with wings in their drawing");
  assert.ok([...OWN_WINGS].every((id) => BEASTS.some((b) => b.id === id)));
  assert.deepEqual(CATALOG.filter((it) => it.wings).map((it) => it.id).sort(), ["back/angel_wings", "back/bat_wings", "back/butterfly_wings"]);
  const kind = (id) => { for (let seed = 1; seed < 5000; seed++) { const g = newGenome(seed, "dusk"); if (beastOf(g).id === id) return { ...g, equipped: {} }; } return null; };
  const fox = kind("winged_fox"), cat = kind("cat");
  const s = newState(7);
  s.roster = [fox, cat];
  s.active = 0;
  s.coins = 500;
  assert.equal(fits(fox, CATALOG.find((it) => it.id === "back/bat_wings")), false);
  assert.equal(fits(fox, CATALOG.find((it) => it.id === "back/cape_red")), true, "anything else fits");
  assert.equal(buy(s, "back/butterfly_wings"), "", "wings can still be bought");
  assert.ok(s.owned.includes("back/butterfly_wings"));
  assert.equal(fox.equipped.back, undefined, "but they don't go on the winged fox");
  equip(s, "back", "back/butterfly_wings");
  assert.equal(fox.equipped.back, undefined, "and can't be put on it");
  s.active = 1;
  equip(s, "back", "back/butterfly_wings");
  assert.equal(cat.equipped.back, "back/butterfly_wings", "another creature can wear them");
  // A save from before the rule: the winged fox's wings come off when the game loads; the cat keeps its own.
  fox.equipped.back = "back/butterfly_wings";
  const loaded = normalize(JSON.parse(JSON.stringify(s)));
  assert.equal(loaded.roster[0].equipped.back, undefined);
  assert.equal(loaded.roster[1].equipped.back, "back/butterfly_wings");
});
