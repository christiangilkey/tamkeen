// What the farm's harvests are for (prototype "farm", slice 4 of tamkeen-plans/farming-plan.md, web/js/game/farmuses.js):
// food (a favourite crop: Well fed, +5% against the game ONLY), bait, the Cookbook's dishes, Muffle orders that wake a
// word, selling at the fruit stall. Nothing adds strength in battles between people.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  FAVOURITES, RECIPES, canCook, cook, feedCrop, festivalDay, fillOrder, have, makeBait, ordersToday, sell, sellPrice, wake, wellFed,
  wokenKeys,
} from "../../web/js/game/farmuses.js";
import { CROPS, cropById, farmOf } from "../../web/js/game/farm.js";
import { fighter } from "../../web/js/game/battle.js";
import { luckOf } from "../../web/js/game/fishing.js";
import { newGenome } from "../../web/js/game/genome.js";
import { TYPES } from "../../web/js/game/data.js";

const day = new Date(2026, 10, 23, 12); // a Monday
const sunday = new Date(2026, 10, 29, 12);
function game() {
  const c = newGenome(12345, "tide");
  c.growth = 0.5;
  const s = { review: {}, stats: {}, day: { key: "2026-11-23" }, items: {}, roster: [c], active: 0, creature: c, idle: { glow: 1000 } };
  farmOf(s).barn = { "wheat:0": 10, "corn:1": 4, "melon:0": 5, "blueberry:0": 6, "basil:0": 4, "tomato:0": 8, "pumpkin:2": 1, "beans:0": 6 };
  s.farm.honey = 3;
  return s;
}

test("every element has a favourite crop each season, all real crops; every dish explains itself and asks for real things", () => {
  for (const type of Object.keys(TYPES)) {
    const favs = FAVOURITES[type];
    assert.equal(favs.length, 4, type);
    assert.deepEqual(new Set(favs.map((id) => cropById(id).season)), new Set(["spring", "summer", "autumn", "winter"]), type);
  }
  assert.equal(RECIPES.length, 3 + 6 + 2 + 4, "picnic, tea, stew, six pies, tart, jelly, soup, feast, champion's meal, porridge");
  for (const r of RECIPES) assert.ok(r.text && r.name && r.needs.length, r.id);
  assert.ok(CROPS.length);
});

test("feeding a crop: a meal like any food; a favourite makes it Well fed for a day", () => {
  const s = game();
  assert.deepEqual(feedCrop(s, "tomato:0", null, day), { loved: false, wellFed: false });
  assert.equal(wellFed(s.creature, day), false);
  assert.deepEqual(feedCrop(s, "melon:0", null, day), { loved: true, wellFed: true });
  assert.equal(wellFed(s.creature, day), true);
  assert.equal(wellFed(s.creature, new Date(day.getTime() + 25 * 3600e3)), false, "a day");
  assert.equal(s.farm.barn["melon:0"], 4);
  feedCrop(s, "tomato:0", null, day);
  assert.match(feedCrop(s, "tomato:0", null, day), /full/, "three meals a day");
});

test("Well fed and the Champion's meal: stronger ONLY in battles against the game (vsGame), never with friends or ranked", () => {
  const s = game();
  const c = s.creature;
  c.loadout = []; // (no moves needed to weigh its strength)
  const plain = fighter(s, c, { vsGame: true });
  c.wellFed = Math.floor(Date.now() / 1000) + 3600;
  const fed = fighter(s, c, { vsGame: true });
  assert.ok(Math.abs(fed.atk / plain.atk - 1.05) < 1e-9 && Math.abs(fed.def / plain.def - 1.05) < 1e-9);
  const friend = fighter(s, c, {});
  assert.equal(friend.atk, fighter(s, { ...c, wellFed: 0 }, {}).atk, "no Well fed between people");
  assert.ok(Math.abs(fighter(s, c, { vsGame: true, champion: true }).atk / fed.atk - 1.1) < 1e-9);
  assert.equal(fighter(s, c, { champion: true }).atk, friend.atk, "no Champion's meal between people");
});

test("bait: three from a crop; a quarter more luck at the pond while there is some", () => {
  const s = game();
  const before = luckOf(s, "tide");
  assert.equal(makeBait(s, "tomato:0", day), "");
  assert.equal(s.farm.bait, 3);
  assert.ok(Math.abs(luckOf(s, "tide") / before - 1.25) < 0.01);
});

