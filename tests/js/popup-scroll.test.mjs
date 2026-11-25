// Run with: node --test tests/js/
// The word popup (components/wordbubble.js), everywhere it is used: the owner, 2026-11-25, of a reel: "If I select a
// selection which is too big, it often will not allow me to see any of the definition. So my solution would be to just
// have the entire pop-up card scrollable." Only the definition used to scroll, between a heading and a line of points
// that never gave way, so a short popup with a long selection had no room left for it. Now the whole popup scrolls as
// one, its heading and buttons row staying put, and a long selection's heading is cut to two lines (a tap shows it all).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

test("the whole popup scrolls, its heading held at the top and its buttons at the bottom", () => {
  const css = read("web/css/media.css");
  assert.match(css, /\.word-bubble \{ display: flex; flex-direction: column; overflow-x: hidden; overflow-y: auto; overscroll-behavior: contain; \}/);
  assert.match(css, /\.word-bubble > \.wb-head, \.word-bubble > \.wb-actions \{ flex: none; position: sticky; z-index: 1; background: var\(--surface\); \}/);
  assert.match(css, /\.word-bubble > \.wb-head \{ top: 0; box-shadow: 0 -16px 0 var\(--surface\); \}/, "no text showing through above it");
  assert.match(css, /\.word-bubble > \.wb-actions \{ bottom: 0; margin-top: auto; box-shadow: 0 16px 0 var\(--surface\); \}/, "nor below them");
  assert.match(css, /\.word-bubble > \.wb-body \{ flex: 1 0 auto; \}/, "the definition is never squeezed away");
  assert.doesNotMatch(css, /\.word-bubble > \.wb-body \{[^}]*overflow-y: auto/, "it no longer scrolls on its own");
  assert.match(css, /\.word-bubble > \.wb-head:has\(\.wb-phrase\.open\) \{ position: static; \}/, "a long selection shown whole scrolls away");
});

test("a reel's popup, short under the words, scrolls as a whole card, heading and all; its buttons strip stays", () => {
  const css = read("web/css/reels.css");
  assert.match(css, /\.reel-pop \.word-bubble, \.reel-pop \.word-bubble\.sheet \{[^}]*display: flex; flex-direction: column; overflow-x: hidden; overflow-y: auto;/);
  assert.match(css, /\.reel-pop \.word-bubble > \.wb-head \{ flex: none; padding: 6px 10px 2px; position: static; box-shadow: none; \}/);
  assert.match(css, /background: #1a1a1a; border-top: 1px solid #383838;\n\s*box-shadow: none;/, "nothing painted over the reel's controls under the strip");
  assert.match(css, /\.reel-pop \.word-bubble > \.wb-body \{ flex: 1 0 auto; padding: 0 10px 8px; \}/);
  assert.match(css, /\.reel-pop \.wb-word\.wb-phrase \{ font-size: 18px; \}/, "a long selection's two lines a little smaller there");
  assert.match(css, /\.reel-pop \.word-bubble > \.wb-actions \{\n\s*position: absolute; left: 0; right: 0; bottom: 0;/);
});

test("a long selection's heading is two lines at most, and a tap shows it all until the next word", () => {
  const css = read("web/css/app.css");
  assert.match(css, /\.wb-word\.wb-phrase \{ font-size: 21px; line-height: 1\.35; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2;\n\s*line-clamp: 2; overflow: hidden; cursor: pointer; \}/);
  assert.match(css, /\.wb-word\.wb-phrase\.open \{ display: block; -webkit-line-clamp: none; line-clamp: none; overflow: visible; \}/);
  const bubble = read("web/js/components/wordbubble.js");
  assert.match(bubble, /class="wb-word ar\$\{phrase\(\) \? ` wb-phrase\$\{phraseOpen \? " open" : ""\}` : ""\}"/, "drawn again (the answer came) as it was");
  assert.match(bubble, /const whole = e\.target\.closest\("\.wb-phrase"\);\n\s*if \(whole\) \{ phraseOpen = !phraseOpen; whole\.classList\.toggle\("open", phraseOpen\); return; \}/);
  const show = bubble.slice(bubble.indexOf("function show(anchorEl, context"), bubble.indexOf("// The quick / detailed switch was flipped"));
  assert.match(show, /phraseOpen = false;/, "folded again for the next word");
});

test("a controller scrolls whichever part scrolls: the whole popup now", () => {
  const pad = read("web/js/gamepad.js");
  const fn = pad.slice(pad.indexOf("function popupScroll(dir)"), pad.indexOf("const POPUP = {"));
  assert.match(fn, /\[b, b\.querySelector\("\.wb-body"\)\]\.find\(\(x\) => x && x\.scrollHeight > x\.clientHeight \+ 1\) \|\| b/);
  // And the "Explain words with" menu is still scrolled into sight inside whichever part scrolls.
  assert.match(read("web/js/components/wordbubble.js"), /const box = m && \[m\.closest\("\.wb-body"\), el\]\.find\(\(x\) => x\.scrollHeight > x\.clientHeight\);/);
});
