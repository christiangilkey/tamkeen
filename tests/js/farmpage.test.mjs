// The farm page (prototype "farm_page", web/js/game/farmpage.js; the owner, 2026-11-27: "tapping on the farm icon ...
// should just pop open a farming page", "each interaction with them should require a question answered").
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PROTOTYPES } from "../../web/js/prototype.js";

const src = (f) => readFileSync(new URL(`../../web/js/game/${f}`, import.meta.url), "utf8");

test("a prototype, off for everyone else", () => {
  assert.equal(PROTOTYPES.farm_page.released, false);
  const h = src("habitat.js");
  assert.match(h, /feature\("farm_page"\) \? tile\("garden", "farm\/seedstand", "Farm"\)/, "Home's Garden tile is Farm with it");
  assert.match(h, /if \(feature\("farm_page"\)\) openFarm\(/, "and opens the farm page");
  assert.match(h, /if \(sp && feature\("farm_page"\)\) \{ sfx\("tick"\); openFarm\(/, "so does a tap on the village's field");
});

test("every planting, watering and harvest asks one of your words first, and a wrong answer never loses the seed or the crop", () => {
  const p = src("farmpage.js");
  assert.match(p, /await ask\("plant", key, c,/);
  assert.match(p, /await ask\("harvest", key, s\.crop, \(\) => harvest\(game, key\)\)/, "harvested right or wrong");
  assert.match(p, /await ask\("water", key, s\.crop, \(correct\) => \{ const r = water\(game, key, correct\)/, "a wrong answer gives a little water, as in the village");
  assert.match(p, /answerQuestion\(game, q\.uid, correct\)/);
  assert.match(p, /if \(!q\) \{ finish\(kind, key, crop, true, act\(true\)\); return; \}/, "with no word to ask it is done at once");
});

test("the watering chain is a sound, never pay; nothing pays for speed; the harvest gets its rarity reveal", () => {
  const p = src("farmpage.js");
  assert.doesNotMatch(p, /coins|gems|\.glow \+=|glow \+=/, "no pay anywhere on the page");
  assert.match(p, /sfx\(`chain\$\{Math\.min\(chain, CHAIN_MAX\)\}`\)/);
  assert.match(p, /reveal\(\$\("\.farmp-field"\), \{ rolled: true, tier: r\.tier, reward: null \}/);
  assert.match(src("game.js"), /\/\^chain\[1-9\]\$\/\.test\(kind\)/, "the chain's rising note");
});

test("big plots: at most about four columns across a phone, never under a fingertip; a near miss counts", () => {
  const p = src("farmpage.js");
  assert.match(p, /Math\.max\(44, Math\.min\(box\.width \/ Math\.min\(w, 4\.2\)/);
  assert.match(p, /return bd < CELL \? best : null;/);
});
