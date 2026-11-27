// Home is "Games" and Library is "Content" (prototype "games_content"; the owner, 2026-11-27: "maybe we should rename
// the home page to games", "Library can be renamed to content", and "I also don't think the good morning thing in the
// home page is necessary"), and "Continue" moves from Home to the Library's Home (with "library_home": "have the last
// thing we listened to/used be on the library home page"). The pages need a browser, so most of this reads the source.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PROTOTYPES } from "../../web/js/prototype.js";
import { tabName } from "../../web/js/tabnames.js";

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

test("released for everybody in v0.78.0: Home is Games and Library is Content", () => {
  assert.equal(PROTOTYPES.games_content.released, true, "released for everybody in v0.78.0");
  assert.equal(tabName("home", "Home"), "Games");
  assert.equal(tabName("library", "Library"), "Content");
  assert.equal(tabName("vocab", "Vocab"), "Vocab");
  const tabs = read("web/js/tabnames.js");
  assert.match(tabs, /key === "home" \? t\("Games"\) : key === "library" \? t\("Content"\) : name/);
});

test("the tabs are renamed in every version, their addresses unchanged", () => {
  for (const f of ["web/js/app.js", "mobile/src/js/app.js"]) assert.match(read(f), /applyTabNames\(\); \/\/ \(Home → Games, Library → Content/, f);
  assert.match(read("web/index.html"), /<a href="#\/" data-nav="home">Home<\/a>/, "the address stays #/");
  assert.match(read("mobile/src/index.html"), /<a href="#\/library" data-nav="library">/);
  const build = read("mobile/scripts/build-www.mjs");
  for (const f of ["js/tabnames.js", "js/components/continuecard.js"]) assert.ok(build.includes(`"${f}"`), f);
  assert.match(read("web/js/padmap.js"), /get title\(\) \{ return tabName\("home", "Home"\); \}/, "Settings → Controller too");
});

test("Home: no greeting with the prototype; Continue goes to the Library's Home", () => {
  const home = read("web/js/pages/home.js");
  assert.match(home, /const greet = !feature\("games_content"\);/);
  assert.match(home, /\$\{greet \? `<div><div class="hero-ar ar"/);
  assert.match(home, /const moved = feature\("library_home"\);\s*if \(!moved && await continueInto\(main, more, 3\)\)/);
  const library = read("web/js/pages/library.js");
  assert.match(library, /continueInto\(box\.querySelector\("\.lh-cmain"\), box\.querySelector\("\.lh-cmore"\), 3\)/);
  assert.ok(library.indexOf('<section class="lh-continue" hidden>') < library.indexOf('<div class="lh-mapbox"></div>'), "above the map");
});
