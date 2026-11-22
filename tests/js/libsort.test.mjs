// The Library's order and Filter (prototype library_feed, web/js/libsort.js; the owner, 2026-11-21: "watched things to be
// sent to the bottom of the list by default, in progress things to be at the top and below those should be not yet
// watched things set by date with newest added on the top … a filter button … watched, new, or in progress, filter by
// time added, length. This should be for every tab").
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { arrange, changedCount, cleanChoice, stateOf } from "../../web/js/libsort.js";
import { PROTOTYPES } from "../../web/js/prototype.js";

const src = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const DAY = 86400;

test("where something is up to, each kind its own way", () => {
  const none = new Set();
  // Played things: started is in progress, played to the end (or stopped in its last bit) is finished.
  assert.equal(stateOf({ id: 1, duration: 600 }, null, none), "new");
  assert.equal(stateOf({ id: 1, duration: 600 }, { pos: 1, dur: 600 }, none), "new", "a second in is not started");
  assert.equal(stateOf({ id: 1, duration: 600 }, { pos: 120, dur: 600 }, none), "progress");
  assert.equal(stateOf({ id: 1, duration: 600 }, { pos: 595, dur: 600 }, none), "done");
  assert.equal(stateOf({ id: 1, duration: 600 }, { pos: 120, dur: 600 }, new Set(["1"])), "done", "watched.js says it was played to the end");
  // A web page: read 70% of the way; a book: its last page.
  assert.equal(stateOf({ id: 2, audio_type: "text/html" }, { kind: "page", frac: 0.3 }, none), "progress");
  assert.equal(stateOf({ id: 2, audio_type: "text/html" }, { kind: "page", frac: 0.8 }, none), "done");
  assert.equal(stateOf({ id: 3, audio_type: "text/book" }, { kind: "page", frac: 0.8 }, none), "progress");
  assert.equal(stateOf({ id: 3, audio_type: "text/book" }, { kind: "page", frac: 1 }, none), "done");
});

const items = [
  { id: 1, title: "old new", published: 1 * DAY, duration: 300 },
  { id: 2, title: "newest new", published: 9 * DAY, duration: 3600 },
  { id: 3, title: "finished", published: 8 * DAY, duration: 100 },
  { id: 4, title: "in progress, used long ago", published: 2 * DAY, duration: 1000 },
  { id: 5, title: "in progress, used just now", published: 3 * DAY, duration: 2000 },
  { id: 6, title: "a page, no length", published: 5 * DAY, audio_type: "text/html" },
];
const progress = new Map([
  ["4", { pos: 100, dur: 1000, ts: 1000 }],
  ["5", { pos: 100, dur: 2000, ts: 9000 }],
]);
const watched = new Set(["3"]);
const ids = (list) => list.map((x) => x.id);

test("by default: in progress first (the one used last on top), then new (newest added first), finished last", () => {
  assert.deepEqual(ids(arrange(items, cleanChoice(null), progress, watched)), [5, 4, 2, 6, 1, 3]);
});

test("the Filter: which to show, and by date added or by length (what has no length last)", () => {
  assert.deepEqual(ids(arrange(items, { show: ["new"], sort: "suggested" }, progress, watched)), [2, 6, 1]);
  assert.deepEqual(ids(arrange(items, { show: ["progress", "done"], sort: "suggested" }, progress, watched)), [5, 4, 3]);
  assert.deepEqual(ids(arrange(items, { show: ["progress", "new", "done"], sort: "newest" }, progress, watched)), [2, 3, 6, 5, 4, 1]);
  assert.deepEqual(ids(arrange(items, { show: ["progress", "new", "done"], sort: "oldest" }, progress, watched)), [1, 4, 5, 6, 3, 2]);
  assert.deepEqual(ids(arrange(items, { show: ["progress", "new", "done"], sort: "shortest" }, progress, watched)), [3, 1, 4, 5, 2, 6]);
  assert.deepEqual(ids(arrange(items, { show: ["progress", "new", "done"], sort: "longest" }, progress, watched)), [2, 5, 4, 1, 3, 6]);
});

test("a kept choice is made safe; the Filter button counts what differs from the default", () => {
  assert.deepEqual(cleanChoice(null), { show: ["progress", "new", "done"], sort: "suggested" });
  assert.deepEqual(cleanChoice({ show: ["done", "odd"], sort: "random" }), { show: ["done"], sort: "suggested" });
  assert.deepEqual(cleanChoice({ show: [], sort: "longest" }), { show: ["progress", "new", "done"], sort: "longest" }, "nothing ticked shows all");
  assert.equal(changedCount(cleanChoice(null)), 0);
  assert.equal(changedCount({ show: ["new"], sort: "longest" }), 2);
  assert.equal(changedCount(cleanChoice(null), "failed"), 1, "a transcription state chosen counts too");
});

