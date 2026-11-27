// The squircle outline web/js/squircle.js cuts elements to where the browser can't draw squircles (Safari).
import { test } from "node:test";
import assert from "node:assert/strict";
import { squirclePath } from "../../web/js/squircle.js";

const points = (d) => d.replace(/^M|Z$/g, "").split("L").map((p) => p.split(" ").map(Number));

test("the outline stays inside the box and closes", () => {
  const d = squirclePath(120, 44, [10, 10, 10, 10]);
  assert.match(d, /^M.*Z$/);
  for (const [x, y] of points(d)) {
    assert.ok(x >= 0 && x <= 120 && y >= 0 && y <= 44, `${x},${y} outside`);
  }
});

test("it runs clockwise, corner by corner", () => {
  const pts = points(squirclePath(100, 50, [10, 10, 10, 10]));
  const quarter = pts.length / 4;
  const mid = (i) => pts[Math.floor(i * quarter + quarter / 2)];
  const [tl, tr, br, bl] = [mid(0), mid(1), mid(2), mid(3)];
  assert.ok(tl[0] < 50 && tl[1] < 25 && tr[0] > 50 && tr[1] < 25 && br[0] > 50 && br[1] > 25 && bl[0] < 50 && bl[1] > 25);
  // (the signed area of a clockwise outline with y pointing down is positive)
  let area = 0;
  for (let i = 0; i < pts.length; i++) { const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length]; area += x1 * y2 - x2 * y1; }
  assert.ok(area > 0);
});

test("a squircle corner is squarer than a round one", () => {
  // Halfway round the corner, a circle of radius 10 is 2.93px in from the corner on each side; a squircle is closer.
  const pts = points(squirclePath(100, 100, [10, 10, 10, 10]));
  const nearest = Math.min(...pts.slice(0, 13).map(([x, y]) => Math.hypot(x, y)));
  assert.ok(nearest < Math.hypot(2.93, 2.93), `nearest ${nearest}`);
  assert.ok(nearest > 1);
});

test("square corners and the token radii; a radius never passes half the box", () => {
  const sheet = points(squirclePath(390, 300, [20, 20, 0, 0]));
  assert.ok(sheet.some(([x, y]) => x === 390 && y === 300) && sheet.some(([x, y]) => x === 0 && y === 300));
  const small = points(squirclePath(16, 16, [20, 20, 20, 20]));
  for (const [x, y] of small) assert.ok(x >= 0 && x <= 16 && y >= 0 && y <= 16);
});

test("an inset outline (for a border drawn inside the shape) sits inside the outline", () => {
  const inner = points(squirclePath(100, 40, [10, 10, 10, 10], 1));
  for (const [x, y] of inner) assert.ok(x >= 1 && x <= 99 && y >= 1 && y <= 39);
});

test("every version loads it: both app shells start it and the phone/web build copies it", async () => {
  const { readFileSync } = await import("node:fs");
  const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
  assert.match(read("web/js/app.js"), /startSquircles\(\)/);
  assert.match(read("mobile/src/js/app.js"), /startSquircles\(\)/);
  assert.ok(read("mobile/scripts/build-www.mjs").includes('"js/squircle.js"'));
  assert.match(read("web/css/app.css"), /@supports \(corner-shape: squircle\)/);
});
