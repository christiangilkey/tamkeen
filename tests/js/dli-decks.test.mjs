// DLI vocabulary decks (tools/dli/DECKS.md): the shared parts in web/js/dli.js (chapters added, card sources,
// chapter word lists, audio bundles), packaging a deck (tools/dli/encrypt.mjs), the sentence checker
// (tools/dli/check_sentences.mjs) and the Vocab page's folder order. A test password of its own, never the real one.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as dli from "../../web/js/dli.js";
import { packContent } from "../../tools/dli/encrypt.mjs";
import { candidates, checkEntry, looksLike } from "../../tools/dli/check_sentences.mjs";
import { sortFolders } from "../../web/js/review/vocabedit.js";
import { KEYS } from "../../web/js/aikeys.js";

const TEST_PASSWORD = "Deck Test 7";
const FAST = 200000;

test("chapter places are kept as short ranges, per deck, under the setting's 2000 characters", () => {
  assert.equal(dli.rangesText([3, 1, 2, 7, 9, 8]), "1-3,7-9");
  assert.deepEqual([...dli.parseRanges("1-3,7, x,0,12-10")].sort((a, b) => a - b), [1, 2, 3, 7]);
  let s = { dli_decks: "" };
  s = { dli_decks: dli.withDeckMarks(s, "ar-basic", [1, 2]) };
  s = { dli_decks: dli.withDeckMarks(s, "zh-basic", [5]) };
  s = { dli_decks: dli.withDeckMarks(s, "ar-basic", [3, 10]) };
  assert.equal(s.dli_decks, "zh-basic:5 ar-basic:1-3,10");
  assert.deepEqual([...dli.deckMarks(s, "ar-basic")], [1, 2, 3, 10]);
  assert.equal(dli.deckMarks(s, "ko-basic").size, 0);
  const all = { dli_decks: dli.withDeckMarks({}, "ko-basic", Array.from({ length: 96 }, (_, i) => i + 1)) };
  assert.equal(all.dli_decks, "ko-basic:1-96");
  const gappy = dli.withDeckMarks({}, "ko-basic", Array.from({ length: 400 }, (_, i) => i * 2 + 1));
  assert.ok(gappy.length <= 2000, "never longer than a synced setting can be");
  assert.ok(KEYS.includes("dli_decks"), "follows the learner to their other devices");
});

test("a deck's folders and cards say where they came from, and a card is found again by its source", () => {
  const deck = { short: "DLI Arabic" };
  const ch = { id: "c010", title: "Chapter 1 (Unit 1)" };
  assert.equal(dli.deckFolderName(deck, ch), "DLI Arabic · Chapter 1 (Unit 1)");
  assert.equal(dli.deckSource(deck, ch, 209), "DLI Arabic · Chapter 1 (Unit 1) · word 209");
  assert.equal(dli.deckWordOf(deck, { episode_title: "DLI Arabic · Chapter 1 (Unit 1) · word 209" }), 209);
  assert.equal(dli.deckWordOf(deck, { source: "DLI Arabic · Chapter 1 (Unit 1) · word 7" }), 7);
  assert.equal(dli.deckWordOf(deck, { episode_title: "Arabic basics · word 209" }), 0, "another course's card");
  assert.equal(dli.deckWordOf({ short: "DLI Farsi" }, { episode_title: "DLI Arabic · Chapter 1 · word 2" }), 0);
  assert.ok(dli.deckFolderName(deck, { title: "x".repeat(200) }).length <= 80, "a folder name is at most 80");
});

test("a chapter's word list keeps only well-formed words", () => {
  const data = dli.chapterWords({ id: "c002", words: [
    { n: 1, text: " بَيْت ", meaning: "house", notes: "Plural: بُيُوت", sentence: "هٰذَا ⟦بَيْتٌ⟧.", translation: "This is a ⟦house⟧.", in: ["c002", "c009", "bad"] },
    { n: 2, also: true },
    { n: 0, text: "x" }, { n: 3, text: "   " }, null, { n: 4.5, text: "y" },
  ] });
  assert.equal(data.id, "c002");
  assert.deepEqual(data.words, [
    { n: 1, text: "بَيْت", meaning: "house", notes: "Plural: بُيُوت", sentence: "هٰذَا ⟦بَيْتٌ⟧.", translation: "This is a ⟦house⟧.", in: ["c002", "c009"] },
    { n: 2, also: true }]);
});

