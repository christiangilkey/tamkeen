// Sending a Library item to a friend with its transcript (web/js/sharetext.js): packing what the
// sender has, the file that travels, unpacking it on the friend's side, and putting it in their
// library through the right route for each kind.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FORMAT, MAX_FILE_BYTES, acceptInto, asBlocks, gunzipText, gzipText, packTranscript, sharedBookGuid, unpackTranscript, wordCount,
} from "../../web/js/sharetext.js";

// GET /episodes/<id>/transcript as the computer answers it: segment idx are the database's own
// numbers (here starting at 5), words name their segment by that idx.
const PODCAST = {
  episode: { id: 7, model: "large-v3-turbo", language: "ar", status: "done" },
  segments: [
    { idx: 5, start: 0, end: 1.5, text: "مرحبا بكم", kind: null },
    { idx: 6, start: 1.6, end: 3.0004, text: "في المطبخ", kind: null },
    { idx: 7, start: 3.1, end: 3.2, text: "   ", kind: null },
  ],
  words: { start: [0, 0.8, 1.6, 2.2], end: [0.7, 1.5, 2.1, 3.0004], text: ["مرحبا", "بكم", "في", "المطبخ"], seg: [5, 5, 6, 6] },
};
// A web page as the phone answers it (idx = position, kind = the block's type).
const PAGE = {
  episode: { id: "e1", model: "webpage", language: "es" },
  segments: [{ idx: 0, start: 0, end: 2, text: "El café", kind: "h1" }, { idx: 1, start: 2, end: 9, text: "Una bebida   muy popular.", kind: "p" },
             { idx: 2, start: 9, end: 9, text: "", kind: "p" }],
  words: { start: [0, 1, 2], end: [1, 2, 3], text: ["El", "café", "Una"], seg: [0, 0, 1] },
};

/** A stand-in for app.js's api(): records each call and answers like the routes do. */
function fakeApi(answers = {}) {
  const calls = [];
  const api = async (path, opts = {}) => {
    calls.push({ path, method: opts.method || "GET", body: opts.body });
    if (answers[path]) return answers[path](opts.body);
    return { id: 42, language: (opts.body && (opts.body.language || opts.body.lang)) || "ar" };
  };
  return { api, calls };
}

test("a podcast's transcript is packed with each word under its own sentence", () => {
  const p = packTranscript(PODCAST);
  assert.equal(p.format, FORMAT);
  assert.equal(p.v, 1);
  assert.equal(p.model, "large-v3-turbo");
  assert.equal(p.language, "ar");
  assert.equal(p.segments.length, 2, "the empty sentence is left out");
  assert.deepEqual(p.segments[0], { start: 0, end: 1.5, text: "مرحبا بكم", words: [[0, 0.7, "مرحبا"], [0.8, 1.5, "بكم"]] });
  assert.equal(p.segments[1].end, 3, "times rounded to the millisecond");
  assert.equal(wordCount(p), 4);
});

test("a page or book is packed as its text, block by block, keeping headings", () => {
  const p = packTranscript(PAGE, { asText: true });
  assert.deepEqual(p.blocks, [{ kind: "h1", text: "El café" }, { kind: "p", text: "Una bebida muy popular." }]);
  assert.equal(p.segments, undefined);
  assert.equal(p.language, "es");
  assert.equal(packTranscript({ episode: {}, segments: [], words: {} }), null, "nothing to send");
  assert.equal(packTranscript(null), null);
});

test("the file that travels unpacks to exactly what was packed", async () => {
  for (const packed of [packTranscript(PODCAST), packTranscript(PAGE, { asText: true })]) {
    const file = await gzipText(packed);
    assert.equal(file.type, "application/gzip");
    const bytes = new Uint8Array(await file.arrayBuffer());
    assert.deepEqual([bytes[0], bytes[1]], [0x1f, 0x8b], "really gzipped");
    const back = unpackTranscript(await gunzipText(file));
    assert.deepEqual(back, { model: packed.model, language: packed.language, ...(packed.segments ? { segments: packed.segments } : { blocks: packed.blocks }) });
  }
  // A plain JSON file is read too.
  const plain = new Blob([JSON.stringify(packTranscript(PODCAST))]);
  assert.equal(unpackTranscript(await gunzipText(plain)).segments.length, 2);
});

test("a long podcast compresses far below the online storage's limit", async () => {
  // An hour of speech: about 9,000 words in 900 sentences.
  const segments = [], W = { start: [], end: [], text: [], seg: [] };
  for (let i = 0; i < 900; i++) {
    segments.push({ idx: i, start: i * 4, end: i * 4 + 3.9, text: "كلمة ".repeat(10).trim() });
    for (let j = 0; j < 10; j++) { W.start.push(i * 4 + j * 0.39); W.end.push(i * 4 + j * 0.39 + 0.3); W.text.push("كلمة"); W.seg.push(i); }
  }
  const packed = packTranscript({ episode: { model: "x", language: "ar" }, segments, words: W });
  const file = await gzipText(packed);
  assert.ok(file.size < MAX_FILE_BYTES / 10, `${file.size} bytes`);
  assert.ok(file.size < JSON.stringify(packed).length / 4, "smaller than the text itself");
});

