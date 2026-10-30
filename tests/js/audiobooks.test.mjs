// Audiobooks (LibriVox): the shared rules in web/js/audiobooks.js, and that they agree with the
// computer's twin (app/audiobooks.py, checked against the same cases in tests/test_audiobooks.py) and
// with the catalogue that tools/build_audiobooks.py publishes in docs/audiobooks.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import {
  ALL, CATEGORIES, bookFromRow, bookLength, booksIn, catalogueUrl, categoryOf, chapterCompare, isAudiobookFeed,
  librivoxIdOf, rssFor, searchKey, splitTitle, tidyTitle,
} from "../../web/js/audiobooks.js";
import { ICON_NAMES } from "../../web/js/icons.js";
import { parseFeed } from "../../mobile/src/js/rss.js";

const root = new URL("../../", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");

test("a LibriVox chapter feed is an audiobook; nothing else is", () => {
  assert.equal(rssFor(67), "https://librivox.org/rss/67");
  for (const url of ["https://librivox.org/rss/67", "http://www.librivox.org/rss/12345/", " https://librivox.org/rss/1 "]) {
    assert.ok(isAudiobookFeed(url), url);
  }
  for (const url of ["https://librivox.org/", "https://example.com/rss/67", "https://librivox.org/rss/abc", "local:audio", "", null]) {
    assert.ok(!isAudiobookFeed(url), String(url));
  }
  assert.equal(librivoxIdOf("https://librivox.org/rss/4667"), 4667);
  assert.equal(librivoxIdOf("https://example.com/feed"), null);
});

test("titles are tidied as the computer tidies them", () => {
  const cases = JSON.parse(read("tests/fixtures/audiobook_titles.json"));
  for (const [raw, tidy] of cases) assert.equal(tidyTitle(raw), tidy, raw);
  assert.deepEqual(splitTitle("Stand by Me by Some Author"), { title: "Stand by Me", author: "Some Author" });
  assert.deepEqual(splitTitle("Just a title"), { title: "Just a title", author: "" });
});

test("chapters are in order, 2 before 10, and the phone's feed reader keeps LibriVox's chapters", async () => {
  const feed = await parseFeed(read("tests/fixtures/librivox_rss.xml"));
  assert.equal(tidyTitle(feed.title), "The Divine Comedy by Dante Alighieri");
  assert.equal(feed.episodes.length, 3);
  assert.ok(feed.image.endsWith("The_Divine_Comedy_1005.jpg"));
  const shuffled = [feed.episodes[2], feed.episodes[0], feed.episodes[1]];
  assert.deepEqual([...shuffled].sort(chapterCompare).map((e) => e.duration), [2590, 2200, 1800]);
  // Same file name: the title decides.
  assert.ok(chapterCompare({ audio_url: "x/a.mp3", title: "Part 2" }, { audio_url: "x/a.mp3", title: "Part 10" }) < 0);
});

test("the catalogue's rows become books; search ignores case and accents", () => {
  const books = [
    [1, "Misérables", "Victor Hugo", 3600 * 50, 365, ["fiction"], "LibrivoxCdCoverArt1/x_thumb.jpg"],
    [2, "Poèmes", "Victor Hugo", 3000, 12, ["poetry"], ""],
    [3, "Odes", "Keats", 59, 1, ["poetry"], "https://example.org/c.jpg"],
  ].map(bookFromRow);
  assert.equal(books[0].cover, "https://archive.org/download/LibrivoxCdCoverArt1/x_thumb.jpg");
  assert.equal(books[1].cover, "");
  assert.equal(books[2].cover, "https://example.org/c.jpg");
  assert.deepEqual(booksIn(books, ALL, "").map((b) => b.id), [1, 2, 3]);
  assert.deepEqual(booksIn(books, "poetry", "").map((b) => b.id), [2, 3]);
  assert.deepEqual(booksIn(books, ALL, "miserables").map((b) => b.id), [1]);
  assert.deepEqual(booksIn(books, ALL, "hugo poemes").map((b) => b.id), [2]);
  assert.deepEqual(booksIn(books, "fiction", "keats"), []);
  assert.equal(searchKey("  Кни́га, Ἰλιάς!  "), "книга ιλιας");
  assert.equal(searchKey("كِتَابٌ"), "كتاب");
  assert.equal(bookLength(3600 * 50 + 60 * 7), "50 h 7 min");
  assert.equal(bookLength(59), "1 min");
});

test("the catalogue comes from the computer's own server, the website itself, or GitHub Pages", () => {
  assert.equal(catalogueUrl("index.json", { platform: "desktop" }), "/api/audiobooks/index.json");
  assert.equal(catalogueUrl("ar.json.gz", { platform: "web", host: "christiangilkey.github.io" }), "/tamkeen/audiobooks/ar.json.gz");
  assert.equal(catalogueUrl("ar.json.gz", { platform: "android" }), "https://christiangilkey.github.io/tamkeen/audiobooks/ar.json.gz");
  assert.equal(catalogueUrl("ar.json.gz", { platform: "android", base: "http://localhost:9/ab/" }), "http://localhost:9/ab/ar.json.gz");
});

test("every category has an icon, and the app and the catalogue builder have the same categories", () => {
  for (const c of CATEGORIES) assert.ok(ICON_NAMES.includes(c.icon), c.icon);
  assert.ok(ICON_NAMES.includes(categoryOf(ALL).icon));
  const py = read("tools/build_audiobooks.py");
  const keys = JSON.parse(/CATEGORY_KEYS = (\[[^\]]*\])/.exec(py)[1].replace(/\s+/g, " "));
  assert.deepEqual(CATEGORIES.map((c) => c.key), keys);
});

