// The creature's room (prototype "habitat_room", web/js/game/room.js; drawn by habitat.js): Home's habitat window is a
// room the creature walks about in, indoor decorations inside and everything else outside its door.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { DECOR } from "../../web/js/game/data.js";
import { INDOOR, PLANTED, ROOM, YARD_DOOR, blockedCells, depthScale, findPath, freeSpot, isIndoor, placeOf, roomLayout, tapIn } from "../../web/js/game/room.js";
import { PROTOTYPES } from "../../web/js/prototype.js";

/** A PNG's size and the alpha at a pixel (8-bit RGBA or RGB, as Aseprite saves them; same reader as feats.test.mjs). */
function PNG(url) {
  const buf = readFileSync(url);
  let pos = 8, w = 0, h = 0, type = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), kind = buf.toString("ascii", pos + 4, pos + 8), data = buf.subarray(pos + 8, pos + 8 + len);
    if (kind === "IHDR") { w = data.readUInt32BE(0); h = data.readUInt32BE(4); type = data[9]; }
    else if (kind === "IDAT") idat.push(data);
    pos += 12 + len;
  }
  const ch = type === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * ch, rows = [], prev = new Uint8Array(stride);
  for (let y = 0; y < h; y++) {
    const row = new Uint8Array(stride), f = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const v = raw[y * (stride + 1) + 1 + x], a = x >= ch ? row[x - ch] : 0, b = prev[x], c = x >= ch ? prev[x - ch] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      row[x] = (v + [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][f]) & 255;
    }
    rows.push(row);
    prev.set(row);
  }
  return { width: w, height: h, alpha: (x, y) => (ch === 4 ? rows[y][x * 4 + 3] : 255) };
}
const src = (f) => readFileSync(new URL(`../../web/js/game/${f}`, import.meta.url), "utf8");

test("the room behind its feature switch (released in v0.76.0)", () => {
  assert.ok(PROTOTYPES.habitat_room);
  const h = src("habitat.js");
  assert.match(h, /const roomOn = \(\) => feature\("habitat_room"\)/);
  assert.match(h, /const inRoom = \(\) => roomOn\(\) && view === "room"/);
});

test("every decoration is indoor, outdoor or planted (the owner's list)", () => {
  const ids = DECOR.map((d) => d.id.replace("decor/", ""));
  for (const id of [...INDOOR, ...PLANTED]) assert.ok(ids.includes(id), `${id} is a decoration`);
  const count = { indoor: 0, outdoor: 0, planted: 0 };
  for (const d of DECOR) count[placeOf(d.id)]++;
  assert.deepEqual(count, { indoor: 7, outdoor: 11, planted: 6 });
  assert.equal(placeOf("decor/bed"), "indoor");
  assert.equal(placeOf("decor/fountain"), "outdoor");
  assert.equal(placeOf("decor/tree_fruit"), "planted");
});

test("only indoor decorations stand in the room, each on its own spot on the floor", () => {
  const decor = ["decor/bed", "decor/fountain", "decor/radio", "decor/flower_red", "decor/toy_ball"].map((id, i) => ({ id, x: 20 * i }));
  const lay = roomLayout(decor);
  assert.deepEqual(lay.map((d) => d.id), ["decor/bed", "decor/radio", "decor/toy_ball"]);
  assert.ok(lay.every((d) => isIndoor(d.id)));
  assert.equal(new Set(lay.map((d) => `${d.x},${d.y}`)).size, lay.length);
  for (const d of lay) {
    assert.ok(d.y >= ROOM.walk.y0 - 2 && d.y <= ROOM.walk.y1 + 2, `${d.id} stands on the floor`);
    assert.ok(Math.abs(d.x - ROOM.doorSpot.x) > 30, `${d.id} isn't in front of the door`);
  }
  assert.deepEqual(roomLayout(null), []);
});

test("the creature walks round furniture and ends where it was asked to go", () => {
  const furniture = [{ id: "decor/bookshelf", x: 160, y: 118 }];
  const blocked = blockedCells(furniture, () => 32);
  assert.ok(blocked.size > 0);
  const from = { x: 120, y: 116 }, to = { x: 200, y: 116 };
  const path = findPath(from, to, blocked);
  assert.deepEqual(path.at(-1), to);
  // no step of the way goes through the bookshelf's squares
  let at = from;
  for (const p of path) {
    for (let k = 0; k <= 20; k++) {
      const x = at.x + ((p.x - at.x) * k) / 20, y = at.y + ((p.y - at.y) * k) / 20;
      assert.ok(!(Math.abs(x - 160) < 12 && y <= 118 && y >= 110), `(${x.toFixed(0)}, ${y.toFixed(0)}) is through the bookshelf`);
    }
    at = p;
  }
  // a spot under furniture moves to the nearest free one
  const s = freeSpot({ x: 160, y: 116 }, blocked);
  assert.ok(!blocked.has(`${Math.round((s.x - ROOM.walk.x0) / 6)},${Math.round((s.y - ROOM.walk.y0) / 6)}`));
  // nothing in the way: straight there
  assert.deepEqual(findPath({ x: 40, y: 100 }, { x: 80, y: 100 }, new Set()), [{ x: 80, y: 100 }]);
});