test("whatever a friend sent is checked: junk dropped, wrong files refused, older apps' words understood", () => {
  assert.equal(unpackTranscript(null), null);
  assert.equal(unpackTranscript([]), null);
  assert.equal(unpackTranscript({ format: "something-else", segments: [{ text: "x" }] }), null);
  assert.equal(unpackTranscript({ format: FORMAT, segments: [], blocks: [] }), null);
  const t = unpackTranscript({
    format: FORMAT, model: "m".repeat(200), language: "../../x",
    segments: [{ start: "x", end: -5, text: "  two   words ", words: [[1, 0.5, " a b "], ["bad"], [2, 3, ""], "nope"] },
               "not a segment", { text: "", words: [] }, { start: 4, end: 5, text: "", words: [[4, 5, "kept"]] }],
    blocks: [{ kind: "script", text: "<b>bold</b>" }, { text: "" }, 7],
  });
  assert.equal(t.model.length, 80);
  assert.equal(t.language, null, "only a language code is kept");
  assert.deepEqual(t.segments[0], { start: 0, end: 1, text: "two words", words: [[1, 1, "ab"]] }, "times repaired");
  assert.deepEqual(t.segments[1], { start: 4, end: 5, text: "kept", words: [[4, 5, "kept"]] }, "text made from its words");
  assert.deepEqual(t.blocks, [{ kind: "p", text: "<b>bold</b>" }], "unknown block kinds become paragraphs; text stays text");
  // An app from before this change sends {model, segments} inside the message.
  const old = unpackTranscript({ model: "auto", segments: [{ start: 0, end: 1, text: "hola", words: [[0, 1, "hola"]] }] });
  assert.equal(old.segments[0].text, "hola");
  // Limits: never more than 20,000 sentences.
  const many = unpackTranscript({ segments: Array.from({ length: 25000 }, (_, i) => ({ start: i, end: i + 1, text: "x" })) });
  assert.equal(many.segments.length, 20000);
});

test("accepting a YouTube video saves it with the friend's captions and opens it where they were", async () => {
  const { api, calls } = fakeApi();
  const text = unpackTranscript(packTranscript(PODCAST));
  const r = await acceptInto(api, { kind: "youtube", url: "https://www.youtube.com/watch?v=abcdefghijk", title: "T", subtitle: "Chan",
                                     language: "ar", duration: 60, at: 12 }, text);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, "/youtube");
  assert.equal(calls[0].body.video_id, "abcdefghijk");
  assert.deepEqual(calls[0].body.lines[0].words, [[0, 0.7, "مرحبا"], [0.8, 1.5, "بكم"]]);
  assert.equal(r.hash, "#/episode/42?t=12");
  assert.equal(r.withText, true);
});

test("accepting without words leaves YouTube, reels and pages to their ordinary way in", async () => {
  const { api, calls } = fakeApi();
  for (const item of [{ kind: "youtube", url: "https://youtu.be/abcdefghijk" }, { kind: "reel", url: "https://www.instagram.com/reel/DAbc123/" },
                      { kind: "page", url: "https://example.com/a" }]) {
    const r = await acceptInto(api, item, null);
    assert.equal(r.hash, "", item.kind);
  }
  assert.equal(calls.length, 0);
});

test("accepting a reel keeps its words", async () => {
  const { api, calls } = fakeApi();
  const r = await acceptInto(api, { kind: "reel", url: "https://www.instagram.com/reel/DAbc123_x-9/", subtitle: "chef", title: "Kitchen" },
                             unpackTranscript(packTranscript(PODCAST)));
  assert.equal(calls[0].path, "/shared/reel");
  assert.equal(calls[0].body.code, "DAbc123_x-9");
  assert.equal(calls[0].body.segments.length, 2);
  assert.equal(r.hash, "#/reels/play?at=42");
});

