// Safari (the web app on a Mac) cuts off an utterance started straight after speechSynthesis.cancel(): a DLI
// ICPT card, said by the device's voice, gave the first sound of its word and none of its sentence (2026-11-19).
// speakAfresh (cardvoice.js) cancels only when something is said, and waits a moment after cancelling.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { speakAfresh } from "../../web/js/cardvoice.js";

/** A speech engine that, like Safari, cuts off what is started within 50 ms of a cancel(). */
function safari({ speaking = false } = {}) {
  const s = { speaking, pending: false, paused: false, cancelledAt: -Infinity, said: [], cut: [], resumed: 0,
    cancel() { s.cancelledAt = Date.now(); s.speaking = false; },
    resume() { s.paused = false; s.resumed++; },
    speak(u) { (Date.now() - s.cancelledAt < 50 ? s.cut : s.said).push(u.text); s.speaking = true; } };
  return s;
}

test("nothing being said: no cancel(), the utterance is said whole", async () => {
  const s = safari();
  assert.equal(await speakAfresh(s, { text: "حُكُومَة" }), true);
  assert.equal(s.cancelledAt, -Infinity);
  assert.deepEqual(s.said, ["حُكُومَة"]);
});

test("something being said: cancelled, and the new utterance waits until Safari has settled", async () => {
  const s = safari({ speaking: true });
  await speakAfresh(s, { text: "سَفَارَة" });
  assert.notEqual(s.cancelledAt, -Infinity);
  assert.deepEqual(s.cut, []);
  assert.deepEqual(s.said, ["سَفَارَة"]);
});

test("a press that came during the wait wins; a paused queue is woken", async () => {
  const s = safari({ speaking: true });
  let want = "a";
  const first = speakAfresh(s, { text: "a" }, { still: () => want === "a" });
  want = "b";
  assert.equal(await first, false);
  assert.deepEqual(s.said, []);
  const p = safari();
  p.paused = true;
  await speakAfresh(p, { text: "c" });
  assert.equal(p.resumed, 1);
  assert.deepEqual(p.said, ["c"]);
});

test("the device's voice uses it, and stopping cancels only what is being said", () => {
  const dv = readFileSync(new URL("../../web/js/devicevoice.js", import.meta.url), "utf8");
  assert.match(dv, /await speakAfresh\(synth, u, \{ still: \(\) => current === u \}\)/);
  assert.doesNotMatch(dv, /synth\.speak\(u\)/, "no utterance started without speakAfresh");
  assert.match(dv, /synth && \(synth\.speaking \|\| synth\.pending\)\) synth\.cancel\(\)/);
});
