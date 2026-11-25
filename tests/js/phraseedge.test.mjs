// Run with: node --test tests/js/
// Looking up several words: a hold or a drag that reaches the top or bottom edge of the words' box scrolls it slowly
// that way, and the phrase keeps growing as the text moves (web/js/components/phrasepick.js; the owner, 2026-11-25).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const picker = read("web/js/components/phrasepick.js");

// phrasepick.js needs the app around it (buzz from app.js), so its pure part is taken out and run on its own.
const piece = (start) => {
  const from = picker.indexOf(start);
  assert.ok(from >= 0, start);
  return picker.slice(from, picker.indexOf("\n}\n", from) + 3);
};
const consts = picker.split("\n").filter((l) => /^export const (EDGE_PX|EDGE_SPEED) /.test(l)).join("\n");
const src = `${consts}\n${piece("export function edgeStep")}`;
const { edgeStep, EDGE_PX, EDGE_SPEED } = await import(`data:text/javascript,${encodeURIComponent(src)}`);

test("the edge: up near the top, down near the bottom, still in the middle; faster nearer the edge", () => {
  const top = 100, bottom = 700;
  assert.equal(edgeStep(400, top, bottom), 0, "the middle");
  assert.equal(edgeStep(top + EDGE_PX + 1, top, bottom), 0, "just outside the zone");
  assert.ok(edgeStep(top + EDGE_PX - 2, top, bottom) < 0, "near the top: up");
  assert.ok(edgeStep(bottom - EDGE_PX + 2, top, bottom) > 0, "near the bottom: down");
  const slow = edgeStep(bottom - EDGE_PX + 10, top, bottom);
  const fast = edgeStep(bottom - 2, top, bottom);
  assert.ok(fast > slow && slow >= 1, `faster nearer the edge (${slow} then ${fast})`);
  assert.equal(edgeStep(bottom + 200, top, bottom), EDGE_SPEED, "past the edge: full speed, no more");
  assert.equal(edgeStep(top - 200, top, bottom), -EDGE_SPEED);
  assert.ok(EDGE_SPEED <= 8, "slowly: a few hundred pixels a second at most");
});

test("a small box (a reel's two lines) has a small edge zone, so its middle never scrolls", () => {
  const top = 0, bottom = 80; // 80 px high: the zone is a quarter, 20 px
  assert.equal(edgeStep(40, top, bottom), 0);
  assert.equal(edgeStep(25, top, bottom), 0);
  assert.ok(edgeStep(10, top, bottom) < 0);
  assert.ok(edgeStep(70, top, bottom) > 0);
  assert.equal(edgeStep(50, 0, 0), 0, "no box, no scroll");
  assert.equal(edgeStep(NaN, 0, 500), 0);
});

test("the helper scrolls the words' own box on each frame while a hold or drag is at the edge, then stops", () => {
  assert.match(picker, /function edgeTick\(\)/);
  assert.match(picker, /requestAnimationFrame\(edgeTick\)/, "frame by frame, also while the pointer rests at the edge");
  assert.match(picker, /cancelAnimationFrame\(g\.raf\)/, "stopped when the gesture ends");
  assert.match(picker, /edgeWatch\(\); \/\/ at the top or bottom edge/, "started from the pointer's moves");
  assert.match(picker, /Math\.hypot\(g\.lx - g\.hx, g\.ly - g\.hy\) <= MOVE_PX\) return;/,
    "a finger resting on a word near the edge holds it (for its menu); only a slide scrolls");
  assert.match(picker, /extend\(Math\.min\(box\.right - 4/, "the phrase grows to the word under the pointer, inside the box");
  assert.ok(!/scrollingElement/.test(picker), "never the page itself");
  assert.match(picker, /r\[1\] - r\[0\] \+ 1 >= max/, "it stops once the phrase has its most words");
  assert.match(picker, /for \(const n of \[el, el && el\.parentElement\]\)/, "the words' box or the one right around it");
  assert.match(read("web/js/pages/player.js"), /onScroll: userScrolled/, "the transcript stops following the sound, as with a scroll by hand");
  assert.match(read("web/js/pages/reels.js"), /if \(picker\.busy\) return;/, "a reel's words don't follow the reel during a drag");
});
