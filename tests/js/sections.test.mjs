// Run with: node --test tests/js/
// The creature game's sections as screens (game/sections.js): which screen each button opens, what its head shows,
// which screens share a switch, that every section can still be reached, and how each screen's things are sorted
// into blocks (the shop's shelves, the bag's pockets, the supplies, the garden's plots).
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { CATALOG, DECOR, ITEMS, MOVES, PLOTS, SHOP_MOVES, SLOTS, STRUCTURES, SUPPLIES, TAGS } from "../../web/js/game/data.js";
import { moveStock, newState, shopStock } from "../../web/js/game/rules.js";
import { costOf, garden, release, stardustGain } from "../../web/js/game/idle.js";
import {
  KIND, PAIRS, POCKETS, SECTIONS, artOf, buildOptions, fitScale, gardenFacts, isOn, lockedShelf, pillsOf, plotRows, pocketBlocks,
  pocketCounts, pocketOf, screenOf, sectionOf, shelves, structureArt, supplyBlocks, wearing,
} from "../../web/js/game/sections.js";

const art = (file) => existsSync(new URL(`../../web/game-art/${file}`, import.meta.url));
const src = (file) => readFileSync(new URL(`../../web/js/game/${file}`, import.meta.url), "utf8");
const hatched = (seed = 61) => { const s = newState(seed); s.creature.growth = 0.2; return s; };
const T0 = new Date("2026-11-06T09:00:00");

test("each section is a screen of its own: its picture and name, no row of tabs", () => {
  assert.deepEqual(Object.keys(SECTIONS).sort(), ["badges", "basket", "battle", "creatures", "fishdex", "fishing", "friends", "garden", "mine", "shop", "supplies"]);
  for (const id of Object.keys(SECTIONS)) {
    const s = screenOf(id);
    assert.equal(s.id, id);
    assert.ok(s.title, id);
    assert.ok(art(`${s.icon.includes("/") ? s.icon : `icon/${s.icon}`}.png`), `${id}'s picture`);
  }
  assert.equal(sectionOf("nonsense"), "shop", "anything unknown opens the shop");
  assert.equal(sectionOf(undefined), "shop");
  assert.equal(sectionOf("toString"), "shop", "not fooled by an object's own names");
  const shop = src("shop.js");
  assert.doesNotMatch(shop, /data-tab=/, "the old row of tabs is gone");
  assert.match(shop, /data-close/, "an X back to Home");
});

test("Shop and My things share one switch, and so do Garden and Supplies, and Creatures and Badges; the switch marks where you are", () => {
  assert.deepEqual(PAIRS, { shop: ["shop", "mine"], garden: ["garden", "supplies"], creatures: ["creatures", "badges"], battle: ["battle", "friends"],
    fishing: ["fishing", "basket", "fishdex"] });
  assert.deepEqual(screenOf("basket").switch.map((o) => [o.id, o.word, o.on]), [["fishing", "Ponds", false], ["basket", "Basket", true], ["fishdex", "Fishdex", false]]);
  assert.deepEqual(screenOf("friends").switch.map((o) => [o.id, o.word, o.on]), [["battle", "Battle", false], ["friends", "Friends", true]]);
  assert.deepEqual(screenOf("shop").switch, [{ id: "shop", word: "Buy", on: true }, { id: "mine", word: "My things", on: false }]);
  assert.deepEqual(screenOf("supplies").switch.map((o) => [o.id, o.on]), [["garden", false], ["supplies", true]]);
  assert.deepEqual(screenOf("badges").switch.map((o) => [o.id, o.word, o.on]), [["creatures", "Creatures", false], ["badges", "Badges", true]]);
  for (const id of Object.keys(SECTIONS)) assert.ok(screenOf(id).switch.some((o) => o.id === id && o.on), `${id} is on a switch`);
});

