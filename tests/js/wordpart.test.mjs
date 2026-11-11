// The Mnemonic maker's part picker (review/wordpart.js): the letters the learner highlights on the word, the
// sounds those letters stand for, and the pronunciation cut to them. Against the real files in docs/lexicon.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { alignLetters, cleanSel, cutPron, graphemes, isWhole, litLine, moveEdge, selText, soundSpan } from "../../web/js/review/wordpart.js";
import { pronunciationOf } from "../../web/js/review/soundout.js";
import { ExamplePack } from "../../web/js/lexicon/exampledata.js";
import { KeywordList, makeFreeMnemonics } from "../../web/js/review/freemnemonic.js";
import { makeMnemonics } from "../../web/js/review/mnemonic.js";

const read = (name) => JSON.parse(gunzipSync(readFileSync(new URL(`../../docs/lexicon/${name}`, import.meta.url))));
const packs = {};
const pack = (lang) => (packs[lang] ||= new ExamplePack(read(`${lang}-examples.json.gz`), lang));
const said = (word, lang) => pronunciationOf({ word, lang, ipa: pack(lang).ipaOf(word) });
const lit = (pron, a, b) => litLine(pron, a, b).filter((x) => x.lit).map((x) => x.text).join("");
/** The sounds each letter of `word` gets, as the card would write them. */
const perLetter = (word, lang, core = "") => {
  const pron = said(core || word, lang);
  const spans = alignLetters(word, lang, pron, core);
  return graphemes(word).map((g, i) => (spans[i][0] === spans[i][1] ? "" : lit(pron, spans[i][0], spans[i][1]).toLowerCase()));
};

test("letters: a letter keeps its marks, and a choice stays inside the word", () => {
  assert.deepEqual(graphemes("كَتَبَ"), ["كَ", "تَ", "بَ"], "an Arabic letter with its vowel mark is one letter");
  assert.equal(graphemes("café").length, 4);
  assert.deepEqual(cleanSel({ from: -3, to: 99 }, 5), { from: 0, to: 5 });
  assert.deepEqual(cleanSel({ from: 4, to: 2 }, 5), { from: 4, to: 5 }, "never empty");
  const letters = graphemes("el gato.");
  assert.equal(isWhole({ from: 0, to: 8 }, letters), true);
  assert.equal(isWhole({ from: 0, to: 7 }, letters), true, "only the full stop left out: still the whole word");
  assert.equal(isWhole({ from: 3, to: 7 }, letters), false);
  assert.equal(selText(letters, { from: 3, to: 7 }), "gato");
  assert.deepEqual(moveEdge({ from: 2, to: 5 }, "end", 1, 8), { from: 2, to: 6 });
  assert.deepEqual(moveEdge({ from: 2, to: 3 }, "end", -1, 8), { from: 2, to: 3 }, "an end never passes the other");
  assert.deepEqual(moveEdge({ from: 2, to: 5 }, "start", -5, 8), { from: 0, to: 5 });
});

test("each letter gets the sounds it stands for, in any script", () => {
  assert.deepEqual(perLetter("mariposa", "es"), ["m", "a", "r", "i", "p", "o", "s", "a"]);
  assert.deepEqual(perLetter("caballo", "es"), ["k", "a", "b", "a", "y", "", "o"], "ll is one sound");
  // Arabic writes no short vowels: an unwritten one goes with the consonant before it.
  assert.deepEqual(perLetter("كتاب", "ar"), ["ki", "t", "aa", "b"]);
  assert.deepEqual(perLetter("собака", "ru"), ["s", "a", "b", "a", "k", "uh"], "a vowel letter takes the vowel said there");
  // One syllable a letter where the script works that way.
  assert.deepEqual(perLetter("苹果", "zh"), ["ping", "gwo"]);
  assert.deepEqual(perLetter("고양이", "ko"), ["ko", "ya", "ngi"]);
  assert.deepEqual(perLetter("たべる", "ja"), ["ta", "be", "ru"]);
});

test("what is left out of the word (the article) takes no sounds", () => {
  assert.deepEqual(perLetter("الكتاب", "ar", "كتاب"), ["", "", "ki", "t", "aa", "b"]);
  assert.deepEqual(perLetter("der Hund", "de", "Hund").slice(0, 4), ["", "", "", ""]);
});