test("cooking: the ingredients leave the barn, commonest first; each dish's effect starts", () => {
  const s = game();
  assert.equal(have(s, "grain"), 14);
  assert.deepEqual(cook(s, "focus_tea", {}, day), { effect: "focus_tea" });
  assert.equal(s.farm.buffs.focus, 20);
  assert.equal(s.farm.honey, 2);
  cook(s, "stew", {}, day);
  assert.equal(s.farm.buffs.stew, "2026-11-23");
  cook(s, "pie_ember", {}, day);
  assert.ok(!s.farm.buffs.lean, "no ember favourite in the barn: not cooked");
  s.farm.barn["pepper:0"] = 2;
  assert.deepEqual(cook(s, "pie_ember", {}, day), { effect: "pie_ember" });
  assert.equal(s.farm.buffs.lean, "ember");
  assert.equal(s.farm.barn["corn:1"], 4, "the rarer corn kept while there was common wheat");
  cook(s, "picnic", {}, day);
  assert.ok(s.creature.fedAt >= day.getTime() / 1000 + 2 * 86400, "no hunger for 3 days");
  cook(s, "berry_tart", {}, day);
  assert.ok(s.creature.tint && s.creature.tint.hue > 0);
  assert.match(cook(s, "feast", {}, day), /festival/);
  assert.equal(festivalDay(sunday), true);
  assert.match(cook(s, "porridge", { egg: 0, porridge: () => "Only an egg can have Warm porridge." }, day), /Only an egg/);
  assert.equal(s.farm.honey, 2, "nothing used when the egg can't have it");
  assert.deepEqual(cook(s, "porridge", { egg: 0, porridge: () => "" }, day), { effect: "porridge" });
  assert.equal(canCook(s, RECIPES.find((r) => r.id === "champion"), day), true);
});

test("selling and orders: glow for harvests; three orders a day, the same for everyone; filling one pays more", () => {
  const s = game();
  const got = sell(s, s.idle, "pumpkin:2", 1, day);
  assert.equal(got, sellPrice(cropById("pumpkin"), 2));
  assert.ok(sellPrice(cropById("pumpkin"), 2) > sellPrice(cropById("pumpkin"), 0), "rarer fetches more");
  const a = ordersToday(s, day);
  assert.deepEqual(a.map((o) => [o.folk, o.crop.id, o.n]), ordersToday(game(), day).map((o) => [o.folk, o.crop.id, o.n]));
  assert.ok(a.length >= 1 && a.length <= 3 && !a.some((o) => o.folk === "cook"));
  const o = a[0];
  s.farm.barn[`${o.crop.id}:0`] = o.n;
  const glow = s.idle.glow, coins = Number(s.coins) || 0;
  assert.deepEqual(fillOrder(s, s.idle, o.i, day), { coins: 5 }, "an order pays 5 coins (the owner: orders pay gold)");
  assert.equal(s.coins, coins + 5);
  assert.equal(s.idle.glow, glow, "and no glow");
  assert.ok(ordersToday(s, day).length <= 3, "three a day at most: 15 coins a day at most");
  assert.match(fillOrder(s, s.idle, o.i, day), /filled/);
  wake(s, "ar", ["سوق"]);
  assert.ok(wokenKeys(s, "ar").has("سوق"));
});

test("an element pie decides the next egg bought from the shop, and only that one (the owner, 2026-11-28)", async () => {
  const { layEgg, newState } = await import("../../web/js/game/rules.js");
  const { buySupply } = await import("../../web/js/game/idle.js");
  for (const r of [0.01, 0.3, 0.55, 0.8, 0.99]) { // (whatever the egg's own roll would have been)
    const s = newState();
    s.gems = 50;
    farmOf(s).barn = { "wheat:0": 10, ...Object.fromEntries(FAVOURITES.tide.map((id) => [`${id}:0`, 2])), ...Object.fromEntries(FAVOURITES.ember.map((id) => [`${id}:0`, 2])) };
    assert.deepEqual(cook(s, "pie_ember", {}, day), { effect: "pie_ember" });
    assert.deepEqual(cook(s, "pie_tide", {}, day), { effect: "pie_tide" });
    assert.equal(s.farm.buffs.lean, "tide", "another pie replaces the first");
    const roster = s.roster.map((g) => g.seed);
    const other = layEgg(s, () => r); // (an egg from growing up, a reward or a battle)
    assert.ok(other, "an egg was laid");
    assert.equal(s.farm.buffs.lean, "tide", "an egg from anywhere but the shop leaves the pie waiting");
    assert.equal(buySupply(s, "egg", () => r), "");
    const bought = s.roster[s.roster.length - 1];
    assert.equal(bought.type, "tide", "the shop's egg hatches as the pie's element");
    assert.ok(!s.farm.buffs.lean, "the pie is used up");
    assert.deepEqual(s.roster.slice(0, roster.length).map((g) => g.seed), roster, "the eggs already there are unchanged");
    assert.equal(buySupply(s, "egg", () => r), "");
    assert.equal(s.roster.length, roster.length + 3);
  }
  const text = RECIPES.find((x) => x.id === "pie_tide").text;
  assert.match(text, /next egg from the shop hatches as a .+ creature/);
});

test("the game's own rules read the dishes: Focus tea in loot.js, the stew and the pie in rules.js, the meal in gyms-ui.js", () => {
  const src = (f) => readFileSync(new URL(`../../web/js/game/${f}`, import.meta.url), "utf8");
  assert.ok(src("loot.js").includes(`ctx.source === "cards" && state.farm && state.farm.buffs && state.farm.buffs.focus > 0`));
  assert.ok(src("rules.js").includes("state.farm.buffs.stew === dayKey() ? 1.5 : 1"));
  assert.ok(src("rules.js").includes("newGenome((rand() * 2 ** 32) >>> 0, lean || type)"));
  assert.ok(src("gyms-ui.js").includes("vsGame: true, champion }"));
  assert.ok(src("habitat.js").includes(`st.opens === "garden" && farmOn()) openFruitStall`));
});
