// The Library's Home as a bubble map (prototype "library_home"): which kinds need a key, how use becomes size, and a
// layout with no overlaps that mirrors for right-to-left. The drawing (components/homemap.js) needs a browser; its
// wiring is read from the source.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FRESH_BELOW, bubbleSizes, layoutBubbles, ringOf, usage } from "../../web/js/libraryhome.js";

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const KINDS = ["courses", "conversation", "podcasts", "youtube", "netflix", "pages", "books", "audiobooks", "reels", "videos", "audio", "lessons"]
  .map((key) => ({ key, label: key, icon: "x", href: `#/library?show=${key}` }));

test("the plum ring shows only while something is missing on this device (the owner: it goes once the key is added)", () => {
  // Conversation: the learner's AI key, on every version.
  assert.deepEqual(ringOf("conversation", { platform: "desktop", aiKey: false }), { why: "ai" });
  assert.equal(ringOf("conversation", { platform: "android", aiKey: true }), null);
  // Things with no words to read: a transcription key, on the phones and the web app only.
  for (const k of ["podcasts", "audiobooks", "reels", "videos", "audio"]) {
    assert.deepEqual(ringOf(k, { platform: "android", stt: { on: false } }), { why: "stt" }, k);
    assert.equal(ringOf(k, { platform: "android", stt: { on: true } }), null, `${k}: key added`);
    assert.equal(ringOf(k, { platform: "android", stt: { on: false, blocked: true } }), null, `${k}: only the computer can, a key wouldn't help`);
    assert.equal(ringOf(k, { platform: "desktop", stt: { on: false } }), null, `${k}: the computer transcribes for free`);
  }
  // Netflix: where it can't play (a phone: the computer app; the web app on a computer: the extension), never on the computer app.
  assert.deepEqual(ringOf("netflix", { platform: "android", netflix: { ok: false, reason: "android" } }), { why: "netflix", reason: "android" });
  assert.deepEqual(ringOf("netflix", { platform: "android", netflix: { ok: false, reason: "web-computer" } }), { why: "netflix", reason: "web-computer" });
  assert.equal(ringOf("netflix", { platform: "android", netflix: { ok: true, reason: "" } }), null, "the web app with the extension");
  assert.equal(ringOf("netflix", { platform: "desktop", netflix: { ok: false, reason: "desktop-os" } }), null);
  for (const k of ["youtube", "books", "pages", "courses", "lessons", "dli", "classroom"]) assert.equal(ringOf(k, { platform: "android" }), null, k);
});

test("use: something opened lately counts three times something only kept", () => {
  assert.deepEqual(usage({ podcasts: 10, books: 2 }, { books: 4, conversation: 1 }), { podcasts: 10, books: 14, conversation: 3 });
});

test("size follows use; a new learner gets every bubble the same size", () => {
  const fresh = bubbleSizes(KINDS, { podcasts: FRESH_BELOW - 1 });
  assert.equal(new Set(fresh.map((b) => b.r)).size, 1, "equal sizes");
  const used = bubbleSizes(KINDS, { podcasts: 40, youtube: 10, books: 1 });
  const r = Object.fromEntries(used.map((b) => [b.key, b.r]));
  assert.ok(r.podcasts > r.youtube && r.youtube > r.books && r.books > r.netflix);
  assert.ok(r.podcasts / r.youtube < 4, "the area, not the radius, follows use");
  assert.ok(used.find((b) => b.key === "netflix").below, "a small bubble's name sits under it");
});

test("the layout: inside the stage, no two bubbles overlap, none sits on the hub, and it mirrors for right to left", () => {
  for (const [W, H, phone] of [[358, 558, true], [980, 705, false]]) {
    const sizes = bubbleSizes(KINDS, { podcasts: 40, youtube: 22, books: 11, reels: 8, courses: 6 }, { phone });
    const { nodes, cx, cy, hub } = layoutBubbles(sizes, W, H, { phone });
    for (const n of nodes) {
      assert.ok(n.x - n.r >= -1 && n.x + n.r <= W + 1 && n.y - n.r >= -1 && n.y + n.r <= H + 1, `${n.key} inside ${W}`);
      assert.ok(Math.hypot(n.x - cx, n.y - cy) >= hub + n.r - 1, `${n.key} clear of the hub`);
      for (const m of nodes) if (m !== n) assert.ok(Math.hypot(n.x - m.x, n.y - m.y) >= n.r + m.r - 1, `${n.key} / ${m.key}`);
    }
    const rtl = layoutBubbles(sizes, W, H, { phone, rtl: true });
    nodes.forEach((n, i) => assert.equal(rtl.nodes[i].x, Math.round((W - n.x) * 10) / 10));
    assert.deepEqual(layoutBubbles(sizes, W, H, { phone }), { nodes, cx, cy, hub }, "the same input, the same picture");
  }
});

test("the Library's Home entry: first, only with the prototype, and the Library still reopens on the kind used last", async () => {
  const library = read("web/js/pages/library.js");
  assert.ok(library.includes('{ key: "home", label: "Home", icon: "home", href: "#/library?show=home", when: () => feature("library_home") },'));
  assert.ok(library.indexOf('key: "home"') < library.indexOf('key: "courses"'), "Home is the first entry");
  assert.ok(library.includes('const firstKind = () => (isKind("home") ? "home" : isKind("courses") ? "courses" : "podcasts");'));
  assert.match(library, /return isKind\(k\) \? k : firstKind\(\);/, "the kind chosen last time comes first");
  assert.ok(library.includes('if (kind === "home") { showHome(); return; }'));
  for (const f of ["web/index.html", "mobile/src/index.html", "mobile/scripts/build-www.mjs"]) assert.match(read(f), /css\/libraryhome\.css/, f);
  const { PROTOTYPES } = await import("../../web/js/prototype.js");
  assert.equal(PROTOTYPES.library_home.released, true, "released for everybody in v0.78.0");
});

test("the map follows DESIGN.md: circles, no tinted backing, the dark stage only on the map", () => {
  const css = read("web/css/libraryhome.css");
  assert.match(css, /\.lh-b \{[^}]*border-radius: 50%; corner-shape: round;/);
  assert.match(css, /\.lh-b\.ring \{ border: 2px solid var\(--plum-600\); \}/);
  assert.doesNotMatch(css, /lh-legend/, "no legend (the owner)");
  assert.match(css, /\.lh-stage \{\s*--paper: var\(--media-1\);/, "the always-dark --media-* tokens, on the stage only");
  assert.doesNotMatch(css.replace(/\/\*[\s\S]*?\*\//g, ""), /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i, "no colour typed in (DESIGN.md 3)");
  assert.doesNotMatch(css, /box-shadow/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});

test("a link to one of Basics' tabs still opens Basics with Home first (the Review banner's Get words: #/library?tab=basics)", () => {
  const library = read("web/js/pages/library.js");
  assert.ok(library.includes(`if (!query.get("show") && ["basics", "grammar"].includes(query.get("tab")) && isKind("courses")) query.set("show", "courses");`));
  assert.ok(library.indexOf(`["basics", "grammar"].includes(query.get("tab"))`) < library.indexOf("let kind = isKind(query.get(\"show\"))"));
});
