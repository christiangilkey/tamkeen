// Run with: node --test tests/js/
// The home card (game/homecard.js): the tiles' red dots, what can be collected in the scene, what flies into
// which counter, the goal ring, and the art it needs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { CATALOG, HABITAT, PLOTS, SHOP_MOVES, STAGES } from "../../web/js/game/data.js";
import { newGenome } from "../../web/js/game/genome.js";
import { earn, newState, shopStock, moveStock } from "../../web/js/game/rules.js";
import { garden, incubate, tick } from "../../web/js/game/idle.js";
import {
  EGG_X, GIFT_X, KINDS, affordable, collectables, gains, glowWaiting, goalRing, hatchedAway, nextScene, ringPixels, shopDot, shopSeen,
  tileDots, wallet,
} from "../../web/js/game/homecard.js";

const T0 = new Date("2026-11-06T09:00:00");
const art = (file) => existsSync(new URL(`../../web/game-art/${file}`, import.meta.url));
const hatched = (seed = 61) => { const s = newState(seed); s.creature.growth = 0.2; return s; };
/** A garden with one building that has glow waiting in it. */
function withBuilding(s, stored = 12) {
  const g = garden(s);
  g.plots[0] = { open: true, id: "word_sprout", tier: 1, stored };
  return s;
}

test("the art the card uses is there: the orange streak flame, the snowflake badge, the tiles' and the scene's pictures", () => {
  for (const f of ["icon/streak.png", "icon/freeze_badge.png", "icon/coin.png", "icon/gem.png", "icon/xp.png", "icon/glow.png", "icon/gift.png",
    "icon/battle.png", "icon/nav_roster.png", "icon/nav_shop.png", "structure/word_sprout_2.png", "fx/ready.png", "fx/heart.png", "egg/crack_3.png"]) {
    assert.ok(art(f), f);
  }
});

test("a new player: an egg, nothing waiting, no dots, an empty ring", () => {
  const s = newState(7);
  assert.deepEqual(tileDots(s, { now: T0 }), { battle: false, creatures: false, shop: false, garden: false });
  assert.deepEqual(collectables(s), []);
  assert.deepEqual(goalRing(s), { mins: 0, goal: 10, frac: 0, done: false });
  assert.deepEqual(wallet(s), { xp: 0, coins: 0, gems: 0, glow: 40 }, "a garden starts with 40 glow");
});

test("the goal ring fills with the day's minutes and is full once the goal is reached", () => {
  const s = hatched();
  s.day.seconds = 4 * 60 + 30;
  assert.deepEqual(goalRing(s), { mins: 4, goal: 10, frac: 0.45, done: false });
  s.goal = 5;
  s.day.seconds = 9 * 60;
  assert.equal(goalRing(s).frac, 1, "never past full");
  s.day.done = true;
  s.goal = 20;
  s.day.seconds = 60;
  assert.deepEqual(goalRing(s), { mins: 1, goal: 20, frac: 1, done: true }, "reached (Anki can reach it too): full");
});

test("what went up flies; what went down (spent) doesn't", () => {
  const before = { xp: 100, coins: 10, gems: 2, glow: 40 };
  assert.deepEqual(gains(before, { xp: 124, coins: 11, gems: 2, glow: 30 }), [{ kind: "xp", amount: 24 }, { kind: "coins", amount: 1 }]);
  assert.deepEqual(gains(before, before), []);
  assert.deepEqual(gains(null, before), [], "nothing to compare with: nothing flies");
  assert.deepEqual(KINDS, ["xp", "coins", "gems", "glow"]);
  // a saved word pays XP and a coin: both are seen as gains
  const s = hatched();
  const w0 = wallet(s);
  earn(s, { type: "save" }, { now: T0 });
  assert.deepEqual(gains(w0, wallet(s)).map((g) => g.kind), ["xp", "coins"]);
});

test("glow waiting in a building: the Garden tile's dot and a building to tap in the scene", () => {
  const s = withBuilding(hatched(), 12.6);
  assert.equal(glowWaiting(s), 12);
  assert.equal(tileDots(s, { now: T0 }).garden, true);
  assert.deepEqual(collectables(s), [{ kind: "glow", plot: 0, x: PLOTS[0].x }]);
  garden(s).plots[0].stored = 0.4;
  assert.equal(tileDots(s, { now: T0 }).garden, false, "less than one: nothing to gather yet");
  assert.deepEqual(collectables(s), []);
  // once collecting is automated, glow never waits
  const auto = withBuilding(hatched(), 50);
  auto.stats.goals = 10;
  tick(auto, T0);
  assert.equal(tileDots(auto, { now: T0 }).garden, false);
});

