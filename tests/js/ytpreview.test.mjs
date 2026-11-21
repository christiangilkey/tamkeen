// The YouTube list scrolled like YouTube (prototype library_feed, web/js/ytpreview.js): the length on the picture, where
// a preview starts, which card plays, and YouTube's rules for its embedded player kept in the code.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { clock, pickCard, previewsAllowed, startAt } from "../../web/js/ytpreview.js";
import { PROTOTYPES } from "../../web/js/prototype.js";

const src = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

test("a video's length is written as YouTube writes it", () => {
  assert.equal(clock(749), "12:29");
  assert.equal(clock(4090), "1:08:10");
  assert.equal(clock(59.6), "1:00");
  assert.equal(clock(0), "0:00");
  assert.equal(clock(undefined), "0:00");
});

test("a preview starts where the learner got to, not at the very start or the last half minute", () => {
  assert.equal(startAt(null), 0);
  assert.equal(startAt({ pos: 4, dur: 600 }), 0);
  assert.equal(startAt({ pos: 125.7, dur: 600 }), 125);
  assert.equal(startAt({ pos: 590, dur: 600 }), 0);
  assert.equal(startAt({ pos: 125, dur: 0 }), 125);
});

test("the card nearest the middle of the screen plays, and only one wholly clear of anything", () => {
  const r = (top) => ({ top, bottom: top + 200 });
  assert.equal(pickCard([r(0), r(250), r(500)], [true, true, true], 800), 1);
  assert.equal(pickCard([r(0), r(250), r(500)], [true, false, true], 800), 2);  // (500..700: middle 600, nearer than 100)
  assert.equal(pickCard([r(0), r(300)], [false, false], 800), -1);
  assert.equal(pickCard([], [], 800), -1);
});

test("no previews on mobile data or when the device asks to save data", () => {
  assert.equal(previewsAllowed({}), true);
  assert.equal(previewsAllowed({ connection: { type: "wifi" } }), true);
  assert.equal(previewsAllowed({ connection: { type: "cellular" } }), false);
  assert.equal(previewsAllowed({ connection: { saveData: true } }), false);
});

test("YouTube's rules for its embedded player are kept by the previews", () => {
  const js = src("web/js/ytpreview.js");
  // Silent, in the page, YouTube's own controls left alone.
  assert.match(js, /mute: 1/);
  assert.match(js, /playsinline: 1/);
  assert.doesNotMatch(js, /controls: 0/);
  // One at a time: starting one stops the last one first.
  assert.match(js, /function start\(box\) \{\n    stop\(\);/);
  // Only when all of it is on the screen with nothing in front of it, checked again all the time; hidden pages play nothing.
  assert.match(js, /document\.elementFromPoint/);
  assert.match(js, /if \(active && !clear\(active\.box\)\) stop\(\);/);
  assert.match(js, /document\.hidden/);
  // Never under 200 × 200, and the playing video comes in front of everything drawn on the picture.
  const css = src("web/css/app.css");
  assert.match(css, /\.yt-pic \{[^}]*min-height: 200px/);
  assert.match(css, /minmax\(min\(340px, 100%\), 1fr\)/); // (narrower on a small phone, never wider than the screen)
  assert.match(css, /\.yt-live \{[^}]*z-index: 3/);
  assert.doesNotMatch(css, /\.(yt-len|yt-got|watched-pill)[^{]*\{[^}]*z-index: ([4-9]|\d\d)/);
});

test("it is a prototype, previews on YouTube cards only, and stopped when the page goes", () => {
  assert.equal(PROTOTYPES.library_feed.released, false);
  const lib = src("web/js/pages/library.js");
  assert.match(lib, /if \(!feature\("library_feed"\)\) return false;/);
  assert.match(lib, /if \(id\) \{ pic\.dataset\.video = id;/, "only a YouTube card has a video to preview");
  assert.match(src("web/js/ytpreview.js"), /\.yt-pic\[data-video\]/);
  assert.match(lib, /return \(\) => \{\n    if \(stopPreviews\) stopPreviews\(\);/);
  assert.match(src("mobile/scripts/build-www.mjs"), /"js\/ytpreview\.js"/);
});
