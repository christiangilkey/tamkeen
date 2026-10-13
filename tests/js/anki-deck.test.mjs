// The phone builds the Anki deck file (.apkg) itself: it cuts each word's audio out of the
// episode's audio copy, writes the deck's database and packs everything into one file.
// These tests check each piece, and that the deck holds what the computer's deck holds
// (tests/fixtures/parity.json `ankiDeck` is written from the Python builder).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cutOggOpus, oggOpusInfo, packetSamples } from "../../mobile/src/js/ogg-clip.js";
import { sqliteFile } from "../../mobile/src/js/sqlite-file.js";
import { DECK_ID, FONT_NAME, MODEL_ID, buildDeck, cardSchedule, collectionJson, dayNumber, zip } from "../../mobile/src/js/anki-deck.js";
import { clipRanges, vocabDeck } from "../../mobile/src/js/anki-export.js";

const fixture = (name) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url));
const py = JSON.parse(fixture("parity.json").toString("utf8")).ankiDeck;
const tone = new Uint8Array(fixture("tone.ogg"));  // 10 s test tone, as the computer's sync copy stores audio
const card = (name) => readFileSync(new URL(`../../web/anki-card/${name}`, import.meta.url), "utf8");
const layout = { front: card("front.html"), back: card("back.html"), css: card("style.css") };
const font = new Uint8Array(readFileSync(new URL("../../web/fonts/NotoNaskhArabic.woff2", import.meta.url)));
// The same word list as tests/js/mobile-parity.test.mjs.
const vocab = [
  { uid: "v1", text: "كتاب", sentence: "هذا كتاب جميل", meaning: 'book, "tome"', notes: "n.", episode_title: "Ep", start: 65.0, end: 65.5 },
  { uid: "v2", text: "مُرْتَبِكَة", sentence: "كانت البنت مرتبكة من <السؤال>.", meaning: "confused", episode_title: "Ep", start: null, end: null,
    notes: "Dictionary form: اِرْتَبَكَ · Root: ر ب ك · adjective · Common in everyday speech.\nheard in ep. 3",
    translation: "The girl [Sara] was ⟦confused⟧ by the <question>." },
  { uid: "v3", text: "قلم", sentence: "", meaning: "", notes: "my own note", episode_title: "", start: null, end: null },
  { uid: "v4", text: "هون", sentence: "انتي جديدة هون؟", meaning: "here", notes: "", episode_title: "", start: null, end: null,
    translation: "Are you new here?" },
  { uid: "v5", text: "هون", sentence: "انتي جديدة هون؟", meaning: "here", notes: "", episode_title: "", start: null, end: null,
    translation: "Are you ⟧new⟦ ⟦here?" },
];

// Node's own SQLite reads the files back. (Older Node versions don't have it; those checks are skipped.)
const sqlite = await import("node:sqlite").catch(() => null);
const needsSqlite = { skip: sqlite ? false : "this Node has no built-in SQLite" };
function open(bytes) {
  const path = join(mkdtempSync(join(tmpdir(), "tk-deck-")), "test.db");
  writeFileSync(path, bytes);
  return new sqlite.DatabaseSync(path);
}
const rows = (db, sql) => db.prepare(sql).all().map((r) => Object.values(r));

/** The files inside a zip made by `zip`: { name: bytes }. */
function unzip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset), end = bytes.length - 22, out = {};
  assert.equal(view.getUint32(end, true), 0x06054b50, "the zip ends with its directory");
  let at = view.getUint32(end + 16, true);
  for (let i = 0; i < view.getUint16(end + 10, true); i++) {
    const size = view.getUint32(at + 20, true), nameLength = view.getUint16(at + 28, true), local = view.getUint32(at + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLength));
    const data = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    out[name] = bytes.subarray(data, data + size);
    at += 46 + nameLength;
  }
  return out;
}

// ----- cutting audio -----

