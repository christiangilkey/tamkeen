// ICPT prep decks (tools/dli/ICPT.md): topic files become a deck (tools/dli/icpt_deck.mjs), its words linked to the
// basic deck's, and the link reaches the app through the packaging (tools/dli/encrypt.mjs, web/js/dli.js chapterWords).
// A test password of its own, never the real one.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as dli from "../../web/js/dli.js";
import { packContent } from "../../tools/dli/encrypt.mjs";
import { LEVELS, TOPICS, buildDeck, chapterId, joinMeanings, meaningWords, sameWord } from "../../tools/dli/icpt_deck.mjs";

const entry = (level, word, meaning, sentence, translation, extra = {}) =>
  ({ level, word, meaning, notes: "", sentence, translation, say: word, ...extra });
const PRICE = entry("1", "سِعْر", "price", "⟦سِعْرُ⟧ الْخُبْزِ ثَابِتٌ هٰذَا الشَّهْرَ.", "⟦The price⟧ of bread is unchanged this month.",
  { notes: "Plural: أَسْعَار" });
const GOV = entry("2", "حُكُومَة", "government", "أَعْلَنَتِ ⟦الْحُكُومَةُ⟧ خُطَّةً جَدِيدَةً لِلنَّقْلِ.", "⟦The government⟧ announced a new transport plan.");
const GOV_AGAIN = entry("3", "حُكُومَة", "the government", "تُوَاجِهُ ⟦الْحُكُومَةُ⟧ انْتِقَادَاتٍ بِسَبَبِ الْأَسْعَارِ.", "⟦The government⟧ faces criticism over prices.");
const FLAG = entry("1", "عَلَم", "flag", "رُفِعَ ⟦الْعَلَمُ⟧ فَوْقَ الْمَبْنَى.", "⟦The flag⟧ was raised over the building.");
const SCIENCE = entry("2", "عِلْم", "science", "يُحِبُّ الطُّلَّابُ ⟦الْعِلْمَ⟧ كَثِيرًا.", "The students love ⟦science⟧ a lot.");

test("chapters have fixed ids: level first, then topic, so a new topic never moves another", () => {
  assert.equal(chapterId("1", "politics"), "c001");
  assert.equal(chapterId("1", "news"), `c${String(TOPICS.length).padStart(3, "0")}`);
  assert.equal(chapterId("2", "politics"), `c${String(TOPICS.length + 1).padStart(3, "0")}`);
  assert.equal(chapterId("3", "news"), `c${String(TOPICS.length * LEVELS.length).padStart(3, "0")}`);
  assert.ok(TOPICS.length * LEVELS.length < 1000, "fits the chapter id's three digits");
});

test("the same word is the same letters and a meaning in common", () => {
  assert.deepEqual([...meaningWords("to sign (a treaty); signing")].sort(), ["sign", "signing"]);
  assert.deepEqual([...meaningWords("localisation; labour; defence; centre")], [...meaningWords("localization; labor; defense; center")]);
  assert.ok(sameWord({ word: "حُكُومَة", meaning: "government" }, { word: "حكومة", meaning: "the government" }, "ar"));
  assert.ok(!sameWord({ word: "عَلَم", meaning: "flag" }, { word: "عِلْم", meaning: "science" }, "ar"), "same letters, another word");
  assert.ok(!sameWord({ word: "سِعْر", meaning: "price" }, { word: "سَفَر", meaning: "price" }, "ar"));
  assert.ok(sameWord({ word: "الْبِنْيَةُ التَّحْتِيَّةُ", meaning: "infrastructure" }, { word: "بِنْيَة تَحْتِيَّة", meaning: "Infrastructure" }, "ar"),
    "the article on each word aside");
  assert.ok(sameWord({ word: "نَادٍ", meaning: "club" }, { word: "نادي", meaning: "Club (sports)" }, "ar"), "a final ي aside");
  assert.ok(!sameWord({ word: "الْعِشْرُونَ", meaning: "twentieth" }, { word: "عِشْرُون", meaning: "twenty" }, "ar"), "the meaning decides");
  assert.ok(!sameWord({ word: "أَمْن", meaning: "security" }, { word: "أَمْنِيّ", meaning: "security (adj.)" }, "ar"), "a noun isn't its adjective");
  assert.ok(!sameWord({ word: "صَوْت", meaning: "vote; voice" }, { word: "صَوَّتَ", meaning: "to vote" }, "ar"), "another shadda, another word");
  assert.ok(sameWord({ word: "صَوَّتَ", meaning: "to vote" }, { word: "صوت", meaning: "to vote" }, "ar"), "unvowelled: can't tell, so the meaning decides");
  assert.equal(joinMeanings("website; site", "position (military); site"), "website; site; position (military)");
  assert.equal(joinMeanings("border(s)", "border; borders"), "border(s)");
});