test("taps: the door, the floor, the wall; nearer the front it is drawn bigger", () => {
  assert.equal(tapIn(280, 50), "door");
  assert.equal(tapIn(100, 120), "floor");
  assert.equal(tapIn(100, 40), "wall");
  assert.equal(depthScale(ROOM.walk.y1), 1);
  assert.equal(depthScale(ROOM.walk.y0), ROOM.backScale);
  assert.ok(depthScale(116) > ROOM.backScale && depthScale(116) < 1);
});

test("the room's art matches the numbers the game uses", () => {
  const png = (f) => PNG(new URL(`../../web/game-art/room/${f}`, import.meta.url));
  const room = png("room.png");
  assert.deepEqual([room.width, room.height], [320, 144]);
  const d = ROOM.door;
  for (const f of ["door.png", "door_open.png"]) {
    const im = png(f);
    assert.deepEqual([im.width, im.height], [d.x1 - d.x0 + 1, d.y1 - d.y0 + 1], f);
  }
  assert.equal(YARD_DOOR.w, d.x1 - d.x0 + 1);
  assert.equal(YARD_DOOR.h, d.y1 - d.y0 + 1);
  // the window's glass and the doorway are see-through (the habitat's view outside shows through them)
  assert.equal(room.alpha(ROOM.window.x0 + 10, ROOM.window.y0 + 10), 0);
  assert.equal(room.alpha(d.x0 + 10, d.y0 + 30), 0);
  assert.equal(room.alpha(20, 120), 255, "the floor is solid");
});

test("the owner's taps: a door goes straight through; outside, a tap on the creature walks it (no boxes)", () => {
  const h = readFileSync(new URL("../../web/js/game/habitat.js", import.meta.url), "utf8");
  assert.ok(h.includes('if (inRoom() && !pressed && tapIn(x, y) === "door") { sfx("tick"); goThrough("yard"); return; }'));
  assert.ok(h.includes('if (inYard() && !pressed && tapYard(x, y) === "door") { sfx("tick"); goThrough("room"); return; }'));
  assert.ok(h.includes("if (pressed || (!outside() && Math.abs(x - cx) < 30)) {"), "no pat (word, name box) outside");
  assert.ok(!h.includes("goalBox(); return; }"), "no goal box from a tap in the scene, anywhere: the goal is a chip below the window");
  assert.ok(h.includes('<div class="hud-top">') && h.includes('id="g-goal"'), "the goal chip beside the level bar");
  assert.ok(h.includes("under.id === pressedMuffle"), "a Muffle answers only a press that began on it");
  for (const f of ["fire", "sky_sun", "sky_moon", "sky_cloud_1", "sky_cloud_2"]) assert.ok(h.includes(f.startsWith("sky") ? `room/sky_` : "room/fire.png"), f);
});

test("the big tiles send the creature to their place in the village (or home)", () => {
  const h = readFileSync(new URL("../../web/js/game/habitat.js", import.meta.url), "utf8");
  for (const [tile, spot] of [["shop", "cloth"], ["creatures", "room"], ["garden", "fruit"], ["battle", "hall"], ["fishing", "pier"]]) {
    const line = h.split(/\r?\n/).find((l) => l.includes(`$("#g-${tile}").onclick = `)) || "";
    assert.ok(line.includes(`teleportTo("${spot}")`) || line.includes(`: "${spot}")`), tile); // (Garden: the farm with prototype "farm", else the fruit stall)
  }
});

test("the weather falls on everything outside alike: the night's tint and the rain's grey sky come after every building, prop, Muffle and the creature", () => {
  const h = src("habitat.js");
  const front = h.indexOf("for (const it of yardItems) if (it.y > feet) it.draw();");
  assert.ok(front > 0);
  for (const step of ["if (dark && outside()) { ctx.fillStyle", "if (outside() && !inHall() && rainy()) {", "if (outside() && !inHall() && rainy() && art.rain) {"])
    assert.ok(h.indexOf(step) > front, `after everything on the field: ${step}`);
  assert.ok(h.indexOf("if (outside() && !inHall() && rainy() && art.rain) {") > h.indexOf("nightLights(dark); //"), "the rain over the lamps' glow too");
});