test("an audio bundle carries each word's file and times, and nothing out of bounds is read", () => {
  const a = new Uint8Array(300).fill(1), b = new Uint8Array(500).fill(2);
  const bundle = dli.makeBundle([{ n: 4, bytes: a, times: { start: 0.06, end: 0.8, sent_start: 1.7, sent_end: 4.5 } },
                                 { n: 9, bytes: b, times: { start: 0.06, end: 1.1, sent_start: null, sent_end: null } }]);
  const files = dli.readBundle(bundle);
  assert.deepEqual([...files.keys()], [4, 9]);
  assert.deepEqual([...files.get(4).bytes], [...a]);
  assert.deepEqual([...files.get(9).bytes], [...b]);
  assert.deepEqual(files.get(4).times, { start: 0.06, end: 0.8, sent_start: 1.7, sent_end: 4.5 });
  assert.equal(files.get(9).times.sent_start, null);
  assert.equal(dli.readBundle(bundle.subarray(0, bundle.length - 10)).has(9), false, "a cut-off file is left out");
  assert.equal(dli.readBundle(new Uint8Array([255, 255, 255, 255, 1])).size, 0, "a broken header reads as nothing");
  assert.equal(dli.readBundle(new Uint8Array(2)).size, 0);
});

test("the index keeps a deck and its well-formed chapters only", () => {
  const id = "0123456789abcdef0123456789abcdef";
  const ix = dli.cleanIndex({ content: { ko: [
    { kind: "deck", id: "ko-basic", title: "DLI Korean", short: "DLI Korean", words: 3, chapters: [
      { id: "c001", title: "Chapter 1", words: 3, file: id, audio: "", voiced: 0 },
      { id: "x1", title: "bad", file: id }, { id: "c002", title: "no file", file: "nope" }] },
    { kind: "deck", id: "Bad Id", chapters: [{ id: "c001", file: id }] },
    { kind: "deck", id: "empty", chapters: [] }] } });
  assert.equal(ix.content.ko.length, 1);
  assert.deepEqual(ix.content.ko[0].chapters.map((c) => c.id), ["c001"]);
  assert.equal(ix.content.ko[0].chapters[0].audio, "");
});

function deckFolder() {
  const from = mkdtempSync(join(tmpdir(), "dli-deck-"));
  const folder = join(from, "ar", "ar-basic");
  mkdirSync(join(folder, "sentences"), { recursive: true });
  mkdirSync(join(folder, "audio"), { recursive: true });
  writeFileSync(join(folder, "deck.json"), JSON.stringify({ deck: 1, id: "ar-basic", language: "ar", title: "DLI Arabic Basic Course",
    short: "DLI Arabic", chapters: [{ id: "c001", title: "Sound and Script 1", words: [1, 2] },
                                    { id: "c002", title: "Chapter 1", words: [3, 1] },
                                    { id: "c003", title: "Chapter 2", words: [4] }],
    words: [{ n: 1, word: "بيت", meaning: "house", notes: "", chapters: ["c001", "c002"] },
            { n: 2, word: "باب", meaning: "door", notes: "", chapters: ["c001"] },
            { n: 3, word: "كتاب", meaning: "boook", notes: "Plural: كتب", chapters: ["c002"] },
            { n: 4, word: "قلم", meaning: "pen", notes: "", chapters: ["c003"] }] }));
  const e = (n, sentence) => ({ n, sentence, translation: "It is ⟦here⟧.", say: "x" });
  writeFileSync(join(folder, "sentences", "c001.json"), JSON.stringify({ chapter: "c001", words: [e(1, "هٰذَا ⟦بَيْتٌ⟧."), e(2, "هٰذَا ⟦بَابٌ⟧.")] }));
  writeFileSync(join(folder, "sentences", "c002.json"), JSON.stringify({ chapter: "c002", words: [
    { ...e(3, "هٰذَا ⟦كِتَابٌ⟧."), fix: { meaning: "book" } }] }));
  // c003 not written yet: left out for now
  writeFileSync(join(folder, "audio", "1.ogg"), new Uint8Array(400).fill(7));
  writeFileSync(join(folder, "audio", "2.ogg"), new Uint8Array(400).fill(8));
  const times = { start: 0.06, end: 0.7, sent_start: 1.6, sent_end: 3.2 };
  writeFileSync(join(folder, "audio", "made.json"), JSON.stringify({
    1: { fp: "a", times, word: "بيت", sentence: "هٰذَا بَيْتٌ." },
    2: { fp: "b", times, word: "باب", sentence: "an older sentence" } }));  // stale: left out
  return { from, folder };
}

