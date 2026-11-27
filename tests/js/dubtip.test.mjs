// A YouTube video whose own sound is in another language, with a dubbed track in the one being learned: the way to
// choose it, shown as the video opens (the owner, 2026-11-20), never over YouTube's player.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dubbedAudio } from "../../web/js/ytcaptions.js";

const src = (f) => readFileSync(new URL(f, import.meta.url), "utf8");

test("a dubbed track in the language learned is found when the video's own sound is another language", () => {
  const data = (...tracks) => ({ streamingData: { adaptiveFormats: tracks.map((a) => ({ audioTrack: a })) } });
  const en = { id: "en.4", displayName: "English original", audioIsDefault: true };
  const ar = { id: "ar.3", displayName: "Arabic", audioIsDefault: false };
  assert.deepEqual(dubbedAudio(data(en, ar), "ar"), { id: "ar.3", name: "Arabic" });
  assert.equal(dubbedAudio(data(en), "ar"), null, "no Arabic track: nothing to choose");
  assert.equal(dubbedAudio(data({ ...ar, audioIsDefault: true }, { ...en, audioIsDefault: false }), "ar"), null, "Arabic is its own sound: nothing to do");
});

test("the box: under the video (nothing over YouTube's player), Don't show this again, then the short note instead", () => {
  const tip = src("../../web/js/components/dubtip.js");
  assert.doesNotMatch(tip, /openModal/, "not a box over the page: a dimmed page would cover YouTube's player");
  assert.match(tip, /after\.after\(el\);/);
  assert.match(tip, /if \(off\.checked\) \{ try \{ localStorage\.setItem\(KEY, "1"\);/);
  for (const s of ["Hear it in {0}", "Tap ⚙ (Settings).", "Tap Audio track.", "Choose {0}.", "Don't show this again"]) {
    assert.ok(tip.includes(s), s);
  }
  const player = src("../../web/js/pages/player.js");
  assert.match(player, /if \(!dubTipOff\(\)\) \{\s*showDubTip\(\{ after: \$\("#yt-note"\), language: studyName, translated: captionKind\(ep\) === "translated"/);
  assert.match(player, /temp = `This video can be heard in \$\{studyName\} too: choose it under ⚙ → Audio track in the video\.`;/, "ticked: the short note, as before");
  const css = src("../../web/css/media.css");
  assert.match(css, /\.dub-tip \{ flex: none; background: var\(--media-1\);/);
  const de = JSON.parse(src("../../web/i18n/de.json"));
  assert.equal(de["Tap Audio track."], "Tippe auf Audiospur.", "YouTube's own name for the menu");
});
