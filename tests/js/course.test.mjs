// The basics courses: the pure part the app uses (web/js/coursedata.js), and the course content itself
// (tools/course/<lang>/words.json): numbered in order, no word twice, each sentence using its word, fully
// vowelled, each translation marking the word's part once.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { COURSE_BASE, cardOf, courseUrl, markedHtml, progress, unitsOf, vowelledKey, wordKey } from "../../web/js/coursedata.js";
import { Dictionary, analyzeArabic } from "../../web/js/lexicon/arabic.js";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

test("course files come from the computer's own server, the web app's site, or the published website", () => {
  assert.equal(courseUrl("ar/course.json", { platform: "desktop" }), "/api/course/ar/course.json");
  assert.equal(courseUrl("index.json", { platform: "web", host: "christiangilkey.github.io" }), "/tamkeen/course/index.json");
  assert.equal(courseUrl("ar/audio/0001.ogg", { platform: "android", host: "localhost" }), `${COURSE_BASE}ar/audio/0001.ogg`);
});

test("words are compared without vowel marks, tatweel or the different alef, ya and ta marbuta spellings", () => {
  assert.equal(wordKey("فِي", "ar"), wordKey("في", "ar"));
  assert.equal(wordKey("إِلَى", "ar"), "الي");
  assert.equal(wordKey("مَدِينَة", "ar"), wordKey("مدينه", "ar"));
  assert.equal(wordKey("لِـ", "ar"), "ل");
  assert.equal(wordKey("  Casa ", "es"), "casa");
});

const COURSE = {
  lang: "ar", title: "Arabic basics", planned: 1000, unit: 50,
  units: [{ n: 1, from: 1, to: 50, ready: true }, { n: 2, from: 51, to: 100, ready: false }],
  words: [
    { n: 1, word: "فِي", meaning: "in", sentence: "أَسْكُنُ فِي بَيْتٍ.", translation: "I live ⟦in⟧ a house.", audio: "audio/0001.ogg", times: { start: 0.06, end: 0.5, sent_start: 1.4, sent_end: 2.9 } },
    { n: 2, word: "مِنْ", meaning: "from", sentence: "أَنَا مِنْ مِصْرَ.", translation: "I am ⟦from⟧ Egypt.", audio: "audio/0002.ogg", times: { start: 0.06, end: 0.4, sent_start: 1.3, sent_end: 2.5 } },
  ],
};

test("progress counts the course words among the learner's cards, however they were saved", () => {
  const p = progress(COURSE, [{ text: "في" }, { text: "كتاب" }, { text: "مِنْ", deleted: 1 }]);
  assert.deepEqual([...p.have], [1], "a card typed without vowels counts; a deleted one doesn't");
  assert.equal(p.total, 2);
  assert.equal(p.planned, 1000);
  assert.deepEqual(p.units.map((u) => [u.n, u.ready, u.count, u.have]), [[1, true, 2, 1], [2, false, 0, 0]]);
  assert.equal(p.next.n, 1, "the first unit made and not finished");
  assert.equal(progress(COURSE, [{ text: "في" }, { text: "من" }]).next, null, "nothing left to do in the units made");
  assert.equal(unitsOf(COURSE)[0].words.length, 2);
});

test("a vowelled card counts only for the word written with the same vowels; a card without vowels for both", () => {
  const two = { ...COURSE, words: [
    { n: 1, word: "عَمَل", meaning: "work" }, { n: 2, word: "عَمِلَ", meaning: "to work" }] };
  assert.deepEqual([...progress(two, [{ text: "عَمَل" }]).have], [1], "the noun added from the course: the verb is still to do");
  assert.deepEqual([...progress(two, [{ text: "عَمِلَ" }]).have], [2]);
  assert.deepEqual([...progress(two, [{ text: "عمل" }]).have], [1, 2], "saved from a podcast without vowels: it could be either");
});