test("a deck is packaged chapter by chapter: finished chapters only, audio that still matches, kept between runs", async () => {
  const check = await dli.makeCheck(TEST_PASSWORD, { iterations: FAST });
  const keyParams = { salt: dli.toBase64(dli.randomBytes(16)), iterations: FAST };
  const { from, folder } = deckFolder();
  const out = mkdtempSync(join(tmpdir(), "dli-deck-out-"));
  try {
    const r = await packContent({ from, out, password: TEST_PASSWORD, check, keyParams });
    assert.deepEqual(r.skipped, []);
    assert.equal(r.notes.length, 1, "the unfinished chapter is noted, not an error");
    const key = await dli.contentKey(TEST_PASSWORD, keyParams);
    const index = dli.cleanIndex(await dli.openJson(key, readFileSync(join(out, "index.bin")), { name: "index" }));
    const [deck] = dli.contentFor(index, "ar");
    assert.equal(deck.kind, "deck");
    assert.equal(deck.short, "DLI Arabic");
    assert.equal(deck.words, 3);
    assert.deepEqual(deck.chapters.map((c) => [c.id, c.words, c.voiced]), [["c001", 2, 1], ["c002", 2, 0]]);
    const c2 = dli.chapterWords(await dli.openJson(key, readFileSync(join(out, `${deck.chapters[1].file}.bin`)), { name: deck.chapters[1].file }));
    assert.deepEqual(c2.words.map((w) => w.also ? [w.n, "also"] : [w.n, w.text, w.meaning, w.notes, w.in]),
      [[3, "كتاب", "book", "Plural: كتب", ["c002"]], [1, "also"]], "a fixed meaning; a word met earlier is only referred to");
    assert.equal(deck.chapters[1].audio, "", "no audio yet");
    const audioId = deck.chapters[0].audio;
    assert.ok(existsSync(join(out, "audio", `${audioId}.bin`)), "the audio sits apart from what ships in the apps");
    const files = dli.readBundle(await dli.openBytes(key, readFileSync(join(out, "audio", `${audioId}.bin`)), { name: audioId }));
    assert.deepEqual([...files.keys()], [1], "only the audio made for the sentence as it is now");
    assert.equal(files.get(1).bytes[0], 7);
    // Again: nothing changed, nothing encrypted again.
    const again = await packContent({ from, out, password: TEST_PASSWORD, check, keyParams });
    assert.equal(again.written, 0);
    // The stale word gets new audio: only that chapter's bundle is made again.
    const made = JSON.parse(readFileSync(join(folder, "audio", "made.json"), "utf8"));
    made[2].sentence = "هٰذَا بَابٌ.";
    writeFileSync(join(folder, "audio", "made.json"), JSON.stringify(made));
    const third = await packContent({ from, out, password: TEST_PASSWORD, check, keyParams });
    assert.equal(third.written, 1);
    assert.equal(readdirSync(join(out, "audio")).length, 1, "the old bundle is gone");
  } finally {
    rmSync(from, { recursive: true, force: true });
    rmSync(out, { recursive: true, force: true });
  }
});

test("the sentence checker finds the word in its sentence, and what is missing", () => {
  assert.deepEqual(candidates("jugar (ue)"), ["jugar"]);
  assert.deepEqual(candidates("el/la artista"), ["el", "la artista", "artista"]);
  assert.ok(looksLike("jugamos", "jugar (ue)", "es"));
  assert.ok(looksLike("الْكُتُبِ", "كِتَاب", "ar"), "the root's letters, in another shape");
  assert.ok(looksLike("窗户", "窗户", "zh"));
  assert.ok(!looksLike("门", "窗户", "zh"));
  const good = { n: 1, sentence: "أَسْكُنُ ⟦فِي⟧ بَيْتٍ صَغِيرٍ.", translation: "I live ⟦in⟧ a small house.", say: "فِي" };
  assert.deepEqual(checkEntry(good, { word: "في" }, "ar"), { errors: [], warnings: [] });
  const bad = checkEntry({ n: 1, sentence: "اسكن في بيت", translation: "I live in a house." }, { word: "في" }, "ar");
  assert.ok(bad.errors.length >= 4, "no marks, no vowels, no full stop, no say");
  assert.ok(checkEntry({ n: 1, sentence: "我喜欢⟦窗户⟧chuanghu。", translation: "I like ⟦windows⟧." }, { word: "窗户" }, "zh").errors.length);
  assert.ok(checkEntry({ n: 1, sentence: "من ⟦كتاب⟧ مي خوانم.", translation: "I ⟦read⟧." }, { word: "کتاب" }, "fa").errors.length,
    "Persian is written with ک and ی");
  assert.deepEqual(checkEntry({ n: 1, sentence: "我⟦的⟧书。", translation: "⟦My⟧ book.", say: { alphabet: "sapi", ph: "de 5" } },
    { word: "的" }, "zh").errors, []);
});

test("the Vocab page lists folders by name, numbers as numbers, and a DLI deck's folders in course order", () => {
  const f = (name, created_at) => ({ uid: name, name, created_at });
  const got = sortFolders([
    f("Verbs 10", 1), f("verbs 2", 2), f("DLI Arabic · Chapter 1 (Unit 1)", 20), f("DLI Arabic · Sound and Script 1", 10),
    f("DLI Arabic · Semester 3, Lesson 1", 30), f("Animals", 3), f("Food", 50), f("DLI Arabic · Chapter 2 (Unit 1)", 21)]).map((x) => x.name);
  assert.deepEqual(got, ["Animals", "DLI Arabic · Sound and Script 1", "DLI Arabic · Chapter 1 (Unit 1)", "DLI Arabic · Chapter 2 (Unit 1)",
    "DLI Arabic · Semester 3, Lesson 1", "Food", "verbs 2", "Verbs 10"]);
});
