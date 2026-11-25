// The currencies' brief popup (web/js/game/currencies.js, shown by info.openCurrency): every line names where in the
// game's code its reward or its use comes from, and those must still be there.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CURRENCIES, CURRENCY_KINDS, currencyOf } from "../../web/js/game/currencies.js";
import { SUPPLIES } from "../../web/js/game/data.js";
import { REWARDS } from "../../web/js/game/loot.js";

const src = (file) => readFileSync(new URL(`../../web/js/game/${file}`, import.meta.url), "utf8");

test("the five currencies, each brief: an icon, two or three ways to get it, one or two uses", () => {
  assert.deepEqual(CURRENCY_KINDS, ["coins", "gems", "glow", "pearls", "stardust"]);
  for (const [kind, c] of Object.entries(CURRENCIES)) {
    assert.ok(c.name && c.icon, kind);
    assert.ok(c.get.length >= 1 && c.get.length <= 3, `${kind}: how to get it`);
    assert.ok(c.use.length >= 1 && c.use.length <= 2, `${kind}: what it's for`);
    for (const l of [...c.get, ...c.use]) assert.ok(l.text.length <= 160, `${kind}: "${l.text}" is short`);
    assert.equal(currencyOf(c.icon), c, `${kind} is found by its icon's name too`);
  }
});

test("each line's source still exists in the code", () => {
  for (const [kind, c] of Object.entries(CURRENCIES)) {
    for (const l of [...c.get, ...c.use]) {
      for (const [file, name] of l.from) {
        const re = new RegExp(`\\b(function|const|let)\\s+${name}\\b`);
        assert.match(src(file), re, `${kind}: "${l.text}" comes from ${file} ${name}, which is gone`);
      }
    }
  }
});

test("the lines match what the code pays and sells", () => {
  // gems: every supply priced in gems is named, and the flashcard rolls still pay gems
  const gemUse = CURRENCIES.gems.use[0];
  assert.deepEqual(gemUse.supplies, SUPPLIES.filter((s) => s.gems).map((s) => s.id));
  for (const s of SUPPLIES.filter((x) => x.gems)) assert.ok(gemUse.text.toLowerCase().includes(s.name.toLowerCase()), `gems buy ${s.name}`);
  const grants = REWARDS.flat().flatMap((choice) => choice.grants.map((g) => g.kind));
  assert.ok(grants.includes("gems"), "a flashcard roll can pay gems");
  assert.ok(grants.includes("glow"), "a flashcard roll can pay glow");
  assert.ok(!grants.includes("coins"), "flashcard rolls pay no coins (battles pay coins)");
  // gems and their amounts in idle.tick: badges, raids, league rises, full bloom 10
  const idle = src("idle.js");
  assert.match(idle, /badgesPaid/);
  assert.match(idle, /raidsPaid/);
  assert.match(idle, /leaguePaid/);
  assert.match(idle, /out\.gems \+= 10/, "full bloom pays 10 gems, as the popup says");
  // coins: the daily goal pays 10
  assert.match(src("rules.js"), /function reachGoal[\s\S]{0,200}state\.coins \+= 10;/, "the daily goal pays 10 coins, as the popup says");
  // pearls buy rods and aquariums, and come from catches
  assert.match(src("fishing.js"), /f\.pearls \+= pearls/);
});

test("every currency counter opens the popup", () => {
  const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
  assert.match(read("web/js/game/shop.js"), /openCurrency\(p\.kind/, "the game sheet's head");
  assert.match(read("web/js/game/habitat.js"), /openCurrency\("coins"/, "Home: coins");
  assert.match(read("web/js/game/habitat.js"), /openCurrency\("gems"/, "Home: gems");
  assert.match(read("web/js/game/habitat.js"), /currencyTaps\(/, "the data-cur counters");
  assert.match(read("web/js/game/fishing-ui.js"), /data-cur="pearls"/, "the pond's pearls");
  assert.match(read("web/js/game/garden.js"), /data-cur="stardust"/, "the garden's stardust");
});