test("accepting a podcast episode follows the podcast and stores the friend's transcript in one call", async () => {
  const { api, calls } = fakeApi({ "/shared/podcast": () => ({ episode: { id: "e9", language: "ar" }, transcribed: true, kept_own: false, added_feed: true }) });
  const item = { kind: "podcast", title: "Ep 3", feed_url: "https://feeds.example.com/pod.xml", guid: "ep-3",
                 audio_url: "https://cdn.example.com/3.mp3", language: "ar", at: 30 };
  const r = await acceptInto(api, item, unpackTranscript(packTranscript(PODCAST)));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, "/shared/podcast");
  assert.equal(calls[0].body.feed_url, item.feed_url);
  assert.equal(calls[0].body.guid, "ep-3");
  assert.equal(calls[0].body.model, "large-v3-turbo");
  assert.equal(calls[0].body.segments[1].text, "في المطبخ");
  assert.equal(r.hash, "#/episode/e9?t=30");
  assert.equal(r.withText, true);
  assert.equal(r.addedFeed, true);
  // Without words it is still added (the friend can transcribe it).
  const again = await acceptInto(api, item, null);
  assert.deepEqual(calls[1].body.segments, []);
  assert.equal(again.hash, "#/episode/e9?t=30");
});

test("accepting a web page stores the friend's text instead of reading the page again", async () => {
  const { api, calls } = fakeApi();
  const r = await acceptInto(api, { kind: "page", url: "https://example.com/cafe", title: "El café", subtitle: "example.com", image: "" },
                             unpackTranscript(packTranscript(PAGE, { asText: true })));
  assert.equal(calls[0].path, "/pages");
  assert.deepEqual(calls[0].body.blocks.map((b) => b.kind), ["h1", "p"]);
  assert.equal(calls[0].body.site, "example.com");
  assert.equal(r.hash, "#/episode/42");
});

test("a free classic comes from the book shelf; an uploaded book with its text", async () => {
  const { api, calls } = fakeApi();
  const shelf = async (lang) => (lang === "es" ? [{ id: "quijote", file: "es/quijote.json.gz" }] : []);
  const added = [];
  const fromShelf = async (lang, row) => { added.push([lang, row.id]); return { id: 5 }; };
  const r = await acceptInto(api, { kind: "book", guid: "book:es/quijote", title: "Don Quijote" }, null, { shelf, fromShelf });
  assert.deepEqual(added, [["es", "quijote"]]);
  assert.equal(calls.length, 0);
  assert.equal(r.hash, "#/episode/5");
  const text = unpackTranscript(packTranscript(PAGE, { asText: true }));
  await acceptInto(api, { kind: "book", guid: "file:mine.epub:1234", title: "Mine", subtitle: "Ana", language: "es" }, text, { shelf, fromShelf });
  assert.equal(calls[0].path, "/books");
  assert.equal(calls[0].body.guid, "file:mine.epub:1234");
  assert.equal(calls[0].body.author, "Ana");
  assert.equal(calls[0].body.lang, "es");
  await assert.rejects(acceptInto(api, { kind: "book", guid: "file:x:1", title: "X" }, null), /without its text/);
});

test("someone's own recording arrives as its words, to read in My books", async () => {
  const { api, calls } = fakeApi();
  const text = unpackTranscript(packTranscript(PODCAST, { asText: true }));
  const item = { kind: "text", title: "My lesson", language: "ar" };
  const r = await acceptInto(api, item, text);
  assert.equal(calls[0].path, "/books");
  assert.equal(calls[0].body.guid, sharedBookGuid(item, text));
  assert.ok(calls[0].body.guid.startsWith("file:shared:"), "a guid the books route accepts");
  assert.deepEqual(calls[0].body.blocks, [{ kind: "p", text: "مرحبا بكم" }, { kind: "p", text: "في المطبخ" }]);
  assert.equal(r.hash, "#/episode/42");
  // The same recording accepted twice lands on the same book.
  await acceptInto(api, item, text);
  assert.equal(calls[1].body.guid, calls[0].body.guid);
  // Timed words are read as paragraphs too.
  assert.deepEqual(asBlocks(unpackTranscript(packTranscript(PODCAST))).map((b) => b.text), ["مرحبا بكم", "في المطبخ"]);
  await assert.rejects(acceptInto(api, item, null), /didn't arrive/);
});

test("the whole trip: sender's transcript -> file -> friend's library, word for word", async () => {
  // Sender: what the player has, packed and zipped (what sendMedia uploads).
  const file = await gzipText(packTranscript(PODCAST));
  // The online storage hands the same bytes back to the friend.
  const downloaded = new Blob([await file.arrayBuffer()]);
  const text = unpackTranscript(await gunzipText(downloaded));
  const { api, calls } = fakeApi({ "/shared/podcast": (b) => ({ episode: { id: 1 }, transcribed: b.segments.length > 0 }) });
  await acceptInto(api, { kind: "podcast", feed_url: "https://x.example/f.xml", guid: "g" }, text);
  const sent = calls[0].body.segments.flatMap((s) => s.words.map((w) => w[2]));
  assert.deepEqual(sent, PODCAST.words.text);
  const starts = calls[0].body.segments.flatMap((s) => s.words.map((w) => w[0]));
  assert.deepEqual(starts, [0, 0.8, 1.6, 2.2]);
});
