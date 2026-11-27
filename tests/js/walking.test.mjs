// The creature's walk to a tapped spot (web/js/game/room.js findPath; the owner: "the creature likes to walk in place
// a lot near the area. It should just walk straight there and stop. That particularly seems to happen when walking up
// and down"). Each walk is played out as habitat.js roomWalk steps it (44 px a second at 60 frames a second): it must
// end within the frames its length allows, and never turn back on itself near the end.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ROOM, blockedCells, cellKey, findPath } from "../../web/js/game/room.js";
import { YARD_WALK, yardBlocked } from "../../web/js/game/yard.js";

const SPEED = 44, DT = 1 / 60;

/** Walk the path from `a` as roomWalk does; the frames it took and its positions. */
function play(a, path) {
  const p = { ...a }, way = path.map((q) => ({ ...q })), seen = [{ ...p }];
  let frames = 0;
  while (way.length && frames < 5000) {
    const q = way[0], dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy);
    if (d < 0.8) { way.shift(); continue; }
    const step = Math.min(d, SPEED * DT);
    p.x += (dx / d) * step; p.y += (dy / d) * step;
    frames++;
    seen.push({ ...p });
  }
  return { frames, seen, end: p };
}
/** The length of a path walked from `a`. */
const lengthOf = (a, path) => path.reduce((s, q, i) => s + Math.hypot(q.x - (i ? path[i - 1] : a).x, q.y - (i ? path[i - 1] : a).y), 0);

/** No step in the last 12 px goes back the way it came (towards where it was 12 px before the end). */
function noTurnBack(seen, end) {
  const near = seen.filter((q) => Math.hypot(q.x - end.x, q.y - end.y) <= 12);
  for (let i = 1; i < near.length; i++) {
    const before = Math.hypot(near[i - 1].x - end.x, near[i - 1].y - end.y), after = Math.hypot(near[i].x - end.x, near[i].y - end.y);
    if (after > before + 1e-6) return false;
  }
  return true;
}

test("on an open floor a walk is one straight line, up, down, across or slanting, and it stops where tapped", () => {
  const A = ROOM.walk, none = new Set();
  const mid = { x: (A.x0 + A.x1) / 2, y: (A.y0 + A.y1) / 2 };
  for (const [dx, dy] of [[0, 17], [0, -17], [0, 9], [0, -4], [23, 0], [-31, 5], [13, -11], [2, 1], [-1, 14]]) {
    const b = { x: mid.x + dx, y: Math.max(A.y0, Math.min(A.y1, mid.y + dy)) };
    for (const off of [0, 1.3, 2.7, -2.2]) { // (from off the grid's points: the old path started and ended on them)
      const a = { x: mid.x + off, y: mid.y - off };
      const path = findPath(a, b, none, A);
      assert.equal(path.length, 1, `straight to ${dx},${dy}`);
      const { frames, seen, end } = play(a, path);
      assert.ok(Math.hypot(end.x - b.x, end.y - b.y) < 0.8, "it ends on the spot");
      assert.ok(frames <= Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (SPEED * DT)) + 1, `${dx},${dy}: in as many frames as its length takes`);
      assert.ok(noTurnBack(seen, b), `${dx},${dy}: never turns back near the end`);
    }
  }
});

test("round the furniture and through the village, walks still end on time and never turn back near the end", () => {
  const roomBlocked = blockedCells([{ id: "a", x: 120, y: 120 }, { id: "b", x: 200, y: 108 }], () => 40, ROOM.walk);
  const yardB = yardBlocked((p) => cellKey(p, YARD_WALK));
  const cases = [
    [ROOM.walk, roomBlocked, { x: 90, y: 110 }, { x: 150, y: 124 }],
    [ROOM.walk, roomBlocked, { x: 120, y: 100 }, { x: 121, y: 130 }],
    [ROOM.walk, roomBlocked, { x: 200, y: 92 }, { x: 203, y: 125 }],
    [YARD_WALK, yardB, { x: 60, y: 100 }, { x: 60, y: 130 }],
    [YARD_WALK, yardB, { x: 60, y: 130 }, { x: 64, y: 96 }],
    [YARD_WALK, yardB, { x: 100, y: 120 }, { x: 420, y: 118 }],
    [YARD_WALK, yardB, { x: 300, y: 128 }, { x: 302, y: 104 }],
  ];
  for (const [A, blocked, a, b] of cases) {
    if (blocked.has(cellKey(a, A))) continue; // (a start inside something: not a walk anyone can make)
    const path = findPath(a, b, blocked, A);
    const { frames, seen, end } = play(a, path);
    const goal = path[path.length - 1];
    assert.ok(Math.hypot(end.x - goal.x, end.y - goal.y) < 0.8);
    assert.ok(frames <= Math.ceil(lengthOf(a, path) / (SPEED * DT)) + path.length, `${a.x},${a.y} -> ${b.x},${b.y}: on time`);
    assert.ok(noTurnBack(seen, goal), `${a.x},${a.y} -> ${b.x},${b.y}: no turning back near the end`);
  }
});

test("the creature faces the way it walks across, and keeps facing that way when it walks up or down", async () => {
  const { readFileSync } = await import("node:fs");
  const h = readFileSync(new URL("../../web/js/game/habitat.js", import.meta.url), "utf8");
  assert.match(h, /Math\.abs\(dx\) > 2 \|\| \(Math\.abs\(dx\) > 0\.4 && Math\.abs\(dx\) >= Math\.abs\(dy\)\)/);
});