test("topic files become a deck: one card per word in every folder it's written in, linked to the basic deck", () => {
  const basic = { id: "ar-basic", words: [{ n: 1, word: "حُكُومَة", meaning: "Government", chapters: ["c050"] },
                                          { n: 2, word: "عِلْم", meaning: "Science; knowledge", chapters: ["c020"] }] };
  const files = { economy: { topic: "economy", words: [PRICE, GOV_AGAIN] }, politics: { topic: "politics", words: [GOV, FLAG] },
                  science: { topic: "science", words: [SCIENCE] } };
  const { deck, sentences, errors, report } = buildDeck("ar", files, { basic });
  assert.deepEqual(errors, []);
  assert.equal(deck.id, "ar-icpt");
  assert.equal(deck.short, "DLI Arabic ICPT");
  assert.equal(deck.link_deck, "ar-basic");
  assert.deepEqual(deck.chapters.map((c) => [c.id, c.title, c.words]), [
    [chapterId("1", "politics"), "Politics & government · Level 1–1+", [1]],
    [chapterId("1", "economy"), "Economy & business · Level 1–1+", [2]],
    [chapterId("2", "politics"), "Politics & government · Level 2", [3]],
    [chapterId("2", "science"), "Science, technology & environment · Level 2", [4]],
    [chapterId("3", "economy"), "Economy & business · Level 2+/3", [3]],
  ], "level first; the government is one word, in two folders");
  assert.deepEqual(deck.words.map((w) => [w.n, w.word, w.link]), [[1, "عَلَم", undefined], [2, "سِعْر", undefined], [3, "حُكُومَة", 1], [4, "عِلْم", 2]]);
  assert.deepEqual(deck.words[2].chapters, [chapterId("2", "politics"), chapterId("3", "economy")]);
  assert.equal(report.merged.length, 1);
  assert.equal(report.linked, 2);
  assert.equal(sentences[chapterId("3", "economy")].length, 0, "its sentence is written where it's first met");
  assert.deepEqual(sentences[chapterId("1", "economy")], [{ n: 2, sentence: PRICE.sentence, translation: PRICE.translation, say: PRICE.say }]);

  // Again, with a word added at the start and one taken out: the numbers stay.
  const NEW = entry("1", "انْتِخَابَات", "elections", "تَبْدَأُ ⟦الِانْتِخَابَاتُ⟧ غَدًا.", "⟦The elections⟧ start tomorrow.");
  const files2 = { ...files, politics: { topic: "politics", words: [NEW, GOV] } };
  const second = buildDeck("ar", files2, { old: deck, basic });
  assert.deepEqual(second.deck.words.map((w) => [w.n, w.word, w.chapters.length > 0]),
    [[1, "عَلَم", false], [2, "سِعْر", true], [3, "حُكُومَة", true], [4, "عِلْم", true], [5, "انْتِخَابَات", true]]);
  assert.deepEqual(second.deck.chapters[0].words, [5]);
});

test("a word without its sentence, vowels or level is a problem", () => {
  const bad = { economy: { words: [{ ...PRICE, sentence: "سعر الخبز ثابت." }, { ...PRICE, word: "", meaning: "" }, { ...GOV, level: "4" }] } };
  const { errors, deck } = buildDeck("ar", bad);
  assert.ok(errors.some((e) => /vowelled/.test(e)) && errors.some((e) => /needs word and meaning/.test(e)), errors.join("\n"));
  assert.ok(errors.some((e) => /level must be/.test(e)));
  assert.equal(deck.words.length, 1, "a level that isn't 1, 2 or 3 is left out");
});

