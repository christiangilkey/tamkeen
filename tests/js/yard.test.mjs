// The yard outside the creature's cottage (prototype "habitat_room", web/js/game/yard.js; drawn by habitat.js): seen
// from above like the battle arenas, the creature walking anywhere on the field and in at the cottage's door.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DECALS, PROPS, TERRAIN, drawCorners } from "../../web/js/game/battlemap.js";
import { cellKey, findPath } from "../../web/js/game/room.js";
import { COTTAGE, YARD_COLS, YARD_DOOR_SPOT, YARD_ROWS, YARD_WALK, tapYard, yardBlocked, yardMap } from "../../web/js/game/yard.js";

const key = (p) => cellKey(p, YARD_WALK);

test("the yard is one battle-map field the size of the habitat window, made of the arenas' own terrain and props", () => {
  const m = yardMap();
  assert.deepEqual([m.cols, m.rows, YARD_COLS, YARD_ROWS], [20, 9, 20, 9]);
  assert.equal(m.tiles.length, 20 * 9);
  for (const t of m.tiles) assert.ok(TERRAIN[t], `${t} is a terrain`);
  for (const p of m.props) assert.ok(PROPS[p.id], `${p.id} is a prop`);
  for (const d of m.decals) assert.ok(DECALS[d.id], `${d.id} is a decal`);
  assert.equal(m.roofs[0].style, "thatch");
  // the battle drawing works on it: every dual-grid cell starts with the grass
  for (let cy = 0; cy <= m.rows; cy++) for (let cx = 0; cx <= m.cols; cx++) assert.equal(drawCorners(m, cx, cy)[0].terrain, "grass");
  // the cottage's door is a gap in its front wall
  assert.equal(m.tiles[COTTAGE.door.ty * 20 + COTTAGE.door.tx], "wood_floor");
  assert.equal(m.tiles[COTTAGE.door.ty * 20 + COTTAGE.door.tx - 1], "house_wall");
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
  assert.match(h, /if \(outside\(\)\) drawYard\(\);/);
  assert.match(h, /else if \(inRoom\(\)\) drawHills\(hour\);/);
  assert.doesNotMatch(h, /YARD_DOOR\b/);
});
