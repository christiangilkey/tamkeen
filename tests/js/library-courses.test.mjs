// The courses live in the Library, under "Courses", the first kind and the one the Library opens on
// (pages/library.js); the Vocab page is the learner's own words only. The pages need a browser, so
// these read their source.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const library = read("web/js/pages/library.js");
const vocab = read("web/js/pages/vocab.js");

test("Courses is the Library's first kind", () => {
  const kinds = library.slice(library.indexOf("const KINDS = ["), library.indexOf("];", library.indexOf("const KINDS = [")));
  const keys = [...kinds.matchAll(/key: "(\w+)"/g)].map((m) => m[1]);
  assert.equal(keys[0], "courses");
  assert.equal(keys[1], "podcasts");
  assert.match(kinds, /key: "courses"[^}]*href: "#\/library"/);
  assert.match(kinds, /key: "podcasts"[^}]*href: "#\/library\?show=podcasts"/);
});

test("the Library opens on Courses; a podcast's own page still counts as Podcasts", () => {
  assert.match(library, /let kind = [^;]*: feedId \? "podcasts" : "courses";/);
  assert.match(library, /\|\| \{ key: "podcasts" \}\)\.key/);
});

test("links meant for the podcasts say so (plain #/library is now Courses)", () => {
  assert.match(library, /href="#\/library\?show=podcasts"><div class="ph all">\$\{icon\("podcast", 22\)\}<\/div><div><div class="t">All episodes/);
  assert.match(library, /new URLSearchParams\(feedId \? \{\} : \{ show: "podcasts" \}\)/);
  for (const [page, show] of [["books", "books"], ["discover", "podcasts"], ["reels", "reels"], ["websites", "pages"]]) {
    assert.match(read(`web/js/pages/${page}.js`), new RegExp(`href="#/library\\?show=${show}" title="Back to the library"`), page);
  }
});

test("Courses shows the basics and grammar panels, and no episodes", () => {
  assert.match(library, /import \{ coursePanel, hasCourse \} from "\.\.\/components\/coursepanel\.js";/);
  assert.match(library, /import \{ grammarFor, grammarPanel \} from "\.\.\/components\/grammarpanel\.js";/);
  assert.match(library, /if \(kind === "courses"\) return; \/\/ no episodes/);
  assert.match(library, /data-tab="basics"/);
  assert.match(library, /data-tab="grammar"/);
});

test("the Vocab page no longer hosts the courses", () => {
  assert.doesNotMatch(vocab, /coursepanel|grammarpanel|id="vtabs"|data-tab="basics"/);
});

test("Courses is translated into every language the app speaks", () => {
  const strings = JSON.parse(read("tools/i18n/strings.json"));
  assert.ok(strings.some((s) => s.k === "Courses"), "extracted");
  for (const code of ["ar", "ca", "ceb", "de", "es", "fa", "fr", "hi", "it", "ja", "ko", "pt", "ru", "th", "tl", "zh"]) {
    const dict = JSON.parse(read(`web/i18n/${code}.json`));
    assert.ok(dict.Courses, code);
  }
});