test("a friend's gift waits in the scene; a gift or a challenge lights the Battle tile", () => {
  const s = hatched();
  assert.equal(tileDots(s, { online: { gifts: 0, battles: 0 }, now: T0 }).battle, false);
  assert.equal(tileDots(s, { online: { gifts: 1, battles: 0 }, now: T0 }).battle, true);
  assert.equal(tileDots(s, { online: { gifts: 0, battles: 2 }, now: T0 }).battle, true, "someone challenged my team");
  assert.equal(tileDots(s, { online: { gifts: "lots", battles: -3 }, now: T0 }).battle, false, "nonsense counts light nothing");
  const gift = { id: "g1", kind: "item", from: "bob" };
  assert.deepEqual(collectables(s, { gifts: [gift, { id: "g2" }] }), [{ kind: "gift", gift, x: GIFT_X }], "one box at a time");
  assert.deepEqual(collectables(s, { gifts: [{ kind: "item" }, null] }), [], "a gift without an id can't be opened");
  for (const x of [GIFT_X, EGG_X]) assert.ok(PLOTS.every((p) => Math.abs(p.x - x) >= 20), "between the plots");
});

test("the Shop tile's dot: something newly affordable, until the shop has been opened", () => {
  const s = hatched(31);
  s.coins = 0;
  assert.equal(shopDot(s, null, T0), false, "nothing affordable");
  const cheapest = Math.min(...shopStock(s, T0).map((it) => it.price), ...moveStock(s, T0).map((m) => m.price));
  s.coins = cheapest;
  assert.ok(affordable(s, T0).length >= 1);
  assert.equal(shopDot(s, null, T0), true);
  const seen = shopSeen(s, T0);
  assert.equal(shopDot(s, seen, T0), false, "seen today: no dot");
  s.coins = 1000; // more becomes affordable
  assert.equal(shopDot(s, seen, T0), true);
  s.coins = cheapest;
  assert.equal(shopDot(s, seen, new Date("2026-11-07T09:00:00")), affordable(s, new Date("2026-11-07T09:00:00")).length > 0, "a new day: today's things are new");
  assert.ok(affordable(s, T0).every((id) => /^(item|move):/.test(id)));
  assert.ok(CATALOG.length && SHOP_MOVES.length);
});

test("an egg in the incubator waits in the scene; once it hatches there it is ready to tap, and lights Creatures", () => {
  const s = hatched(66);
  s.roster.push(newGenome(700, "dusk"));
  s.items.incubator = 1;
  assert.equal(incubate(s, 1), "");
  let [egg] = collectables(s);
  assert.equal(egg.kind, "egg");
  assert.equal(egg.index, 1);
  assert.equal(egg.ready, false);
  assert.equal(egg.x, EGG_X);
  assert.ok(egg.progress >= 0 && egg.progress < 1);
  assert.equal(tileDots(s, { now: T0 }).creatures, false);
  // it hatches as the creature in the habitat earns XP
  s.roster[1].growth = STAGES[1].from - 0.0005;
  earn(s, { type: "save" }, { now: T0 });
  assert.equal(s.incubating, null);
  assert.equal(s.roster[1].hatchedAway, true, "marked: it hatched while another was out");
  assert.deepEqual(hatchedAway(s), [1]);
  [egg] = collectables(s);
  assert.deepEqual(egg, { kind: "egg", index: 1, x: EGG_X, ready: true, progress: 1 });
  assert.equal(tileDots(s, { now: T0 }).creatures, true);
  // brought out into the habitat, it no longer waits
  s.active = 1;
  assert.deepEqual(hatchedAway(s), []);
  assert.equal(tileDots(s, { now: T0 }).creatures, false);
});

test("the arrows go round the habitats both ways", () => {
  const themes = HABITAT.themes;
  assert.equal(nextScene(themes, themes[0], 1), themes[1]);
  assert.equal(nextScene(themes, themes[0], -1), themes[themes.length - 1]);
  assert.equal(nextScene(themes, themes[themes.length - 1], 1), themes[0]);
  assert.equal(nextScene(themes, "nowhere", 1), themes[1], "an unknown habitat counts as the first");
});

test("the ring's pixels: a closed ellipse two pixels wide, lit from the front going round", () => {
  const px = ringPixels(34, 10);
  const keys = new Set(px.map((p) => `${p.x},${p.y}`));
  assert.equal(keys.size, px.length, "each pixel once");
  assert.ok(px.every((p) => (p.x / 34) ** 2 + (p.y / 10) ** 2 <= 1.15 && p.f >= 0 && p.f < 1));
  assert.ok(px.some((p) => p.back) && px.some((p) => !p.back), "a back half and a front half");
  assert.ok(px.filter((p) => p.outer).length > px.length / 3 && px.some((p) => !p.outer));
  const first = px.find((p) => p.outer && p.f === 0);
  assert.deepEqual([first.x, first.y], [0, 10], "it starts at the front, under the creature");
  const quarter = px.filter((p) => p.outer && p.f > 0.2 && p.f < 0.3);
  assert.ok(quarter.every((p) => p.x < 0), "then it goes round to the left (clockwise on screen)");
});
