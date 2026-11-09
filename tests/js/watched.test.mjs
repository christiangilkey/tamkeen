// Run with: node --test tests/js/
// The "Watched" label on reels and YouTube videos watched to the end (web/js/watched.js): when a video
// counts as watched, the list kept on the device, and the pages that show it.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { atEnd, markWatched, watchedIds, watchedPill } from "../../web/js/watched.js";

// A stand-in for the browser's localStorage.
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: (k) => { store.delete(k); },
};
beforeEach(() => store.clear());

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

test("a video counts as watched in its last 5%, never more than the last 20 s nor less than the last 2 s", () => {
  assert.equal(atEnd(0, 0), false);           // length not known yet
  assert.equal(atEnd(27, 30), false);         // a 30 s reel: the last 2 s count
  assert.equal(atEnd(28, 30), true);
  assert.equal(atEnd(30, 30), true);
  assert.equal(atEnd(189, 200), false);       // 200 s: the last 10 s (5%)
  assert.equal(atEnd(190, 200), true);
  assert.equal(atEnd(3579, 3600), false);     // an hour: only the last 20 s, not the last 3 min
  assert.equal(atEnd(3580, 3600), true);
});

test("watched videos are remembered, each once, the newest kept", () => {
  assert.equal(watchedIds().size, 0);
  markWatched(5);
  markWatched("7");
  markWatched(5); // again: moves to the end, not twice
  assert.deepEqual([...watchedIds()], ["7", "5"]);
  assert.ok(watchedIds().has("5"));
  for (let i = 0; i < 3100; i++) markWatched(1000 + i);
  const ids = watchedIds();
  assert.equal(ids.size, 3000);
  assert.ok(ids.has("4099") && !ids.has("7") && !ids.has("1000"));
});

test("the Reels page's old list of watched reels is taken over once", () => {
  store.set("reels:watched", JSON.stringify([3, "4"]));
  assert.deepEqual([...watchedIds()], ["3", "4"]);
  store.set("reels:watched", JSON.stringify([99])); // read only the first time
  markWatched(8);
  assert.deepEqual([...watchedIds()], ["3", "4", "8"]);
});

test("bad or missing storage never breaks a list", () => {
  store.set("watched", "{not json");
  assert.equal(watchedIds().size, 0);
  const saved = globalThis.localStorage;
  globalThis.localStorage = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  try {
    assert.equal(watchedIds().size, 0);
    assert.doesNotThrow(() => markWatched(1));
  } finally { globalThis.localStorage = saved; }
});

test("the label, and the pages that mark and show it", () => {
  assert.match(watchedPill(), /class="watched-pill">Watched</);
  const lib = read("web/js/pages/library.js");
  assert.match(lib, /from "\.\.\/watched\.js"/);
  assert.match(lib, /\(isReel\(ep\) \|\| isYouTube\(ep\)\)/);  // only reels and YouTube videos get it
  assert.match(lib, /watchedPill\(\)/);
  const player = read("web/js/pages/player.js");
  assert.match(player, /atEnd\(audio\.currentTime \|\| 0, duration\)\) markWatched\(id\)/);
  const reels = read("web/js/pages/reels.js");
  assert.match(reels, /from "\.\.\/watched\.js"/);
  assert.match(reels, /watchedPill\(\)/);
  assert.doesNotMatch(reels, /"reels:watched"|· watched/);   // one list, and the label instead of the words
  assert.match(read("web/css/app.css"), /\.watched-pill \{[^}]*background: #8f1d84/);
  assert.match(read("mobile/scripts/build-www.mjs"), /"js\/watched\.js"/);  // the phone has it too
});