test("a clip is exactly the stretch asked for", () => {
  const [mid, start, word, tail] = cutOggOpus(tone, [[2.0, 3.5], [0, 0.6], [4.95, 5.72], [9.5, 20]]);
  for (const [clip, seconds] of [[mid, 1.5], [start, 0.6], [word, 0.77]]) {
    const info = oggOpusInfo(clip);
    assert.ok(info.intact && info.ended, "every page checks out and the file is closed properly");
    assert.ok(Math.abs(info.seconds - seconds) < 0.0005, `${info.seconds} s for ${seconds} s`);
  }
  // A little earlier sound is included for the decoder to settle on, marked as not to be played.
  assert.ok(oggOpusInfo(mid).skip >= 3840 && oggOpusInfo(mid).skip < 3840 + 2880);
  assert.ok(mid.length < tone.length / 4, "a clip is a small part of the file");
  // Asking past the end gives what there is.
  const rest = oggOpusInfo(tail).seconds;
  assert.ok(rest > 0.49 && rest < 0.53, `${rest} s left after 9.5 s`);
});

test("nothing to cut gives null, not a broken file", () => {
  assert.deepEqual(cutOggOpus(tone, [[30, 31]]), [null]);
  assert.deepEqual(cutOggOpus(new Uint8Array([1, 2, 3, 4, 5]), [[0, 1]]), [null]);
  assert.deepEqual(cutOggOpus(new TextEncoder().encode("ID3 this is an mp3, not ogg ".repeat(40)), [[0, 1], [1, 2]]), [null, null]);
});

test("packet lengths are read from the packet's first bytes", () => {
  assert.equal(packetSamples(new Uint8Array([0x78])), 960);        // one 20 ms frame
  assert.equal(packetSamples(new Uint8Array([0x79])), 1920);       // two of them
  assert.equal(packetSamples(new Uint8Array([0x7b, 0x03])), 2880); // three, counted in the second byte
  assert.equal(packetSamples(new Uint8Array([0x08])), 960);        // a 20 ms speech-mode frame
  assert.equal(packetSamples(new Uint8Array([0x80])), 120);        // a 2.5 ms frame
});

test("a word's clips have a little air around them", () => {
  const near = (got, want) => got.forEach((x, i) => assert.ok(Math.abs(x - want[i]) < 1e-9, `${got} is not ${want}`));
  const ranges = clipRanges({ start: 5, end: 5.6, sent_start: 4.5, sent_end: 7.5 });
  near(ranges.word, [4.95, 5.72]);
  near(ranges.sentence, [4.2, 7.95]);
  near(clipRanges({ start: 5, end: null, sent_start: null }).word, [4.95, 6.12]);
  assert.deepEqual(clipRanges({ start: null, sent_start: null }), {});
});

// ----- writing the database -----

test("the database file reads back in SQLite", needsSqlite, () => {
  const long = "م".repeat(9000) + "end";  // 18 KB: far more than one page
  const edge = [4000, 4050, 4056, 4057, 4058, 4059, 4060, 4061, 4062, 4500, 8200].map((n) => "x".repeat(n));
  const db = open(sqliteFile([
    { name: "things", sql: "CREATE TABLE things (id integer primary key, n integer not null, t text not null)",
      rows: [{ id: 1, values: [null, 0, ""] }, { id: 2, values: [null, 1, "قلم"] }, { id: 5, values: [null, -1, long] },
        { id: 1800000000000, values: [null, 1800000000000123, "big ids"] }] },
    { name: "edges", sql: "CREATE TABLE edges (id integer primary key, t text)", rows: edge.map((t, i) => ({ id: i + 1, values: [null, t] })) },
    { name: "many", sql: "CREATE TABLE many (id integer primary key, n integer, t text)",
      rows: Array.from({ length: 30000 }, (_, i) => ({ id: i * 3 + 1, values: [null, i - 15000, `row ${i} ${"y".repeat(i % 90)}`] })) },
    { name: "empty", sql: "CREATE TABLE empty (a integer, b text)", rows: [] },
  ]));
  assert.deepEqual(rows(db, "PRAGMA integrity_check"), [["ok"]]);
  assert.deepEqual(rows(db, "SELECT id, n, t FROM things ORDER BY id"),
    [[1, 0, ""], [2, 1, "قلم"], [5, -1, long], [1800000000000, 1800000000000123, "big ids"]]);
  assert.deepEqual(rows(db, "SELECT length(t) FROM edges ORDER BY id").flat(), edge.map((t) => t.length));
  assert.deepEqual(rows(db, "SELECT count(*), sum(n), min(id), max(id) FROM many"), [[30000, -15000, 1, 89998]]);
  assert.deepEqual(rows(db, "SELECT n, t FROM many WHERE id = 60001"), [[5000, "row 20000 " + "y".repeat(20)]]);
  assert.deepEqual(rows(db, "SELECT count(*) FROM empty"), [[0]]);
  db.close();
});

