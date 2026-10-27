// Run with: node --test tests/js/
// The page guides (web/js/components/tour.js): every screen gives the "?" in the top bar its guide,
// the players' guide walks through tapping, holding and sliding, the word popup and its source, and
// the "?" is in the top bar of every version.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

test("every screen gives the ? its guide", () => {
  const pages = { player: "player", reels: "reel", reader: "reader", book: "book", discover: "discover", books: "books",
    websites: "sites", search: "search", chat: "chat", about: "about", review: "review" };
  for (const [file, page] of Object.entries(pages)) {
    assert.match(read(`web/js/pages/${file}.js`), new RegExp(`pageGuide\\("${page}", `), file);
  }
  assert.match(read("web/js/pages/reels.js"), /pageGuide\("reels", /, "getting reels");
  assert.match(read("web/js/components/settingsui.js"), /pageGuide\("settings", page, /);
  assert.match(read("web/js/components/settingsui.js"), /pageGuide\("settings-section", page, /);
  for (const page of ["home", "library", "vocab", "friends"]) {
    assert.match(read(`web/js/pages/${page}.js`), new RegExp(`firstVisitTour\\("${page}", `), page);
  }
  // (a first-visit guide also gives the ? its guide, unless a fuller one was given to that screen)
  assert.match(read("web/js/components/tour.js"), /if \(!guides\.some\(\(g\) => g\.root === root\)\) pageGuide\(page, root, steps\);/);
});

test("the ? is in the top bar of every version, and in the reviewer", () => {
  assert.match(read("web/js/app.js"), /mountHelpButton\(document\.querySelector\("\.topbar"\)\);/);
  assert.match(read("mobile/src/js/app.js"), /mountHelpButton\(document\.querySelector\("\.topbar"\), refresh\);/);
  assert.match(read("mobile/scripts/build-www.mjs"), /"js\/components\/helpbutton\.js",/);
  assert.match(read("mobile/scripts/build-www.mjs"), /"js\/components\/guideart\.js",/);
  assert.match(read("web/js/components/helpbutton.js"), /b\.onclick = \(\) => showGuide\(\);/);
  assert.match(read("web/js/pages/review.js"), /\$\("\.rv-help"\)\.onclick = \(\) => showGuide\(\);/);
});

test("the players' guide shows the gestures, the popup and where a meaning comes from", async () => {
  const art = read("web/js/components/guideart.js");
  assert.match(art, /demo: "tap", title: "Tap a word"/);
  assert.match(art, /demo: "drag", title: "Several words at once"/);
  for (const title of ["The word popup", "The popup's buttons", "Who explained it", "Change the source", "Quick or detailed"]) {
    assert.ok(art.includes(`title: "${title}"`), title);
  }
  assert.match(art, /Built-in dictionary", "Wiktionary/);
  const tour = read("web/js/components/tour.js");
  assert.match(tour, /hand\.className = `tour-hand \$\{s\.demo\}`;/);
  assert.match(read("web/css/app.css"), /@keyframes tour-drag \{/);
});
