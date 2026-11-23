// Run with: node --test tests/js/
// Watched reels go to the bottom of the reel lists (the owner: "In Reels, after watching a reel, it should be sent to
// the bottom of the list"): the Library's Reels tab and the Reels page both use libsort.js's order, and the reel
// player counts a reel as watched once it plays into its last moments, not only when its video ends.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEFAULT_CHOICE, arrange } from "../../web/js/libsort.js";

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const reel = (id, added) => ({ id, audio_type: "video/instagram", status: "done", duration: 12, created_at: added });
const REELS = [reel(1, 100), reel(2, 200), reel(3, 300), reel(4, 400)];
const ids = (list) => list.map((ep) => ep.id);

test("watched reels go to the bottom; the rest stay newest first", () => {
  assert.deepEqual(ids(arrange(REELS, DEFAULT_CHOICE, new Map(), new Set())), [4, 3, 2, 1]);
  assert.deepEqual(ids(arrange(REELS, DEFAULT_CHOICE, new Map(), new Set(["4"]))), [3, 2, 1, 4]);
  assert.deepEqual(ids(arrange(REELS, DEFAULT_CHOICE, new Map(), new Set(["4", "2"]))), [3, 1, 4, 2]);
});

test("the Filter's choices still apply: finished hidden, or only finished", () => {
  const watched = new Set(["4", "2"]);
  assert.deepEqual(ids(arrange(REELS, { show: ["progress", "new"], sort: "suggested" }, new Map(), watched)), [3, 1]);
  assert.deepEqual(ids(arrange(REELS, { show: ["done"], sort: "suggested" }, new Map(), watched)), [4, 2]);
});

test("the Reels page lists reels in that order, and the player marks a reel watched near its end", () => {
  const page = read("web/js/pages/reels.js");
  assert.match(page, /for \(const ep of arrange\(reels, DEFAULT_CHOICE, progress, seen\)\)/);
  assert.doesNotMatch(page, /\[\.\.\.reels\]\.reverse\(\)/); // no longer newest first whatever was watched
  assert.match(page, /atEnd\(Number\(s\.t\) \|\| 0, Number\(s\.d\) \|\| 0\)[^\n]*\n\s*watchedNow\.add\(String\(ep\.id\)\);\n\s*markWatched\(ep\.id\)/);
  assert.match(page, /if \(s\.ends > seenEnds\) \{\n\s*seenEnds = s\.ends;\n\s*watchedNow\.add\(String\(ep\.id\)\);\n\s*markWatched\(ep\.id\)/);
  // The Library's Reels tab is a card list put in libsort.js's order too.
  assert.match(read("web/js/pages/library.js"), /arranged = arrange\(\w+, readChoice\(\), progressMap\(\), watchedNow\)/);
});