test("the pronunciation cut to the chosen letters, and the sound line with that part lit", () => {
  const pron = said("mariposa", "es");
  const spans = alignLetters("mariposa", "es", pron);
  const [a, b] = soundSpan(spans, { from: 4, to: 8 });  // "posa"
  const cut = cutPron(pron, a, b);
  assert.deepEqual(cut.syllables.map((s) => s.text), ["po", "sa"]);
  assert.equal(cut.stress, 0, "the stress comes along");
  assert.deepEqual(litLine(pron, a, b), [{ text: "ma-ri-", lit: false }, { text: "PO-sa", lit: true }]);
  // Between letters, not syllables: "ipo" is i + po.
  const mid = cutPron(pron, ...soundSpan(spans, { from: 3, to: 6 }));
  assert.deepEqual(mid.syllables.map((s) => s.text), ["i", "po"]);
  // A consonant cut off its syllable joins the one beside it; a part with no vowel is no part.
  assert.deepEqual(cutPron(pron, ...soundSpan(spans, { from: 2, to: 6 })).syllables.map((s) => s.text), ["ri", "po"]);
  assert.equal(cutPron(pron, ...soundSpan(spans, { from: 0, to: 1 })), null);
});

test("the owner's phrase: a part of وتاهوا في البيداء", () => {
  const phrase = "وتاهوا في البيداء";
  const pron = said(phrase, "ar");
  assert.equal(pron.syllables.map((s) => s.text).join("-"), "wa-taa-huu-fii-al-bii-daa'", "read a word at a time");
  const spans = alignLetters(phrase, "ar", pron);
  const letters = graphemes(phrase);
  const first = { from: 0, to: 6 };  // وتاهوا
  assert.equal(selText(letters, first), "وتاهوا");
  const [a, b] = soundSpan(spans, first);
  assert.equal(lit(pron, a, b).toLowerCase(), "wa-taa-huu");
  const middle = { from: 1, to: 5 };  // تاهو
  assert.equal(lit(pron, ...soundSpan(spans, middle)).toLowerCase(), "taa-huu");
  // The free maker's keywords for that part are matched against it alone.
  const list = new KeywordList(read("en-keywords.json.gz"));
  const cut = cutPron(pron, ...soundSpan(spans, middle));
  const got = makeFreeMnemonics({ text: phrase, meaning: "and they got lost in the wasteland" }, { pron: cut, list });
  assert.ok(got.items.length + got.parts.length > 0, "there are keywords for taa-huu");
  for (const s of [...got.items, ...got.parts]) assert.ok(s.sound === "close" || s.sound === "partial");
});

test("the AI is asked about the chosen letters only, and its keywords are checked against that part", async () => {
  let asked = "";
  const ask = async (p) => {
    asked = p.user;
    return { pronunciation: { romanization: "tahu", ipa: "taːhu", syllables: [{ text: "ta", ipa: "taː" }, { text: "hu", ipa: "hu" }], stress: 0 },
      keywords: [{ keyword: "tahoe", ipa: "ˈtɑhoʊ", covers: [0, 1], meaning_link: "none", link: "", scene: "s" },
        { keyword: "wasteland", ipa: "ˈweɪstlænd", covers: [0], meaning_link: "strong", link: "", scene: "s" }], parts: [] };
  };
  const got = await makeMnemonics({ text: "وتاهوا في البيداء", meaning: "and they got lost in the wasteland" },
    { ask, study: "Arabic", speaks: "English", reading: "whole word reading", partText: "تاهو" });
  assert.match(asked, /^Arabic word: تاهو\n/, "the part is what it is asked about");
  assert.match(asked, /only a part of the card's word, "وتاهوا في البيداء"/);
  assert.doesNotMatch(asked, /whole word reading/, "the whole word's reading isn't the part's");
  assert.deepEqual(got.items.map((s) => s.keyword), ["tahoe"], "a keyword that doesn't sound like the part is dropped");
  assert.equal(got.pron.syllables.length, 2);
});
