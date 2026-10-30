// Audiobooks: the shared rules in web/js/audiobooks.js, and that they agree with the computer's twin
// (app/audiobooks.py and app/videos.py, checked against the same cases in tests/test_audiobooks.py) and with
// the LibriVox catalogue that tools/build_audiobooks.py publishes in docs/audiobooks.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import {
  AUDIBLE_MESSAGE, AUDIO_FILE_ACCEPT, AUDIO_FILE_EXTENSIONS, AUDIO_TYPES, bookFromRow, bookLength, booksIn, catalogueUrl,
  chapterCompare, chapterOrder, guessBookTitle, inNameOrder, isAudibleFile, isAudioFileName, isAudiobookFeed, isLibrivoxFeed,
  isOwnBookFeed, librivoxIdOf, rssFor, searchKey, splitTitle, tidyTitle, titleCompare,
} from "../../web/js/audiobooks.js";
import { ICON_NAMES } from "../../web/js/icons.js";
import { parseFeed } from "../../mobile/src/js/rss.js";

const root = new URL("../../", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");

test("LibriVox chapter feeds and the learner's own books are audiobooks; nothing else is", () => {
  assert.equal(rssFor(67), "https://librivox.org/rss/67");
  for (const url of ["https://librivox.org/rss/67", "http://www.librivox.org/rss/12345/", " https://librivox.org/rss/1 "]) {
    assert.ok(isAudiobookFeed(url) && isLibrivoxFeed(url), url);
  }
  assert.ok(isAudiobookFeed("local:audiobook:abc123") && isOwnBookFeed("local:audiobook:abc123"));
  assert.ok(!isLibrivoxFeed("local:audiobook:abc123"));
  for (const url of ["https://librivox.org/", "https://example.com/rss/67", "https://librivox.org/rss/abc", "local:audio", "", null]) {
    assert.ok(!isAudiobookFeed(url), String(url));
  }
  assert.equal(librivoxIdOf("https://librivox.org/rss/4667"), 4667);
  assert.equal(librivoxIdOf("https://example.com/feed"), null);
  assert.ok(ICON_NAMES.includes("audiobook"));
});

test("titles are tidied as the computer tidies them", () => {
  const cases = JSON.parse(read("tests/fixtures/audiobook_titles.json"));
  for (const [raw, tidy] of cases) assert.equal(tidyTitle(raw), tidy, raw);
  assert.deepEqual(splitTitle("Stand by Me by Some Author"), { title: "Stand by Me", author: "Some Author" });
  assert.deepEqual(splitTitle("Just a title"), { title: "Just a title", author: "" });
});

test("chapters are in order, 2 before 10: LibriVox's by file name, the learner's own by title", async () => {
  const feed = await parseFeed(read("tests/fixtures/librivox_rss.xml"));
  assert.equal(tidyTitle(feed.title), "The Divine Comedy by Dante Alighieri");
  assert.equal(feed.episodes.length, 3);
  assert.ok(feed.image.endsWith("The_Divine_Comedy_1005.jpg"));
  const shuffled = [feed.episodes[2], feed.episodes[0], feed.episodes[1]];
  assert.deepEqual([...shuffled].sort(chapterCompare).map((e) => e.duration), [2590, 2200, 1800]);
  assert.ok(chapterCompare({ audio_url: "x/a.mp3", title: "Part 2" }, { audio_url: "x/a.mp3", title: "Part 10" }) < 0);
  // Own files are stored under random names: their titles (the files' names) give the order.
  const own = [{ title: "Book 10", audio_url: "drive:v_a.mp3" }, { title: "Book 2", audio_url: "drive:v_z.mp3" }, { title: "Book 1", audio_url: "drive:v_m.mp3" }];
  assert.deepEqual([...own].sort(titleCompare).map((e) => e.title), ["Book 1", "Book 2", "Book 10"]);
  assert.equal(chapterOrder("local:audiobook:k"), titleCompare);
  assert.equal(chapterOrder("https://librivox.org/rss/1"), chapterCompare);
});

test("the learner's own files: the formats taken, Audible refused, name order, a title from the names", () => {
  for (const ext of [".m4b", ".mp3", ".m4a", ".aac", ".ogg", ".oga", ".opus", ".flac", ".wav", ".wma", ".amr", ".webm", ".mka", ".aiff"]) {
    assert.ok(isAudioFileName(`Book${ext.toUpperCase()}`), ext);
    assert.ok(AUDIO_FILE_ACCEPT.includes(ext), ext);
  }
  for (const name of ["book.aax", "book.AA", "book.aaxc"]) { assert.ok(isAudibleFile(name)); assert.ok(!isAudioFileName(name)); }
  assert.ok(!isAudioFileName("cover.jpg"));
  assert.match(AUDIBLE_MESSAGE, /copy-protected/);
  assert.deepEqual(inNameOrder([{ name: "Part 10.mp3" }, { name: "Part 2.mp3" }, { name: "Part 1.mp3" }]).map((f) => f.name),
    ["Part 1.mp3", "Part 2.mp3", "Part 10.mp3"]);
  assert.equal(guessBookTitle(["The_Hobbit.m4b"]), "The Hobbit");
  assert.equal(guessBookTitle(["Moby Dick - Part 01.mp3", "Moby Dick - Part 02.mp3", "Moby Dick - Part 10.mp3"]), "Moby Dick");
  assert.equal(guessBookTitle(["Dracula_Track01.mp3", "Dracula_Track02.mp3"]), "Dracula");
  assert.equal(guessBookTitle(["Harry Potter 1 - Chapter 1.mp3", "Harry Potter 1 - Chapter 2.mp3"]), "Harry Potter 1");
  assert.equal(guessBookTitle(["Dune CD1 - 01.mp3", "Dune CD2 - 01.mp3"]), "Dune");
  assert.equal(guessBookTitle([]), "");
});

test("the same audio formats everywhere: the computer's upload types, both feed readers, the Library's file chooser", () => {
  const py = read("app/videos.py");
  const pyTypes = Object.fromEntries([...(/AUDIO_TYPES = \{([\s\S]*?)\n\}/.exec(py)[1]).matchAll(/"(\.\w+)": "([^"]+)"/g)].map((m) => [m[1], m[2]]));
  assert.deepEqual(pyTypes, AUDIO_TYPES);
  const feedsPy = [...(/AUDIO_EXTENSIONS = \(([\s\S]*?)\)/.exec(read("app/feeds.py"))[1]).matchAll(/"(\.\w+)"/g)].map((m) => m[1]);
  const rssJs = [...(/AUDIO_EXTENSIONS = \[([\s\S]*?)\]/.exec(read("mobile/src/js/rss.js"))[1]).matchAll(/"(\.\w+)"/g)].map((m) => m[1]);
  assert.deepEqual(new Set(feedsPy), new Set([...AUDIO_FILE_EXTENSIONS, ".mp4"]));
  assert.deepEqual(new Set(rssJs), new Set([...AUDIO_FILE_EXTENSIONS, ".mp4"]));
  const phone = /const AUDIO_EXT = \/\\\.\(([^)]*)\)/.exec(read("mobile/src/js/app.js"))[1].split("|").map((e) => `.${e}`);
  assert.deepEqual(new Set([...phone, ".webm"]), new Set(AUDIO_FILE_EXTENSIONS)); // (.webm: a video unless added as an audiobook)
  assert.match(read("web/js/pages/library.js"), /id="audio-file" accept="\$\{AUDIO_FILE_ACCEPT\}"/);
});

test("LibriVox's catalogue rows become books; search ignores case and accents", () => {
  const books = [
    [1, "Misérables", "Victor Hugo", 3600 * 50, 365, "LibrivoxCdCoverArt1/x_thumb.jpg"],
    [2, "Poèmes", "Victor Hugo", 3000, 12, ""],
    [3, "Odes", "Keats", 59, 1, "https://example.org/c.jpg"],
  ].map(bookFromRow);
  assert.equal(books[0].cover, "https://archive.org/download/LibrivoxCdCoverArt1/x_thumb.jpg");
  assert.equal(books[1].cover, "");
  assert.equal(books[2].cover, "https://example.org/c.jpg");
  assert.deepEqual(booksIn(books, "").map((b) => b.id), [1, 2, 3]);
  assert.deepEqual(booksIn(books, "miserables").map((b) => b.id), [1]);
  assert.deepEqual(booksIn(books, "hugo poemes").map((b) => b.id), [2]);
  assert.deepEqual(booksIn(books, "nothing"), []);
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

test("the published catalogue: one file per language, each book complete", { skip: !existsSync(new URL("docs/audiobooks/index.json", root)) }, () => {
  const index = JSON.parse(read("docs/audiobooks/index.json"));
  assert.ok(index.languages.en.count > 1000);
  for (const [code, entry] of Object.entries(index.languages)) {
    const data = JSON.parse(gunzipSync(readFileSync(new URL(`docs/audiobooks/${entry.file}`, root))).toString("utf8"));
    assert.equal(data.lang, code);
    assert.equal(data.books.length, entry.count, code);
    for (const row of data.books.slice(0, 200)) {
      assert.equal(row.length, 6);
      const b = bookFromRow(row);
      assert.ok(b.id > 0 && b.title && b.secs > 0 && b.chapters > 0, `${code} ${row}`);
    }
  }
});

test("the Library has an Audiobooks kind and the + sheet an Audiobook way, in every version", () => {
  const library = read("web/js/pages/library.js");
  assert.match(library, /key: "audiobooks", label: "Audiobooks"/);
  assert.match(library, /addAudiobookFiles: addBookFiles/);
  const sheet = read("web/js/components/addsheet.js");
  assert.match(sheet, /key: "audiobook", label: "Audiobook"/);
  const step = read("web/js/components/audiobooksheet.js");
  assert.match(step, /LIBRO_FM/);
  assert.match(step, /multiple: true/);
  assert.match(step, /LibriVox has no free audiobooks in this language yet\./);
  const build = read("mobile/scripts/build-www.mjs");
  for (const f of ["js/audiobooks.js", "js/components/audiobooksheet.js"]) assert.ok(build.includes(`"${f}"`), f);
  // The phone's stand-in for the computer's server: a book's chapters in order, books out of "All episodes",
  // and a book of the user's own files in a list of its own.
  const backend = read("mobile/src/js/backend.js");
  assert.match(backend, /chapterOrder\(bookUrl\)/);
  assert.match(backend, /!isAudiobookFeed\(feedOf\(e\.feed_uid\)\.url\)/);
  assert.match(backend, /OWN_BOOK_PREFIX \+ book\.key/);
  assert.match(read("mobile/src/js/app.js"), /if \(isAudibleFile\(file\.name\)\) throw new Error\(AUDIBLE_MESSAGE\)/);
});
