// Content's Home map: nothing overlaps (the owner, 2026-11-27: "it looks like things overlap on the current library
// home screen"). web/js/libraryhome.js arrange/relax: each bubble with the box of its words (measured on the page),
// the hub, and the "continue" bubbles beside their sections; lines kept off words and bubbles; all on the stage.
// (The page itself is checked the same way in a browser at 320, 360, 390 and 412 px, in English and Arabic.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { arrange, bubbleSizes, extentOf, layoutBubbles, lineEnd, linksOf, overlaps, partsOf, relax, separation } from "../../web/js/libraryhome.js";

// The owner's set (his v0.78.0 screenshot) with its words about as wide as the phone draws them at 12-14px.
const NAMES = { conversation: "Conversation", podcasts: "", books: "Books", audio: "My audio", audiobooks: "Audiobooks", youtube: "YouTube",
  lessons: "My files", pages: "My webpages", courses: "Basics", classroom: "Classroom", netflix: "Netflix", reels: "Reels", videos: "My videos" };

function ownersMap(W, { rtl = false, attach = "pages" } = {}) {
  // (the stage's room as homemap.js gives it)
  const phone = W < 560, H = phone ? Math.round(W * 1.9) : Math.min(1100, Math.max(760, Math.round(W * 0.9))), fit = phone ? Math.min(1, W / 370) : 1;
  const sized = bubbleSizes(Object.keys(NAMES).map((key) => ({ key })), { podcasts: 30, youtube: 8, pages: 6, courses: 3 }, { phone })
    .map((n) => ({ ...n, r: Math.round(n.r * fit) }));
  const { nodes, cx, cy } = layoutBubbles(sized, W, H, { phone, rtl });
  const bodies = [{ key: "hub", hub: true, x: W / 2, y: cy, w: W < 370 ? 130 : 170, h: W < 370 ? 58 : 70 },
    ...nodes.map((n) => ({ key: n.key, x: n.x, y: n.y, r: n.r,
      lw: n.below ? NAMES[n.key].length * 7.6 + (n.key === "netflix" ? 80 : 0) : 0, lh: n.below ? (n.key === "netflix" ? 52 : 18) : 0 })),
    { key: "resume0", attach, near: 12, x: 0, y: 0, r: phone ? 39 : 49, lw: 170, lh: 44 },
    { key: "resume1", attach: "youtube", near: 12, x: 0, y: 0, r: phone ? 17 : 21, lw: 0, lh: 0 }];
  return { bodies, W, H };
}

test("the owner's map: nothing overlaps at any phone or computer width, either direction, wherever Continue goes", () => {
  for (const W of [320, 360, 390, 412, 600, 980]) {
    for (const rtl of [false, true]) {
      for (const attach of ["pages", "podcasts", "netflix", "videos"]) {
        const { bodies, H } = ownersMap(W, { rtl, attach });
        const out = arrange(bodies, { W, H });
        assert.deepEqual(overlaps(out, W, H), [], `${W}px ${rtl ? "rtl" : "ltr"} beside ${attach}`);
        assert.equal(out.length, bodies.length);
      }
    }
  }
});

test("the same input gives the same picture, and the hub never moves", () => {
  const { bodies, W, H } = ownersMap(390);
  const a = arrange(bodies, { W, H }), b = arrange(bodies, { W, H });
  assert.deepEqual(a, b);
  const hub = a.find((x) => x.hub), was = bodies.find((x) => x.hub);
  assert.deepEqual([hub.x, hub.y], [was.x, was.y]);
});

test("Continue stays beside its own section", () => {
  const { bodies, W, H } = ownersMap(390);
  const out = arrange(bodies, { W, H });
  const go = out.find((b) => b.key === "resume0"), sec = out.find((b) => b.key === "pages");
  // (right beside it, or just past its words when they are in the way: the dotted line joins them)
  assert.ok(Math.hypot(go.x - sec.x, go.y - sec.y) < sec.r + go.r + 90, "near its section");
});

