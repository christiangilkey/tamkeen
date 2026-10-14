// Pronunciation practice on a review card (web/js/review/pronounce.js): when listening ends,
// where the speech is in what was recorded, and how much a quiet attempt is turned up.
// (The microphone and the playing are the browser's, and are checked in a real window.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { boost, canRecord, listenLimit, listener, practiseButton, speechBounds } from "../../web/js/review/pronounce.js";
import { ICON_NAMES } from "../../web/js/icons.js";

const RATE = 16000;
/** A recording: [seconds, loudness] stretches of a 220 Hz tone, one after another. */
function recording(...parts) {
  const out = [];
  for (const [seconds, level] of parts) {
    for (let i = 0; i < Math.round(seconds * RATE); i++) out.push(level * Math.sin((2 * Math.PI * 220 * i) / RATE));
  }
  return Float32Array.from(out);
}
/** Feed a listener a loudness every 50 ms; the millisecond at which it says "enough". */
function endsAt(enough, levelAt, limit = 20000) {
  for (let ms = 0; ms <= limit; ms += 50) if (enough(levelAt(ms), ms)) return ms;
  return null;
}

test("listening ends a moment after the learner stops speaking", () => {
  const ms = endsAt(listener(), (t) => (t >= 500 && t < 1300 ? 0.2 : 0.004));
  assert.ok(ms >= 1300 + 600 && ms <= 1300 + 800, String(ms));
});

test("a breath between two syllables does not end it", () => {
  const ms = endsAt(listener(), (t) => ((t >= 300 && t < 700) || (t >= 1000 && t < 1500) ? 0.2 : 0.004));
  assert.ok(ms >= 1500 + 600, String(ms));
});

test("speaking from the very first moment is still heard as speech", () => {
  const ms = endsAt(listener(), (t) => (t < 900 ? 0.25 : 0.004));
  assert.ok(ms >= 900 + 600 && ms <= 900 + 800, String(ms));
});

test("saying nothing gives up after a few seconds, and a noisy room at the limit", () => {
  assert.equal(endsAt(listener(), () => 0.004), 4000);
  assert.equal(endsAt(listener({ maxMs: 6000 }), () => 0.3), 6000);  // never quiet: the limit ends it
});

test("the limit follows the length of the word's own audio", () => {
  assert.equal(listenLimit(1), 5000);
  assert.equal(listenLimit(2), 7500);
  assert.equal(listenLimit(60), 15000);
});

test("the silence around the attempt is cut off", () => {
  const where = speechBounds(recording([1, 0.002], [0.8, 0.3], [1.5, 0.002]), RATE);
  assert.ok(where.start > 0.8 && where.start <= 1, String(where.start));    // a short lead-in is kept
  assert.ok(where.end >= 1.8 && where.end < 2.2, String(where.end));
  assert.ok(Math.abs(where.peak - 0.3) < 0.01);
});

test("a recording with nothing said, or only a click, is not an attempt", () => {
  assert.equal(speechBounds(recording([2, 0.002]), RATE), null);
  assert.equal(speechBounds(recording([1, 0.002], [0.04, 0.5], [1, 0.002]), RATE), null);
  assert.equal(speechBounds(new Float32Array(0), RATE), null);
});

test("a quiet attempt is turned up, a loud one left alone, and never beyond eight times", () => {
  assert.ok(Math.abs(boost(0.2) - 4.25) < 1e-9);
  assert.equal(boost(0.95), 1);
  assert.equal(boost(0.01), 8);
  assert.equal(boost(0), 1);
});

test("where there is no microphone the button is left out", () => {
  assert.equal(canRecord(), false);  // Node has none
  assert.equal(practiseButton(), "");
  assert.ok(ICON_NAMES.includes("speak"));
});