test("the published catalogue: one file per language, each book complete", { skip: !existsSync(new URL("docs/audiobooks/index.json", root)) }, () => {
  const index = JSON.parse(read("docs/audiobooks/index.json"));
  const known = new Set(CATEGORIES.map((c) => c.key));
  assert.ok(index.languages.en.count > 1000);
  for (const [code, entry] of Object.entries(index.languages)) {
    const data = JSON.parse(gunzipSync(readFileSync(new URL(`docs/audiobooks/${entry.file}`, root))).toString("utf8"));
    assert.equal(data.lang, code);
    assert.equal(data.books.length, entry.count, code);
    for (const row of data.books.slice(0, 200)) {
      const b = bookFromRow(row);
      assert.ok(b.id > 0 && b.title && b.secs > 0 && b.chapters > 0, `${code} ${row}`);
      for (const c of b.cats) assert.ok(known.has(c), c);
    }
  }
});

test("the Library has an Audiobooks kind and the + sheet an Audiobook way, in every version", () => {
  const library = read("web/js/pages/library.js");
  assert.match(library, /key: "audiobooks", label: "Audiobooks"/);
  assert.match(read("web/js/components/addsheet.js"), /key: "audiobook", label: "Audiobook"/);
  const build = read("mobile/scripts/build-www.mjs");
  for (const f of ["js/audiobooks.js", "js/components/audiobooksheet.js"]) assert.ok(build.includes(`"${f}"`), f);
  // The phone's stand-in for the computer's server lists a book's chapters in order and keeps books out of "All episodes".
  const backend = read("mobile/src/js/backend.js");
  assert.match(backend, /eps\.sort\(book \? chapterCompare/);
  assert.match(backend, /!isAudiobookFeed\(feedOf\(e\.feed_uid\)\.url\)/);
});

test(".m4b audiobook files are accepted wherever audio files are", () => {
  assert.match(read("web/js/pages/library.js"), /id="audio-file" accept="[^"]*\.m4b/);
  assert.match(read("mobile/src/js/app.js"), /AUDIO_EXT = \/\\\.\([^)]*m4b/);
  assert.match(read("mobile/src/js/rss.js"), /"\.m4b"/);
});
