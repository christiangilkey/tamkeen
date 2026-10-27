// Run with: node --test tests/js/
// Playing again brings the words back to the one being said (the transcript in the players, the line of
// words under a reel), and the word popup's "Explain words with" menu isn't squashed in a short popup.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

test("the players' transcript follows the word being said again when playing resumes", () => {
  const player = read("web/js/pages/player.js");
  assert.match(player, /audio\.addEventListener\("play", \(\) => \{[\s\S]*?const was = follow;\s*follow = true;\s*\$\("#back"\)\.hidden = true;\s*if \(curIdx >= 0\) ensureVisible\(wordEls\[curIdx\], !was\);/);
});

test("a reel's words follow the word being said again when it plays again", () => {
  const reels = read("web/js/pages/reels.js");
  assert.match(reels, /const resumed = !playing && !s\.paused;/);
  assert.match(reels, /if \(resumed && cur && curIdx >= 0 && cur\.els\[curIdx\]\) \{ slidAt = 0; keepInView\(cur\.els\[curIdx\]\); \}/);
  assert.match(reels, /if \(bubble\.open && pauseAfterWord\(\) && !playing\) return;/);
});

test("the word popup's source menu keeps its height", () => {
  assert.match(read("web/css/media.css"), /\.word-bubble > \.wb-srcmenu \{ flex: 0 0 auto; max-height: 75%; overflow-y: auto;/);
});