test("a zip holds its files unchanged", () => {
  const files = unzip(zip([["a.txt", new TextEncoder().encode("hello")], ["0", new Uint8Array([0, 255, 7])], ["none", new Uint8Array(0)]]));
  assert.deepEqual(Object.keys(files).sort(), ["0", "a.txt", "none"]);
  assert.equal(files.none.length, 0);
  assert.equal(new TextDecoder().decode(files["a.txt"]), "hello");
  assert.deepEqual([...files["0"]], [0, 255, 7]);
});

// ----- the deck -----

test("the deck's settings match the computer's", () => {
  const [conf, models, decks, dconf] = collectionJson({ front: "", back: "", css: "" }, py.now);
  const same = (js, python) => assert.deepEqual(JSON.parse(JSON.stringify(js)), python);
  same(conf, py.col.conf);
  same(models, py.col.models);
  same(decks, py.col.decks);
  same(dconf, py.col.dconf);
  const real = collectionJson(layout, py.now)[1][MODEL_ID];
  assert.ok(real.tmpls[0].qfmt.includes("{{edit:Front}}") && real.tmpls[0].afmt.includes("{{edit:image}}") && real.css.includes(FONT_NAME));
});

test("the phone's deck holds the same notes and cards as the computer's", needsSqlite, async () => {
  const files = unzip(await buildDeck(vocab, {}, layout, font, py.now, py.review, py.today));
  assert.deepEqual(JSON.parse(new TextDecoder().decode(files.media)), py.media);
  assert.deepEqual(files[0], font);
  const db = open(files["collection.anki2"]);
  assert.deepEqual(rows(db, "PRAGMA integrity_check"), [["ok"]]);
  assert.deepEqual(rows(db, "SELECT * FROM notes ORDER BY id"), py.notes);
  assert.deepEqual(rows(db, "SELECT * FROM cards ORDER BY id"), py.cards);
  assert.deepEqual(rows(db, "SELECT crt, mod, scm, ver, dty, usn, ls FROM col"), [py.col.numbers]);
  const [[models, tags]] = rows(db, "SELECT models, tags FROM col");
  assert.equal(tags, py.col.tags);
  assert.equal(JSON.parse(models)[MODEL_ID].tmpls[0].qfmt, layout.front, "the card layout travels in the deck");
  assert.deepEqual(rows(db, "SELECT count(*) FROM revlog"), [[0]]);
  db.close();
});

test("a word's review progress becomes Anki's schedule, exactly as on the computer", () => {
  for (const [progress, expected] of py.schedule) assert.deepEqual(cardSchedule(progress, py.today, 7), expected, JSON.stringify(progress));
  // [type, queue, due, interval, ease, reviews, lapses]: box 3, due in 4 days, 6 right and 1 wrong.
  assert.deepEqual(cardSchedule([3, py.today + 4, 6, 1], py.today, 7), [2, 2, 4, 4, 2500, 7, 1]);
  assert.equal(dayNumber(new Date(2026, 9, 12, 23, 59)) - dayNumber(new Date(2026, 9, 12, 0, 1)), 0, "a day is a local calendar day");
  assert.equal(dayNumber(new Date(2026, 9, 13, 0, 1)) - dayNumber(new Date(2026, 9, 12, 23, 59)), 1);
});

