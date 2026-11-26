// Inside the championship hall, and the market's busy Muffles (prototype "habitat_room"; the owner, 2026-11-26: "give
// the gym building an interior, a gym custodian at a counter who you walk up to and that where you register to fight the
// gym leaders", and "the market should be more alive, with muffles eating things on benches, cooking things, playing
// music (not audible to player), dancing, give the muffles sideways and backwards walking sprites too").
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { COUNTER_SPOT, HALL_COLS, HALL_DOOR_SPOT, HALL_WALK, hallBlocked, hallMap, tapHall } from "../../web/js/game/hall.js";
import { PROPS } from "../../web/js/game/battlemap.js";
import { cellKey, findPath } from "../../web/js/game/room.js";
import { FOLK, POSE, poseOf } from "../../web/js/game/muffles.js";

/** A PNG's width and height (the IHDR chunk). */
const sizeOf = (url) => { const b = readFileSync(url); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
const art = (f) => new URL(`../../web/game-art/${f}`, import.meta.url);

test("the hall is a battle map one window wide: its tiles, its props (all real ones), no roof", () => {
  const m = hallMap();
  assert.equal(m.cols, HALL_COLS);
  assert.equal(m.tiles.length, m.cols * m.rows);
  assert.deepEqual(m.roofs, []);
  for (const p of m.props) assert.ok(PROPS[p.id], p.id);
  assert.ok(m.props.some((p) => p.id === "counter"), "the custodian's counter");
});

test("from the door to the counter: a way round everything, both spots free", () => {
  const blocked = hallBlocked((p) => cellKey(p, HALL_WALK));
  assert.ok(!blocked.has(cellKey(HALL_DOOR_SPOT, HALL_WALK)), "just inside the door");
  assert.ok(!blocked.has(cellKey(COUNTER_SPOT, HALL_WALK)), "in front of the counter");
  const path = findPath(HALL_DOOR_SPOT, COUNTER_SPOT, blocked, HALL_WALK);
  const end = path[path.length - 1];
  assert.ok(Math.hypot(end.x - COUNTER_SPOT.x, end.y - COUNTER_SPOT.y) < 1, "it gets there");
});

test("a tap inside: the door goes out, the counter (or the custodian over it) signs up, the floor is walked on", () => {
  assert.equal(tapHall(HALL_DOOR_SPOT.x, 140), "door");
  assert.equal(tapHall(COUNTER_SPOT.x, 50), "counter");
  assert.equal(tapHall(60, 110), "floor");
  const c = FOLK.find((f) => f.id === "custodian");
  assert.equal(c.scene, "hall");
  assert.equal(tapHall(c.x, c.y - 6), "counter");
});

test("every Muffle's picture is a strip of all its frames: walking three ways, eating, cooking, playing, dancing", () => {
  const frames = Math.max(...Object.values(POSE).flat()) + 1;
  for (const f of FOLK) assert.deepEqual(sizeOf(art(`muffle/${f.id}.png`)), [40 * frames, 40], f.id);
  assert.deepEqual(sizeOf(art("muffle/pot.png")), [48, 24], "the cook's pot, two frames");
  for (const act of ["eat", "cook", "lute", "dance"]) assert.ok(FOLK.some((f) => f.act === act), act);
});

test("poseOf: busy ones loop their two frames; walkers face the way they go; the rest stand facing you", () => {
  const cook = { act: "cook" };
  assert.notEqual(poseOf(cook, 0).frame, poseOf(cook, 400).frame);
  assert.ok(POSE.cook.includes(poseOf(cook, 0).frame));
  const w = {};
  assert.equal(poseOf(w, 0, { dx: -3, dy: 0.5 }).dir, -1);
  assert.ok(POSE.sideWalk.includes(poseOf(w, 0, { dx: -3, dy: 0.5 }).frame), "side on, going left");
  assert.ok(POSE.backWalk.includes(poseOf(w, 0, { dx: 0.2, dy: -2 }).frame), "away, going up the field");
  assert.ok(POSE.frontWalk.includes(poseOf(w, 0, { dx: 0, dy: 2 }).frame), "towards you, coming down");
  assert.equal(poseOf(w, 0, null).frame, POSE.front);
  const dances = new Set(Array.from({ length: 8 }, (_, i) => poseOf({ act: "dance" }, i * 420).dir));
  assert.ok(dances.has(-1) && dances.has(1), "it turns as it dances");
});

test("habitat.js: the hall's door from the village, the register at the counter, no rain indoors", () => {
  const h = readFileSync(new URL("../../web/js/game/habitat.js", import.meta.url), "utf8");
  assert.ok(h.includes('else if (st.opens === "gyms" && roomOn()) goThrough("hall");'));
  assert.ok(h.includes('if (w === "counter") { if (isEgg()) useThing("register"); else walkTo(COUNTER_SPOT, "use:register"); return; }'));
  assert.ok(h.includes('import("./gyms-ui.js").then((m) => m.openGyms())'));
  assert.ok(h.includes("rainy() && !inHall()"));
});