test("every section can still be reached: from the home card's buttons, then a switch", () => {
  // The home card's buttons (habitat.js) open these directly.
  const home = [...src("habitat.js").matchAll(/\bgo\("(\w+)"\)/g)].map((m) => m[1]);
  for (const id of ["shop", "creatures", "garden", "supplies"]) assert.ok(home.includes(id), `the home card opens ${id}`);
  const reached = new Set(home);
  // The Battle tile opens the battle menu, which is the "battle" section (battle-ui.js openBattleMenu).
  assert.match(src("habitat.js"), /#g-battle"\)\.onclick = \(\) => openBattleMenu\(/);
  assert.match(src("battle-ui.js"), /openShop\("battle", /);
  reached.add("battle");
  // The Fishing tile opens the pond (fishing-ui.js), whose basket button opens the Basket section of the sheet.
  assert.match(src("habitat.js"), /#g-fishing"\)\.onclick = \(\) => openPond\(\{[^}]*sheet: go/);
  assert.match(src("fishing-ui.js"), /opts\.sheet\("basket"\)/);
  reached.add("basket");
  for (const pair of Object.values(PAIRS)) if (pair.some((id) => reached.has(id))) pair.forEach((id) => reached.add(id));
  assert.deepEqual([...reached].sort(), Object.keys(SECTIONS).sort());
});

test("no button anywhere opens a section that doesn't exist", () => {
  const asked = new Set();
  for (const file of ["habitat.js", "info.js", "shop.js", "garden.js", "creatures.js", "movesui.js", "friends-game.js", "battle-ui.js"]) {
    if (!existsSync(new URL(`../../web/js/game/${file}`, import.meta.url))) continue;
    const text = src(file);
    for (const m of text.matchAll(/\bgo\("(\w+)"\)|\btab: "(\w+)"|openShop\("(\w+)"/g)) asked.add(m[1] || m[2] || m[3]);
  }
  asked.delete("evolve"); // (info.js: the guide to how a creature grows, not a section)
  assert.ok(asked.size >= 5, [...asked].join());
  for (const id of asked) assert.equal(sectionOf(id), id, `"${id}" is a section`);
});

test("the head counts what the screen is paid with, and its '?' explains that", () => {
  const s = hatched();
  s.coins = 42; s.gems = 3; garden(s).glow = 123.9;
  assert.deepEqual(pillsOf("shop", s), [{ kind: "coins", icon: "coin", n: 42 }]);
  assert.deepEqual(pillsOf("mine", s).map((p) => p.n), [42]);
  assert.deepEqual(pillsOf("garden", s), [{ kind: "glow", icon: "glow", n: 123 }]);
  assert.deepEqual(pillsOf("supplies", s).map((p) => [p.kind, p.n]), [["glow", 123], ["gems", 3]]);
  assert.deepEqual(pillsOf("creatures", s), []);
  assert.deepEqual(Object.fromEntries(Object.keys(SECTIONS).map((id) => [id, screenOf(id).help])),
    { shop: "coin", mine: "coin", creatures: "evolve", badges: null, garden: "glow", supplies: "gem", battle: "battle", friends: "friends",
      fishing: "fishing", basket: "fishing", fishdex: "fishing" });
  s.fishing = { pearls: 7 };
  assert.deepEqual(pillsOf("fishing", s), [{ kind: "pearls", icon: "pearl", n: 7 }]);
  assert.deepEqual(pillsOf("basket", s).map((p) => [p.kind, p.n]), [["coins", 42], ["pearls", 7]]);
  assert.deepEqual(pillsOf("battle", s), [], "battles are paid with nothing");
  // The Battle screen's "?" and its Friends side's are their own explanations (shop.js picks them by name).
  assert.match(src("shop.js"), /battle: battleHelp, friends: friendsHelp, fishing: fishingHelp/);
});

test("pictures are drawn at whole-number sizes, and every thing on a screen has one", () => {
  assert.equal(fitScale(20, 14, 64), 3);
  assert.equal(fitScale(48, 48, 64), 1);
  assert.equal(fitScale(100, 10, 64), 1, "never smaller than its own size");
  for (const it of CATALOG) {
    const a = artOf(it);
    assert.ok(art(a.file), a.file);
    assert.ok(a.w > 0 && a.h > 0, it.id);
  }
  for (const m of SHOP_MOVES) assert.ok(art(artOf(m).file), m.id);
  for (const s of SUPPLIES) assert.ok(art(artOf(s).file), s.id);
  for (const s of STRUCTURES) for (const tier of [1, 2, 3]) assert.ok(art(structureArt(s.id, tier).file), `${s.id} ${tier}`);
  assert.equal(structureArt(null, 0).file, "structure/plot.png");
  assert.ok(art("ui/slot_empty.png"));
  for (const p of POCKETS) assert.ok(art(`icon/${p.icon}.png`), p.icon);
});

test("the shop counter: things to wear, decorations and battle moves on shelves of their own", () => {
  const s = hatched();
  const stock = shopStock(s, T0);
  const moves = moveStock(s, T0);
  const list = shelves(stock, moves);
  assert.deepEqual(list.map((x) => x.id), ["wear", "decor", "moves"].filter((id) => list.some((x) => x.id === id)), "in the counter's order");
  assert.ok(list.some((x) => x.id === "wear") && list.some((x) => x.id === "moves"));
  assert.equal(list.reduce((n, x) => n + x.items.length, 0), stock.length + moves.length, "nothing left off the counter");
  for (const x of list) assert.ok(x.items.length, "no empty shelf");
  assert.ok(list.find((x) => x.id === "wear").items.every((it) => it.slot !== "decor"));
  assert.deepEqual(shelves([DECOR[0]], []).map((x) => x.id), ["decor"]);
  assert.deepEqual(shelves([], []), []);
  for (const it of CATALOG) assert.ok(KIND[it.slot], `a kind for ${it.slot}`);
});

test("what is still locked: one line per tag to earn, with how many things it opens", () => {
  const s = hatched();
  const locked = lockedShelf(s);
  assert.ok(locked.length > 0);
  for (const l of locked) {
    assert.equal(l.text, TAGS[l.tag]);
    assert.equal(l.n, CATALOG.filter((it) => (it.requires || []).includes(l.tag)).length);
    assert.ok(art(`icon/tag_${l.tag}.png`), l.tag);
  }
  s.tags = Object.keys(TAGS);
  assert.deepEqual(lockedShelf(s), [], "nothing once every tag is earned");
});

test("the bag: a pocket for each kind, things to wear by where they go, decorations out and put away", () => {
  const s = hatched();
  s.owned.push("hat/cap", "hat/beanie", "face/shades", "decor/bush", "decor/shell");
  s.creature.equipped = { hat: "hat/cap" };
  s.decor = [{ id: "decor/bush", x: 10 }];
  s.attacks.push("quick_jab");
  assert.deepEqual(pocketCounts(s), { wear: 3, decor: 2, moves: 1 });
  const wear = pocketBlocks(s, "wear");
  assert.deepEqual(wear.map((b) => [b.id, b.items.map((it) => it.id)]), [["hat", ["hat/cap", "hat/beanie"]], ["face", ["face/shades"]]]);
  assert.deepEqual(wear.map((b) => b.label), ["Hats", "Face"]);
  assert.ok(pocketBlocks({ ...s, owned: ["back/cape_red"] }, "wear")[0].label !== "Back", "not a word that reads as \"go back\"");
  assert.deepEqual(pocketBlocks(s, "decor").map((b) => [b.id, b.items.map((it) => it.id)]), [["out", ["decor/bush"]], ["away", ["decor/shell"]]]);
  assert.deepEqual(pocketBlocks(s, "moves")[0].items.map((m) => m.id), ["quick_jab"]);
  assert.ok(isOn(s, ITEMS.find((it) => it.id === "hat/cap")));
  assert.ok(!isOn(s, ITEMS.find((it) => it.id === "hat/beanie")));
  assert.equal(pocketOf("nonsense"), "wear");
  const worn = wearing(s);
  assert.deepEqual(worn.map((w) => w.slot), Object.keys(SLOTS), "one cell for every kind, in order");
  assert.equal(worn[0].item.id, "hat/cap");
  assert.ok(worn.slice(1).every((w) => w.item === null));
  const empty = hatched(7);
  assert.deepEqual(pocketBlocks(empty, "wear"), [], "an empty bag has no blocks");
  assert.deepEqual(pocketCounts(empty), { wear: 0, decor: 0, moves: 0 });
  assert.ok(MOVES.filter((m) => !m.price).every((m) => !pocketBlocks({ ...s, attacks: [m.id] }, "moves").length), "only bought moves are in the bag");
});

test("supplies sit in blocks by what they are for, every one of them exactly once", () => {
  const blocks = supplyBlocks();
  const ids = blocks.flatMap((b) => b.items.map((s) => s.id));
  assert.deepEqual([...ids].sort(), SUPPLIES.map((s) => s.id).sort());
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(blocks.map((b) => b.id), ["battle", "grow", "garden"]);
});

test("the garden screen: its numbers, and a row for every plot (closed, empty or built)", () => {
  const s = hatched();
  const g = garden(s);
  g.glow = 500;
  g.plots[0] = { open: true, id: "word_sprout", tier: 2, stored: 12.7 };
  g.plots[1] = { open: true, id: null, tier: 0, stored: 0 };
  g.plots[2] = { open: true, id: "word_sprout", tier: 3, stored: 0 };
  s.items.key = 1;
  s.stats.goals = 3;
  const f = gardenFacts(s, T0);
  assert.equal(f.glow, 500);
  assert.equal(f.waiting, 12);
  assert.equal(f.open, 3);
  assert.equal(f.plots, PLOTS.length);
  assert.equal(f.goalsLeft, 7);
  assert.equal(f.auto, false);
  const rows = plotRows(s, T0);
  assert.deepEqual(rows.map((r) => r.kind), ["built", "empty", "built", "closed", "closed", "closed"]);
  assert.equal(rows[0].cost, costOf(s, 0));
  assert.equal(rows[0].can, 500 >= rows[0].cost);
  assert.equal(rows[0].stored, 12);
  assert.equal(rows[2].cost, null, "fully grown: nothing more to grow");
  assert.equal(rows[3].key, true, "a key opens the first closed plot");
  assert.equal(rows[4].key, false);
  assert.equal(rows[3].need, PLOTS[3].need.text);
  s.items.key = 0;
  assert.equal(plotRows(s, T0)[3].key, false, "no key, no button");
});

test("what can be built: what each costs and makes, and what opens the ones not yet open", () => {
  const s = hatched();
  garden(s).glow = 100;
  const opts = buildOptions(s, 0);
  assert.deepEqual(opts.map((o) => o.id), STRUCTURES.map((x) => x.id));
  const sprout = opts.find((o) => o.id === "word_sprout");
  assert.equal(sprout.open, true);
  assert.equal(sprout.can, 100 >= sprout.cost);
  const loom = opts.find((o) => o.id === "star_loom");
  assert.equal(loom.open, false);
  assert.equal(loom.can, false);
  assert.ok(loom.need);
});

test("a release leaves the stardust the Release block shows", () => {
  const s = hatched();
  s.creature.growth = 1;
  s.creature.grown = true;
  const g = garden(s);
  g.plots[0] = { open: true, id: "word_sprout", tier: 3, stored: 0 };
  g.plots[1] = { open: true, id: "echo_shell", tier: 3, stored: 0 };
  const shown = stardustGain(s);
  assert.equal(shown, 2);
  const r = release(s, 0, () => 0.5);
  assert.equal(r.stardust, shown);
});