test("words take their audio into the deck", needsSqlite, async () => {
  const words = [
    { uid: "a1", text: "كتاب", sentence: "هذا كتاب جميل", meaning: "book", notes: "", start: 5.0, end: 5.6, sent_start: 4.5, sent_end: 7.5, episode_uid: "e1" },
    { uid: "a2", text: "قلم", sentence: "", meaning: "pen", notes: "", start: 1.0, end: null, sent_start: null, sent_end: null, episode_uid: "e1" },
    { uid: "a3", text: "باب", sentence: "", meaning: "door", notes: "", start: 2.0, end: 2.4, sent_start: 1.5, sent_end: 3.0, episode_uid: "gone" },
    { uid: "a4", text: "بيت", sentence: "", meaning: "house", notes: "", start: 2.0, end: 2.4, sent_start: 1.5, sent_end: 3.0, episode_uid: "broken" },
    { uid: "a5", text: "نهر", sentence: "", meaning: "river", notes: "", start: null, end: null, sent_start: null, sent_end: null, episode_uid: "e1" },
  ];
  let loads = 0;
  const steps = [];
  const files = unzip(await vocabDeck(words, {
    asset: async (path) => new Response(path.startsWith("fonts/") ? font : card(path.split("/")[1])),
    review: { a2: [2, dayNumber(new Date()) + 2, 2, 0] },
    audioFor: async (v) => v.episode_uid === "gone" ? null : {
      key: v.episode_uid,
      load: async () => { loads++; if (v.episode_uid === "broken") throw new Error("offline"); return new Blob([tone]); },
    },
  }, (done, total) => steps.push(`${done}/${total}`)));
  assert.equal(loads, 2, "each audio file is opened once, however many words come from it");
  assert.deepEqual(steps, ["1/2", "2/2"]);
  const media = JSON.parse(new TextDecoder().decode(files.media));
  assert.deepEqual(Object.values(media), [FONT_NAME, "tk-a1-w.ogg", "tk-a1-s.ogg", "tk-a2-w.ogg"]);
  const seconds = Object.fromEntries(Object.entries(media).slice(1).map(([number, name]) => {
    const info = oggOpusInfo(files[number]);
    assert.ok(info.intact && info.ended, name);
    return [name, Math.round(info.seconds * 100) / 100];
  }));
  assert.deepEqual(seconds, { "tk-a1-w.ogg": 0.77, "tk-a1-s.ogg": 3.75, "tk-a2-w.ogg": 1.17 });
  const db = open(files["collection.anki2"]);
  const sound = Object.fromEntries(rows(db, "SELECT guid, flds FROM notes").map(([guid, flds]) => [guid, flds.split("\x1f").slice(2)]));
  assert.deepEqual(sound, {
    "tk-a1": ["", "[sound:tk-a1-w.ogg][sound:tk-a1-s.ogg]"], "tk-a2": ["", "[sound:tk-a2-w.ogg]"],
    "tk-a3": ["", ""], "tk-a4": ["", ""], "tk-a5": ["", ""],  // the image field is never written
  });
  // a2 is in the app's box 2, due in two days; the others have never been reviewed.
  assert.deepEqual(rows(db, "SELECT did, ord, type, queue, due, ivl, factor, reps, lapses FROM cards ORDER BY id"),
    words.map((w, i) => (w.uid === "a2" ? [DECK_ID, 0, 2, 2, 2, 2, 2500, 2, 0] : [DECK_ID, 0, 0, 0, i + 1, 0, 0, 0, 0])));
  db.close();
});

// ----- words that have been through the vocab reviewer -----
// tests/fixtures/fsrs_parity.json `deck` is what the computer's builder writes for these words
// (tests/test_fsrs.py): their notes with the learner's own notes on the back, and for the words
// with answers on record, Anki's schedule, its memory state and its review log.
test("reviewed words take the same schedule, memory state and review log as on the computer", needsSqlite, async () => {
  const { ankiCard } = await import("../../web/js/review/fsrs.js");
  const fx = JSON.parse(fixture("fsrs_parity.json").toString("utf8"));
  const files = unzip(await buildDeck(fx.words, {}, layout, font, fx.now, fx.review, fx.today,
    (uid, today) => ankiCard(fx.reviews[uid], today)));
  const db = open(files["collection.anki2"]);
  assert.deepEqual(rows(db, "PRAGMA integrity_check"), [["ok"]]);
  assert.deepEqual(rows(db, "SELECT * FROM notes ORDER BY id"), fx.deck.notes);
  assert.deepEqual(rows(db, "SELECT * FROM cards ORDER BY id"), fx.deck.cards);
  assert.deepEqual(rows(db, "SELECT * FROM revlog ORDER BY id"), fx.deck.revlog);
  assert.equal(fx.deck.revlog.length, 8);
  assert.ok(rows(db, "SELECT flds FROM notes ORDER BY id")[0][0].includes("<br>Note: sounds like &#x27;kit-tab&#x27;: a kit of tabs<br>my uncle&#x27;s shop"));
  db.close();
});
