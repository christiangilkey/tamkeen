// The yard outside the creature's cottage (prototype "habitat_room", web/js/game/yard.js; drawn by habitat.js): seen
// from above like the battle arenas, the creature walking anywhere on the field and in at the cottage's door.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { DECALS, PROPS, TERRAIN, drawCorners } from "../../web/js/game/battlemap.js";
import { cellKey, findPath } from "../../web/js/game/room.js";
import { COTTAGE, STATIONS, WORLD_COLS, YARD_COLS, YARD_DOOR_SPOT, YARD_ROWS, YARD_WALK, cameraFor, stationAt, tapYard, yardBlocked, yardMap } from "../../web/js/game/yard.js";

const key = (p) => cellKey(p, YARD_WALK);

test("the yard and the village are one battle-map field, the window a camera on it, made of the arenas' own terrain and props", () => {
  const m = yardMap();
  assert.deepEqual([m.cols, m.rows, YARD_COLS, YARD_ROWS, WORLD_COLS], [56, 9, 20, 9, 56]);
  assert.equal(m.tiles.length, 56 * 9);
  assert.equal(m.roofs.length, 3, "the cottage, the tavern, the championship hall");
  assert.equal(cameraFor(0), 0);
  assert.equal(cameraFor(5000), m.width - 320);
  for (const t of m.tiles) assert.ok(TERRAIN[t], `${t} is a terrain`);
  for (const p of m.props) assert.ok(PROPS[p.id], `${p.id} is a prop`);
  for (const d of m.decals) assert.ok(DECALS[d.id], `${d.id} is a decal`);
  assert.equal(m.roofs[0].style, "thatch");
  // the battle drawing works on it: every dual-grid cell starts with the grass
  for (let cy = 0; cy <= m.rows; cy++) for (let cx = 0; cx <= m.cols; cx++) assert.equal(drawCorners(m, cx, cy)[0].terrain, "grass");
  // the cottage's door is a gap in its front wall
  assert.equal(m.tiles[COTTAGE.door.ty * 56 + COTTAGE.door.tx], "wood_floor");
  assert.equal(m.tiles[COTTAGE.door.ty * 56 + COTTAGE.door.tx - 1], "house_wall");
});

test("the creature walks round the cottage, the pond and the trees, and reaches the door from anywhere", () => {
  const blocked = yardBlocked(key);
  assert.ok(!blocked.has(key(YARD_DOOR_SPOT)), "it can stand at the door");
  assert.ok(blocked.has(key({ x: 60, y: 36 })), "not inside the cottage");
  assert.ok(blocked.has(key({ x: 280, y: 24 })), "not in the deep water");
  for (const from of [{ x: 300, y: 130 }, { x: 160, y: 60 }, { x: 20, y: 130 }]) {
    const path = findPath(from, YARD_DOOR_SPOT, blocked, YARD_WALK);
    assert.deepEqual(path.at(-1), YARD_DOOR_SPOT);
    let at = from;
    for (const p of path) {
      for (let k = 0; k <= 10; k++) {
        const x = at.x + ((p.x - at.x) * k) / 10, y = at.y + ((p.y - at.y) * k) / 10;
        const tx = Math.floor(x / 16), ty = Math.floor(y / 16);
        const inHouse = tx >= COTTAGE.x0 && tx < COTTAGE.x0 + COTTAGE.w && ty >= COTTAGE.y0 && ty < COTTAGE.y0 + COTTAGE.h;
        assert.ok(!inHouse, `(${x.toFixed(0)}, ${y.toFixed(0)}) is through the cottage`);
      }
      at = p;
    }
  }
});

test("taps outside: the cottage's door, or the ground to walk to", () => {
  assert.equal(tapYard(YARD_DOOR_SPOT.x, 58), "door");
  assert.equal(tapYard(200, 110), "ground");
  assert.equal(tapYard(YARD_DOOR_SPOT.x + 50, 58), "ground");
});

test("habitat.js: the yard only with the prototype, outside the door; no neon city behind the room's window", () => {
  const h = readFileSync(new URL("../../web/js/game/habitat.js", import.meta.url), "utf8");
  assert.match(h, /const outside = \(\) => roomOn\(\) && view !== "room"/);
  assert.match(h, /if \(outside\(\)\) drawYard\(now\);/);
  assert.match(h, /else if \(inRoom\(\)\) drawHills\(hour\);/);
  assert.doesNotMatch(h, /YARD_DOOR\b/);
});

test("smaller creatures outside and in battles, drawn crisp (whole screen pixels per pixel), only as prototypes", async () => {
  const h = readFileSync(new URL("../../web/js/game/habitat.js", import.meta.url), "utf8");
  assert.match(h, /const RES = feature\("habitat_room"\) \? 3 : 1;/);
  assert.match(h, /const creatureScale = \(\) => \(RES === 3 && outside\(\) \? 2 \/ 3 : 1\);/);
  const lb = readFileSync(new URL("../../web/js/game/livebattle-ui.js", import.meta.url), "utf8");
  assert.match(lb, /const SMALL = feature\("small_battlers"\);/);
  assert.match(lb, /Math\.max\(1, Math\.round\(\(viewport\.s \|\| 1\) \* 2 \/ 3\)\) \/ \(viewport\.s \|\| 1\)/);
  // only the drawing: the battle engine knows nothing of it
  assert.doesNotMatch(readFileSync(new URL("../../web/js/game/livebattle.js", import.meta.url), "utf8"), /small_battlers/);
  const { PROTOTYPES } = await import("../../web/js/prototype.js");
  assert.equal(PROTOTYPES.small_battlers.released, false);
});

test("the village's stations: each can be walked to from the cottage's door, and a tap finds it", () => {
  const blocked = yardBlocked(key);
  assert.deepEqual(STATIONS.map((s) => s.opens), ["garden", "shop", "supplies", "mine", "tavern", "gyms", "pond"]);
  for (const st of STATIONS) {
    assert.ok(!blocked.has(key(st)), `${st.id}: it can stand there`);
    const path = findPath(YARD_DOOR_SPOT, st, blocked, YARD_WALK);
    assert.deepEqual(path.at(-1), { x: st.x, y: st.y }, `${st.id} is reached`);
    assert.equal(stationAt((st.rect[0] + st.rect[2]) / 2, (st.rect[1] + st.rect[3]) / 2), st);
  }
  assert.equal(stationAt(160, 110), null, "the yard has none");
  const h = readFileSync(new URL("../../web/js/game/habitat.js", import.meta.url), "utf8");
  assert.ok(h.includes("walkTo({ x: st.x, y: st.y }, `go:${st.id}`)"), "a tap on a station walks it there");
  assert.ok(h.includes("ctx.translate(-cam(), 0);"), "the camera follows it along the field");
});

test("the water moves: its cells drawn every frame from the terrain's _anim sheets, only where the window shows", () => {
  const h = readFileSync(new URL("../../web/js/game/habitat.js", import.meta.url), "utf8");
  assert.ok(h.includes('const k = layers.findIndex((l) => SHEETS[l.terrain] && SHEETS[l.terrain].anim);'));
  assert.ok(h.includes('.replace(".png", "_anim.png")'));
  assert.ok(h.includes("if (c.x + TILE < left || c.x > left + W) continue;"));
  for (const t of ["shallows", "deep_water"]) {
    for (const f of [`${t}_anim.png`, `${t}_fill_anim.png`]) assert.ok(existsSync(new URL(`../../web/game-art/battle/terrain/${f}`, import.meta.url)), f);
  }
});