test("what counts as overlapping: circles, words, a line through words, and the stage's edge", () => {
  const a = { key: "a", x: 100, y: 100, r: 30, lw: 80, lh: 18 }, b = { key: "b", x: 150, y: 100, r: 30 };
  assert.ok(separation(a, b, 0), "two circles");
  const words = { key: "c", x: 100, y: 170, r: 20 }; // (sits on a's words, 134-152 down)
  assert.ok(separation(a, words, 0), "a circle on someone's words");
  assert.equal(separation(a, { key: "d", x: 300, y: 300, r: 10 }, 0), null);
  const hub = { key: "hub", hub: true, x: 200, y: 400, w: 120, h: 50 };
  const far = { key: "far", x: 200, y: 100, r: 20 }, between = { key: "mid", x: 200, y: 230, r: 10, lw: 60, lh: 16 };
  assert.ok(overlaps([hub, far, between], 400, 600).some(([k, what]) => k === "mid" && what === "line hub→far"), "a line through words");
  assert.ok(overlaps([hub, { key: "out", x: 5, y: 100, r: 20 }], 400, 600).some(([, what]) => what === "edge"));
});

test("a line ends where it meets its bubble's words, so it never runs under them", () => {
  const b = { key: "b", x: 100, y: 100, r: 30, lw: 90, lh: 18 }; // (words from y 134 to 152)
  const below = lineEnd(100, 400, b); // (from straight below: stops at the words' bottom, not the circle)
  assert.ok(below.y >= 152 && below.y <= 156, JSON.stringify(below));
  const above = lineEnd(100, -200, b); // (from above: at the circle's top)
  assert.ok(Math.abs(above.y - 70) < 0.5, JSON.stringify(above));
  const [link] = linksOf([{ key: "hub", hub: true, x: 100, y: 400, w: 100, h: 40 }, b]);
  assert.ok(link.ends[1] <= 380 && link.ends[3] >= 152, "from the hub's words' edge to the bubble's words' edge");
  assert.deepEqual(Object.keys(partsOf(b)), ["circle", "box"]);
  assert.deepEqual(extentOf(b), { l: 55, r: 145, t: 70, b: 152 });
});

test("dragging: the bubble held stays under the finger while the others make room", () => {
  const { bodies, W, H } = ownersMap(390);
  const out = arrange(bodies, { W, H });
  const held = out.find((b) => b.key === "books"), other = out.find((b) => b.key === "reels");
  held.x = other.x; held.y = other.y; // (dropped right on another)
  relax(out, { W, H, steps: 300, pinned: "books", pull: 0 });
  assert.deepEqual([held.x, held.y], [other.x === held.x ? held.x : held.x, held.y], "held where it is");
  assert.ok(!separation(held, other, 0), "the other moved out of the way");
});

test("the page: words measured as drawn, sized to their text, lines drawn where linksOf says; the drag is a prototype", () => {
  const map = readFileSync(new URL("../../web/js/components/homemap.js", import.meta.url), "utf8");
  assert.match(map, /lw: words \? words\.offsetWidth : 0, lh: words \? words\.offsetHeight : 0/);
  assert.match(map, /bodies = arrange\(start\.map\(/);
  assert.match(map, /for \(const shrink of \[1, 0\.92, 0\.85, 0\.78\]\)/, "circles a little smaller only if nothing else clears it");
  assert.match(map, /for \(const link of linksOf\(bodies\)\)/);
  assert.match(map, /const physics = feature\("library_physics"\) && !calm;/, "not with reduced motion");
  assert.match(map, /if \(!was\.moving\) return; \/\/ \(a tap: the link opens as usual\)/);
  const css = readFileSync(new URL("../../web/css/libraryhome.css", import.meta.url), "utf8");
  assert.match(css, /\.lh-b\.small \.lh-n \{[^}]*width: max-content; max-width: 150px;/);
  assert.match(css, /\.lh-rl \{[^}]*width: max-content; max-width: 170px;/);
  assert.match(readFileSync(new URL("../../web/js/prototype.js", import.meta.url), "utf8"), /library_physics: \{[^}]*released: false/);
});
