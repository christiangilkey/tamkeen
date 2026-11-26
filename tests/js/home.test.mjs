// Carrying decorations (prototype "habitat_room", slice 2; web/js/game/home.js, drawn and walked by habitat.js): tap a
// decoration, "Move it", tap where: the creature fetches it, carries it over its head and puts it down there. Now and
// then it moves a small thing by itself. Where each one stands syncs; the later layout wins (game_merge.json).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SMALL, homeOf, isSmall, joinHome, putAway, setSpot, spotOf } from "../../web/js/game/home.js";
import { ROOM, isIndoor, roomLayout } from "../../web/js/game/room.js";
import { YARD_WALK, decorSpot } from "../../web/js/game/yard.js";

test("a decoration put down keeps its spot; put away, it leaves the habitat and its spot is forgotten", () => {
  const s = { owned: ["decor/bed", "decor/radio"], decor: [{ id: "decor/bed", x: 40 }, { id: "decor/radio", x: 90 }], roster: [{ seed: 1 }] };
  assert.equal(spotOf(s, "decor/bed"), null);
  setSpot(s, "decor/bed", { x: 200.4, y: 120.6 }, 5000_000);
  assert.deepEqual(spotOf(s, "decor/bed"), { x: 200, y: 121 });
  assert.equal(homeOf(s).at, 5000);
  putAway(s, "decor/bed", 6000_000);
  assert.deepEqual(s.decor.map((d) => d.id), ["decor/radio"]);
  assert.equal(spotOf(s, "decor/bed"), null);
  assert.equal(homeOf(s).at, 6000);
  assert.equal(homeOf({ home: "odd" }).at, 0, "an odd layout is made whole");
});

test("the room and the yard stand things where they were put, kept on the floor and the field", () => {
  const decor = [{ id: "decor/bed", x: 10 }, { id: "decor/radio", x: 20 }];
  const lay = roomLayout(decor, { "decor/radio": { x: 999, y: 2 } });
  const radio = lay.find((d) => d.id === "decor/radio");
  assert.deepEqual([radio.x, radio.y], [ROOM.walk.x1, ROOM.walk.y0], "kept on the floor");
  assert.notDeepEqual(lay.find((d) => d.id === "decor/bed"), radio);
  assert.deepEqual(roomLayout(decor), roomLayout(decor, {}), "no spots: as before");
  assert.deepEqual(decorSpot(50, 0, { x: 140, y: 100 }), { x: 140, y: 100 });
  assert.deepEqual(decorSpot(50, 1), { x: 50, y: 112 });
  assert.ok(decorSpot(50, 0, { x: 140, y: 0 }).y >= YARD_WALK.y0 + 30, "not up in the cottage's roof");
});

test("two copies: the layout changed later is kept whole", () => {
  const a = { at: 100, spots: { x: { x: 1, y: 2 } } }, b = { at: 200, spots: {} };
  assert.equal(joinHome(a, b), b);
  assert.equal(joinHome(b, a), b);
  assert.equal(joinHome(a, undefined), a);
});

test("the small things it moves by itself are indoor ones", () => {
  for (const id of SMALL) assert.ok(isIndoor(id), id);
  assert.ok(isSmall("decor/toy_ball"));
  assert.ok(!isSmall("decor/bed"));
});

test("habitat.js: a tap on a decoration opens Move it / Put away; it fetches, carries and puts down", () => {
  const h = readFileSync(new URL("../../web/js/game/habitat.js", import.meta.url), "utf8");
  assert.match(h, /if \(piece\) \{ decorMenu\(piece\); return; \}/);
  assert.match(h, /button\(t\("Move it"\), !use/);
  assert.match(h, /button\(t\("Put away"\), false/);
  assert.match(h, /pet\.after === "pickup" && carry\) \{ carry\.held = true;/);
  assert.match(h, /setSpot\(game, carry\.id, carry\.to\);/);
  assert.match(h, /inRoom\(\) && !carry && Math\.random\(\) < 0\.12/);
});

test("using things (slice 4): a nap on the bed, a meal from the bowl, the ball kicked; the aquarium indoors; the mailbox", () => {
  const h = readFileSync(new URL("../../web/js/game/habitat.js", import.meta.url), "utf8");
  assert.ok(h.includes('const use = { bed: "Nap", food_bowl: "Eat", toy_ball: "Play" }'));
  assert.ok(h.includes("pet.napUntil = performance.now() + 20000;"));
  assert.ok(h.includes("const why = feedBest(game, game.creature);"), "the bowl feeds as Supplies does (a real meal, food used up)");
  assert.ok(h.includes("rolling = { id: thing.id, from:"), "the ball rolls to its new spot");
  assert.ok(h.includes('const roomTank = () => (fishingOf(game).caught > 0 ? [{ id: "tank"'), "the aquarium stands in the room");
  assert.ok(h.includes('if (th.kind === "gift") continue; // (in the mailbox)'), "gifts come in the mailbox, not on the grass");
  assert.ok(h.includes('walkTo({ x: MAILBOX.x + 12, y: MAILBOX.y + 6 }, "use:mail")'));
  // nothing here pays: no coins, gems, glow or XP handed out by using things
  const use = h.slice(h.indexOf("function useThing(what)"), h.indexOf("/** What a station in the village opens"));
  assert.doesNotMatch(use, /coins|gems|\.glow|xp|earn\(/i);
});
