// Run with: node --test tests/js/
// Getting the reels ticked on the phone (mobile/src/js/reels-phone.js): a reel that failed for a reason
// that may pass is tried again, and can be ticked again afterwards. The file needs the phone to load,
// so its pieces are checked here from its source.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const SOURCE = readFileSync(new URL("../../mobile/src/js/reels-phone.js", import.meta.url), "utf8");
const PAGE = readFileSync(new URL("../../web/js/pages/reels.js", import.meta.url), "utf8");

function canRetry() {
  const notOutside = /const NOT_OUTSIDE = ("[^"]+");/.exec(SOURCE)[1];
  const body = /export function canRetry\(why\) \{[\s\S]*?\n\}/.exec(SOURCE)[0].replace("export ", "");
  return new Function(`const NOT_OUTSIDE = ${notOutside}; ${body}; return canRetry;`)();
}

test("only failures that may pass are tried again", () => {
  const retry = canRetry();
  for (const why of ["the video couldn't be downloaded (Unable to resolve host \"scontent-sjc6-1.cdninstagram.com\")",
    "the video couldn't be downloaded (Software caused connection abort)", "the video took too long to download",
    "too large to send from the phone", "took over 7 minutes", "couldn't be read", "the video came back empty from Instagram"]) {
    assert.equal(retry(why), true, why);
  }
  for (const why of ["", "not a video", "too long", "nothing is said in it", "hardly any speech in it", "in English, not Spanish",
    "can't be shown outside Instagram"]) {
    assert.equal(retry(why), false, why);
  }
});

test("the sound alone is downloaded first, a failed download is tried three times, and the failures get a second round", () => {
  assert.match(SOURCE, /\[videoOnly \? "" : p\.audio, "reel\.m4a", "audio\/mp4", true\], \[p\.src, "reel\.mp4", "video\/mp4", false\]/);
  assert.match(SOURCE, /const RETRY_PAUSES = \[3, 10\];/);
  assert.match(SOURCE, /const again = list\.filter\(\(c\) => failed\.has\(c\) && canRetry\(failed\.get\(c\)\)\);/);
  assert.match(SOURCE, /retry: canRetry\(skipped\)/);
});

test("a reel that may work another time can be ticked again", () => {
  assert.match(PAGE, /const unusable = \(p\) => p\.have \|\| p\.video === false \|\| \(!!p\.skipped && !p\.retry\);/);
  assert.match(PAGE, /Didn't work last time \(\$\{esc\(p\.skipped\)\}\)\. Tick it to try again\./);
});