test("a course word becomes an ordinary card, in the course's folder, saying where it came from", () => {
  assert.deepEqual(cardOf(COURSE.words[0], COURSE, "d1"), {
    text: "فِي", meaning: "in", sentence: "أَسْكُنُ فِي بَيْتٍ.", translation: "I live ⟦in⟧ a house.", notes: "",
    folders: ["d1"], source: "Arabic basics · word 1" });
  assert.deepEqual(cardOf(COURSE.words[0], COURSE).folders, []);
  assert.equal(markedHtml("I live ⟦in⟧ a <small> house.", esc), "I live <b>in</b> a &lt;small&gt; house.");
});

// ----- the Arabic course's content -----

const ar = JSON.parse(readFileSync(new URL("../../tools/course/ar/words.json", import.meta.url), "utf8"));
const msa = new Dictionary(JSON.parse(gunzipSync(readFileSync(new URL("../../docs/lexicon/ar-msa.json.gz", import.meta.url)))));
const MARK = /[ً-ْٰ]/;

test("the Arabic course is numbered in order, with no word twice and nothing missing", () => {
  assert.equal(ar.lang, "ar");
  const seen = new Map();
  ar.words.forEach((w, i) => {
    assert.equal(w.n, i + 1, `word ${i + 1} is numbered ${w.n}`);
    for (const k of ["word", "meaning", "sentence", "translation", "pos"]) assert.ok(String(w[k] || "").trim(), `${w.n} has no ${k}`);
    const key = vowelledKey(w.word);  // (عَمَل "work" and عَمِلَ "to work" are two words)
    assert.ok(!seen.has(key), `${w.word} is both word ${seen.get(key)} and word ${w.n}`);
    seen.set(key, w.n);
    assert.ok(w.rank >= w.n, `${w.n}: its frequency rank (${w.rank}) can't be before its place in the course`);
  });
  for (let i = 1; i < ar.words.length; i++) assert.ok(ar.words[i].rank > ar.words[i - 1].rank, `ranks rise at word ${ar.words[i].n}`);
});

test("each translation marks the word's part exactly once", () => {
  for (const w of ar.words) assert.match(w.translation, /^[^⟦⟧]*⟦[^⟦⟧]+⟧[^⟦⟧]*$/, `${w.n}: ${w.translation}`);
});

const said = (s) => s.replace(/[⟦⟧]/gu, ""); // a sentence as it is said: without the marks round its word

test("each sentence marks its word with ⟦ ⟧, on whole letters with their vowels", () => {
  for (const w of ar.words) {
    assert.match(w.sentence, /^[^⟦⟧]*(?:⟦[^⟦⟧]+⟧[^⟦⟧]*)+$/u, `${w.n} ${w.word}: ${w.sentence}`);
    // A mark never splits a letter from its vowel marks: none starts on a vowel mark, none ends just before one.
    assert.doesNotMatch(w.sentence, new RegExp(`⟦${MARK.source}|⟧${MARK.source}`, "u"), `${w.n}: ${w.sentence}`);
  }
});

test("each sentence is short, ends like a sentence, and is fully vowelled", () => {
  for (const w of ar.words) {
    const tokens = said(w.sentence).split(/\s+/);
    assert.ok(tokens.length >= 2 && tokens.length <= 10, `${w.n}: ${tokens.length} words`);
    assert.match(said(w.sentence), /[.؟!]$/, `${w.n} ends with . ؟ or !`);
    for (const t of tokens) {
      const letters = t.replace(/[^ء-ي]/g, "");
      if (letters.length > 1) assert.match(t, MARK, `${w.n}: “${t}” has no vowel marks`);
    }
    assert.match(w.word, MARK, `${w.n}: the word itself is vowelled`);
  }
});

test("each sentence uses its word (some form of it)", () => {
  const strip = (s) => wordKey(s, "ar").replace(/^ال/, "");
  for (const w of ar.words) {
    const word = strip(w.word);
    const sentence = wordKey(said(w.sentence), "ar");
    if (sentence.includes(word)) continue;
    // Not written the same (رَأَى → رَأَيْتُ, شَيْء → شَيْئًا): the same dictionary word, says the analyzer.
    const [want] = analyzeArabic([w.word], [msa]);
    const keys = analyzeArabic(said(w.sentence).split(/\s+/), [msa]).filter(Boolean).map((a) => a.key);
    assert.ok(want && keys.includes(want.key), `${w.n}: “${w.sentence}” doesn't seem to use ${w.word}`);
  }
});
