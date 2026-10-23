// Run with: node --test tests/js/
// How much audio the "Word" button plays (web/js/wordclip.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { estimateSeconds, syllables, wordClip } from "../../web/js/wordclip.js";

test("syllables are counted from the letters in each script", () => {
  assert.equal(syllables("simplemente", "es"), 4);
  assert.equal(syllables("hola", "es"), 2);
  assert.equal(syllables("안녕하세요", "ko"), 5);
  assert.equal(syllables("你好", "zh"), 2);
  assert.equal(syllables("مرحبا", "ar"), 3);
  assert.equal(syllables("समय", "hi"), 3);
  assert.ok(syllables("สวัสดี", "th") >= 2);
  assert.equal(syllables("", "es"), 1);
});

test("a longer word gets longer, with a floor for short ones", () => {
  assert.ok(estimateSeconds("simplemente", "es") > estimateSeconds("de", "es"));
  assert.ok(estimateSeconds("y", "es") >= 0.35);
});

test("a word timed too tightly plays as long as it takes to say, with room either side", () => {
  // "simplemente" timed as 0.2 s: far too short for four syllables.
  const [from, to] = wordClip({ starts: [10, 12], ends: [10.2, 12.5], texts: ["simplemente", "eso"], i: 0, lang: "es" });
  assert.ok(Math.abs(from - 9.88) < 1e-9, "a little before the start");
  assert.ok(to - 10 >= 0.85, "long enough for four syllables");
  assert.ok(to <= 12.5, "never past the next word");
});

test("it never plays most of the next word", () => {
  const [, to] = wordClip({ starts: [5, 5.3], ends: [5.25, 5.9], texts: ["simplemente", "no"], i: 0, lang: "es" });
  assert.ok(to <= 5.3 + 0.6 / 3 + 1e-9);
  assert.ok(to >= 5.25 + 0.15 - 1e-9, "but always a little past the word's own end");
});

test("the last word of a transcript isn't capped", () => {
  const [, to] = wordClip({ starts: [1], ends: [1.1], texts: ["simplemente"], i: 0, lang: "es" });
  assert.ok(to > 1.8);
});