test("every tab with a list is drawn as cards with the Filter (prototype library_feed), an audiobook's chapters keep the book's order", () => {
  assert.equal(typeof PROTOTYPES.library_feed.released, "boolean", "released for everybody in v0.67.0");
  assert.equal(PROTOTYPES.yt_feed, undefined, "the YouTube-only prototype became library_feed");
  const lib = src("web/js/pages/library.js");
  assert.match(lib, /if \(cardsShowing\(\)\) \{ await loadCards\(params, append\); return; \}/);
  assert.match(lib, /return !\(f && isAudiobookFeed\(f\.url\)\);/);
  assert.match(lib, /arranged = arrange\(pool, readChoice\(\), progressMap\(\), watchedNow\);/);
  assert.match(lib, /const choiceKey = \(\) => `libChoice:\$\{kind\}`;/, "remembered for each tab");
  assert.match(lib, /\$\("#lib-filter"\)\.onclick = openFilter;/);
  // The transcription states the pills had are in the popup, with their counts, still by the library's address.
  assert.match(lib, /for \(const \[v, label\] of states\) \{/);
  assert.match(lib, /if \(v\) keep\.set\("status", v\);/);
  // Finished is remembered for everything now, not videos alone: audio to its end, a page read, a book's last page.
  assert.match(src("web/js/pages/player.js"), /if \(atEnd\(audio\.currentTime \|\| 0, duration\)\) markWatched\(id\);/);
  assert.match(src("web/js/pages/player.js"), /audio\.addEventListener\("ended", \(\) => \{\n    markWatched\(id\);/);
  assert.match(src("web/js/pages/reader.js"), /if \(seen >= PAGE_DONE_FRACTION\) markWatched\(id\);/);
  assert.match(src("web/js/pages/book.js"), /if \(page \+ 1 >= pages\.length\) markWatched\(id\);/);
  assert.match(src("mobile/scripts/build-www.mjs"), /"js\/libsort\.js"/);
  // A narrow computer window: the list under the kinds, not squashed beside them.
  assert.match(src("web/css/app.css"), /\.library, \.library\.desk \{ grid-template-columns: 1fr;/);
});

test("the Filter popup keeps Reset and Done in sight on a short phone, and no heading promises newest first", () => {
  const lib = src("web/js/pages/library.js");
  assert.match(lib, /m\.body\.after\(body\.querySelector\("\.lf-foot"\)\);/, "the buttons sit under the scrolling list, not in it");
  const css = src("web/css/app.css");
  assert.match(css, /\.lib-filter-back \.modal-body \{ flex: 1 1 auto; min-height: 0;/);
  assert.match(css, /\.lib-filter-back \.modal-box > \.lf-foot \{ flex: none;/);
  assert.match(css, /\.lib-filter-back \.modal-box \{ max-height: 94vh; max-height: 94dvh; \}/);
  // The library's order is in progress, then new, then finished now: no heading may say "newest first".
  assert.doesNotMatch(lib, /newest first/);
});

// The owner, 2026-11-21: "buttons to select transcribed only podcasts … and watched versus not watched in my library".
test("the chips under a tab's heading: finished or not, and transcribed or not, in step with the Filter popup", () => {
  const lib = src("web/js/pages/library.js");
  assert.match(lib, /<div id="lib-head"><\/div>\s+<div class="lib-chips" id="lib-chips" hidden><\/div>/, "under the heading");
  // finished or not: the Filter's own Show choice, kept for the tab as the popup keeps it
  assert.match(lib, /chip\(doneWord\(kind\), p\.done, played === "done", \(\) => setShow\(\["done"\]\)\)/);
  assert.match(lib, /chip\(notDoneWord\(kind\), p\.progress \+ p\.new, played === "not", \(\) => setShow\(\["progress", "new"\]\)\)/);
  assert.match(lib, /const setShow = \(list\) => \{ keepChoice\(cleanChoice\(\{ \.\.\.c, show: list \}\)\); paintFilterButton\(\); loadEpisodes\(\); \};/);
  // transcribed or not: the address's status, as the popup's Transcription choice; only where things are transcribed
  assert.match(lib, /if \(transcribable\(kind\)\) \{\s+group\(t\("Transcription"\)/);
  assert.match(lib, /chip\(t\("Not transcribed"\), statusCount\(NOT_TRANSCRIBED\), filter === NOT_TRANSCRIBED/);
  assert.match(lib, /\[NOT_TRANSCRIBED, "Not transcribed"\]/, "the popup offers it too");
  // the library has no "not done" state: the list doesn't ask for it, and keeps what isn't done itself
  assert.match(lib, /if \(filter && filter !== NOT_TRANSCRIBED\) params\.set\("status", filter\);/);
  assert.match(lib, /const pool = filter === NOT_TRANSCRIBED \? all\.filter\(\(ep\) => ep\.status !== "done"\) : all;/);
  assert.match(lib, /arranged = arrange\(pool, readChoice\(\), progressMap\(\), watchedNow\);/);
  // a phone: the groups wrap, and one too wide scrolls sideways
  const css = src("web/css/app.css");
  assert.match(css, /\.lib-chips \{ display: flex; flex-wrap: wrap;/);
  assert.match(css, /\.lc-group \{ display: flex; gap: 4px; flex-wrap: nowrap; overflow-x: auto;/);
});

test("the chips' counts: what is in progress and new is not finished", () => {
  const items = [{ id: 1, duration: 100 }, { id: 2, duration: 100 }, { id: 3, duration: 100 }];
  const progress = new Map([["1", { id: 1, pos: 50, dur: 100, ts: 1 }], ["2", { id: 2, pos: 100, dur: 100, ts: 2 }]]);
  const states = items.map((ep) => stateOf(ep, progress.get(String(ep.id)) || null, new Set()));
  assert.deepEqual(states, ["progress", "done", "new"]);
  assert.deepEqual(arrange(items, cleanChoice({ show: ["progress", "new"] }), progress, new Set()).map((e) => e.id), [1, 3]);
  assert.deepEqual(arrange(items, cleanChoice({ show: ["done"] }), progress, new Set()).map((e) => e.id), [2]);
});

test("“Read” for a finished page or book is its own key, not the Read button's command (es Leído, not Leer)", () => {
  const lib = src("web/js/pages/library.js");
  assert.match(lib, /const readDone = \(\) => \{ const s = t\("Read \(finished\)"\); return s === "Read \(finished\)" \? "Read" : s; \};/);
  assert.match(lib, /const doneWord = \(k\) => \(\["pages", "books"\]\.includes\(k\) \? readDone\(\) :/);
  for (const [code, word] of [["es", "Leído"], ["ar", "تمت القراءة"], ["de", "Gelesen"], ["fr", "Lu"]]) {
    const d = JSON.parse(src(`web/i18n/${code}.json`));
    assert.equal(d["Read (finished)"], word, code);
  }
});

// The owner, 2026-11-21: "seems to be a problem with thumbnails flickering in podcasts".
test("covers don't flicker: a transcription's progress isn't a change, a redraw keeps the cards and pictures it already showed", () => {
  const lib = src("web/js/pages/library.js");
  // every progress tick carries the episode's state: it is compared with the last one heard, also for an episode not drawn
  assert.match(lib, /const prev = row \? row\._ep\.status : lastStatus\.has\(id\) \? lastStatus\.get\(id\) : listed\.get\(id\);/);
  assert.match(lib, /if \(e\.status\) lastStatus\.set\(id, e\.status\);/);
  assert.doesNotMatch(lib, /if \(filter \|\| !row\) scheduleReload\(\);/, "an episode not drawn no longer redraws the list");
  assert.match(lib, /if \(filter\) scheduleReload\(\);\s+else scheduleCounts\(\);/);
  // a card that would look the same is the same element (its picture already loaded)
  assert.match(lib, /reusable = new Map\(\[\.\.\.listEl\.querySelectorAll\("\.yt-card\[data-sig\]"\)\]\.map\(\(el\) => \[el\.dataset\.id, el\]\)\);/);
  assert.match(lib, /if \(kept && kept\.dataset\.sig === sig\) \{/);
  assert.match(lib, /row\.dataset\.sig = sig;/);
  // the heading's and the side lists' pictures, when the same, are put back rather than loaded again
  assert.match(lib, /keepPictures\(before, view\.querySelectorAll\(PICS\)\);/);
  assert.match(lib, /if \(!img\.complete \|\| !img\.naturalWidth\) continue;/);
});
