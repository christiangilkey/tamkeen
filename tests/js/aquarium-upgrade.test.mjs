// A bigger aquarium, bought with pearls, and a full one letting a new fish in by swapping (game/fishing.js,
// fishscreen.js; the owner, 2026-11-16). Friends still see six at most: the online check allows six.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TANKS, TANK_SIZE } from "../../web/js/game/fishdata.js";
import { newState } from "../../web/js/game/rules.js";
import { cleanAquarium } from "../../web/js/game/remote.js";
import { buyTank, cleanFishing, fishingOf, land, nextTank, publicAquarium, swapTank, tankSize, toTank } from "../../web/js/game/fishing.js";

const T0 = new Date("2026-11-16T09:00:00");
const hatched = () => { const s = newState(7); s.creature.growth = 0.2; return s; };
const catchSome = (s, tiers) => { for (const t of tiers) land(s, { pond: "tide", sp: "guppy", tier: t }, () => 0.5, T0); };

test("the aquariums: the first is free and holds TANK_SIZE, each next one holds more and costs more pearls", () => {
  assert.equal(TANKS[0].size, TANK_SIZE);
  assert.equal(TANKS[0].pearls, 0);
  for (let i = 1; i < TANKS.length; i++) {
    assert.ok(TANKS[i].size > TANKS[i - 1].size, TANKS[i].id);
    assert.ok(TANKS[i].pearls > TANKS[i - 1].pearls, TANKS[i].id);
  }
});

test("buying a bigger aquarium spends pearls and lets more fish in; not enough pearls, nothing changes", () => {
  const s = hatched();
  const f = fishingOf(s);
  assert.equal(tankSize(s), TANK_SIZE);
  assert.match(buyTank(s), /more pearls/);
  assert.equal(f.tankLv, 0);
  f.pearls = TANKS[1].pearls + 3;
  assert.equal(buyTank(s), "");
  assert.equal(f.pearls, 3);
  assert.equal(tankSize(s), TANKS[1].size);
  catchSome(s, Array(TANKS[1].size + 1).fill(0));
  for (let i = 0; i < TANKS[1].size; i++) assert.equal(toTank(s, 0), "");
  assert.match(toTank(s, 0), /full/);
  f.pearls = 1e5;
  while (nextTank(s)) assert.equal(buyTank(s), "");
  assert.equal(tankSize(s), TANKS[TANKS.length - 1].size);
  assert.match(buyTank(s), /as big as it gets/);
});

test("a full aquarium lets a new fish in: it takes the chosen fish's place, which goes back to the basket", () => {
  const s = hatched();
  const f = fishingOf(s);
  catchSome(s, Array(TANK_SIZE).fill(0));
  for (let i = 0; i < TANK_SIZE; i++) toTank(s, 0);
  catchSome(s, [7]);
  assert.equal(f.bag.length, 1);
  assert.equal(swapTank(s, 0, 2), "");
  assert.equal(f.tank.length, TANK_SIZE);
  assert.equal(f.tank[2].t, 7);
  assert.equal(f.bag.length, 1);
  assert.equal(f.bag[0].t, 0);
  assert.match(swapTank(s, 5, 0), /basket/);
  assert.match(swapTank(s, 0, 99), /aquarium/);
});

test("the aquarium's size is saved and cleaned; friends see the best six, which their check keeps", () => {
  const big = Array.from({ length: 20 }, (_, i) => ({ sp: "guppy", t: i % 10, cm: 3 + i }));
  const f = cleanFishing({ tankLv: 2, tank: big });
  assert.equal(f.tankLv, 2);
  assert.equal(f.tank.length, TANKS[2].size);
  assert.equal(cleanFishing({ tankLv: 99 }).tankLv, TANKS.length - 1);
  assert.equal(cleanFishing({ tankLv: "x", tank: big }).tank.length, TANK_SIZE);
  const s = hatched();
  s.fishing = { tankLv: 3, tank: big };
  const mine = publicAquarium(s, T0);
  assert.equal(mine.tank.length, TANK_SIZE);
  assert.deepEqual(mine.tank.map((x) => x.t), [9, 8, 7, 7, 6, 6], "the rarest first (18 of the 20 fit: tiers 0-9 then 0-7)");
  assert.equal(cleanAquarium(mine).tank.length, TANK_SIZE);
  assert.match(readFileSync(new URL("../../supabase/v9-fishing.sql", import.meta.url), "utf8"), /jsonb_array_length\(a->'tank'\) > 6/);
});

test("the Basket offers the bigger aquarium, and a full one's fish box swaps instead of greying out", () => {
  const ui = readFileSync(new URL("../../web/js/game/fishscreen.js", import.meta.url), "utf8");
  assert.match(ui, /const next = nextTank\(game\);[\s\S]{0,400}open: \(\) => tankUpgradeBox\(game, again\)/);
  assert.match(ui, /word: full \? "Swap in" : "Aquarium"/);
  assert.doesNotMatch(ui, /disabled: full/);
  assert.match(ui, /function swapBox\(game, fish, again\)/);
});