test("a linked word reaches the app as a link, and gets no audio of its own", async () => {
  const TEST_PASSWORD = "Icpt Test 3";
  const check = await dli.makeCheck(TEST_PASSWORD, { iterations: 200000 });
  const keyParams = { salt: dli.toBase64(dli.randomBytes(16)), iterations: 200000 };
  const from = mkdtempSync(join(tmpdir(), "icpt-from-"));
  const out = mkdtempSync(join(tmpdir(), "icpt-out-"));
  try {
    const basic = { id: "ar-basic", words: [{ n: 1, word: "حُكُومَة", meaning: "Government", chapters: ["c050"] }] };
    const { deck, sentences } = buildDeck("ar", { politics: { words: [FLAG, GOV] } }, { basic });
    const folder = join(from, "ar", "ar-icpt");
    mkdirSync(join(folder, "sentences"), { recursive: true });
    mkdirSync(join(folder, "audio"));
    writeFileSync(join(folder, "deck.json"), JSON.stringify(deck));
    for (const [id, list] of Object.entries(sentences)) writeFileSync(join(folder, "sentences", `${id}.json`), JSON.stringify({ chapter: id, words: list }));
    // Audio for both (as if made before the link): only the unlinked word's goes in the bundle.
    writeFileSync(join(folder, "audio", "1.ogg"), Buffer.from([7]));
    writeFileSync(join(folder, "audio", "2.ogg"), Buffer.from([8]));
    const plain = (s) => s.replace(/[⟦⟧]/gu, "");
    const times = { start: 0, end: 1, sent_start: 2, sent_end: 3 };
    writeFileSync(join(folder, "audio", "made.json"), JSON.stringify({
      1: { word: FLAG.word, sentence: plain(FLAG.sentence), times }, 2: { word: GOV.word, sentence: plain(GOV.sentence), times } }));
    await packContent({ from, out, password: TEST_PASSWORD, check, keyParams });
    const key = await dli.contentKey(TEST_PASSWORD, keyParams);
    const index = dli.cleanIndex(await dli.openJson(key, readFileSync(join(out, "index.bin")), { name: "index" }));
    const [item] = dli.contentFor(index, "ar");
    assert.equal(item.short, "DLI Arabic ICPT");
    const ch = item.chapters.find((c) => c.id === chapterId("2", "politics"));
    const words = dli.chapterWords(await dli.openJson(key, readFileSync(join(out, `${ch.file}.bin`)), { name: ch.file })).words;
    assert.deepEqual(words.map((w) => [w.n, w.link]), [[2, { deck: "ar-basic", n: 1 }]]);
    assert.equal(ch.voiced, 0, "the basic deck's card has the audio");
    assert.equal(item.chapters.find((c) => c.id === chapterId("1", "politics")).voiced, 1);
  } finally {
    rmSync(from, { recursive: true, force: true });
    rmSync(out, { recursive: true, force: true });
  }
});

test("a chapter's word list keeps a well-formed link only", () => {
  const data = dli.chapterWords({ id: "c016", words: [
    { n: 3, text: "حُكُومَة", meaning: "government", in: ["c016"], link: { deck: "ar-basic", n: 7 } },
    { n: 4, also: true, link: { deck: "ar-basic", n: 9 } },
    { n: 5, text: "سِعْر", meaning: "price", in: ["c016"], link: { deck: "../x", n: 2 } },
    { n: 6, text: "عَلَم", meaning: "flag", in: ["c016"], link: { deck: "ar-basic", n: -1 } },
  ] });
  assert.deepEqual(data.words.map((w) => [w.n, w.link]), [[3, { deck: "ar-basic", n: 7 }], [4, { deck: "ar-basic", n: 9 }], [5, undefined], [6, undefined]]);
});

test("a word links to the basic deck's card only when that card says what the news means by it", async () => {
  const { linkable } = await import("../../tools/dli/icpt_deck.mjs");
  assert.ok(linkable({ meaning: "government" }, { meaning: "Government(s)" }));
  assert.ok(!linkable({ meaning: "to rule, sentence (of a court); to spend (time)" }, { meaning: "to spend time (I)" }), "another first sense");
  assert.ok(!linkable({ meaning: "subsidies; support" }, { meaning: "to support (ساند)" }), "a noun isn't a verb");
  assert.ok(linkable({ meaning: "to withdraw, pull out" }, { meaning: "withdraw (VII)" }) === false, "a verb whose basic meaning lacks 'to' stays apart");
});
