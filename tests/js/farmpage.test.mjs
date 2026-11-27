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
  assert.match(h, /if \(feature\("farm_page"\) && inPen\(x, y, fw, fh\)\) \{ sfx\("tick"\); openFarm\(/, "so does a tap anywhere in the village's farm pen");
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

test("in the village, a tap anywhere in the farm's pen (plots, paths, its fence) opens the farm page; no plot's sheet opens there", async () => {
  const { FIELD, fieldLeft, inPen, spotXY } = await import("../../web/js/game/farmmap.js");
  for (const [w, hh] of [[3, 3], [12, 6]]) {
    for (let r = 0; r < hh; r++) for (let c = 0; c < w; c++) assert.ok(inPen(spotXY(c, r).x, spotXY(c, r).y, w, hh), `plot ${c},${r}`);
    assert.ok(inPen((fieldLeft(w) - 1) * 16 + 4, (FIELD.y + 1) * 16, w, hh), "the fence on its west side");
    assert.ok(inPen((FIELD.right + 1) * 16 + 12, (FIELD.y + hh) * 16 + 8, w, hh), "the fence's corner by the gap");
    assert.ok(!inPen((FIELD.right + 3) * 16, (FIELD.y + 1) * 16, w, hh), "the grass beyond it walks");
  }
  const h = src("habitat.js");
  assert.ok(h.indexOf('if (feature("farm_page") && inPen(x, y, fw, fh))') < h.indexOf("const sp = plotAt(x, y, fw, fh);"), "the pen is asked first");
  assert.match(src("farmpage.js"), /openFence\(\{ changed: \(\) => \{ fit\(\); paint\(\); \} \}\)/, "the fence is on the farm page: growing the field");
});

test("outdoor pictures never stay missing after a failed load: the scenes' caches ask again (render.artCache)", () => {
  const r = src("render.js");
  const fn = r.slice(r.indexOf("export function artCache("), r.indexOf("/** A picture from game-art/ written straight into the page"));
  assert.match(fn, /else failed\.set\(file, Date\.now\(\)\)/, "a failed load is remembered with its time");
  assert.match(fn, /Date\.now\(\) - when > FORGET_MS \+ 1000/, "and asked for again once loadImage forgets the failure");
  const h = src("habitat.js");
  assert.doesNotMatch(h, /in decorArt\)\) \{ decorArt\[[^\]]+\] = null; loadImage/, "decorations: no ask-once cache");
  assert.doesNotMatch(h, /if \(!\(p in yardImgs\)\)/, "the yard's and farm's pictures: no ask-once cache");
  assert.match(h, /else setTimeout\(\(\) => \{ if \(!disposed\) loadArt\(k, f\); \}, 21000\)/, "the scene's own art asks again too");
  assert.doesNotMatch(src("farmpage.js") + src("farm-ui.js"), /const pics = \{\};/, "the farm page and its card too");
});
