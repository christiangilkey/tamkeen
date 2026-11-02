// The Egyptian basics course's own checks (tools/course/ar-egy), beside the shared ones (course-content.test.mjs
// for every word list, dialect-course.test.mjs for the no-MSA rule). The proof the owner asked for ("real solid
// evidence that each word means what you thought it meant"): every word has a published dictionary meaning that
// matches what the course teaches, and is used in the Egyptian texts; every word the Standard Arabic dictionary
// can read, or that is an MSA basics word once a sound change is undone, says in its note how it differs; and the
// voice is Azure's Egyptian one. tools/course/ar-egy/proof.mjs makes evidence.json; order.mjs puts the list in order.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const at = (p) => new URL(`../../${p}`, import.meta.url);
const made = existsSync(at("tools/course/ar-egy/words.json"));
const read = (p) => JSON.parse(readFileSync(at(p), "utf8"));
const course = made ? read("tools/course/ar-egy/words.json") : { words: [] };
const evidence = made ? read("tools/course/ar-egy/evidence.json") : { words: [] };

// Where a meaning may come from: published dictionaries only (proof.mjs, cites.json).
const SOURCES = /^(Wiktionary \(Egyptian Arabic\)|Wiktionary \(Arabic\)|CAMeL Egyptian lexicon|Lisaan Masry \(Egyptian Arabic dictionary, lisaanmasry\.org\)|Wiktionary \(.+\), checked on its site)$/;
const MARKS = /[ً-ْٰ]/g;
const STOP = new Set(["the", "and", "for", "with", "into", "from", "to", "be", "of", "an", "or", "is", "on", "in", "at", "as", "it", "he", "she"]);
const keys = (s) => String(s).toLowerCase().split(/[^a-z]+/).filter((x) => x.length >= 2 && !STOP.has(x)).map((x) => x.replace(/(ing|ed|es|s)$/, ""));

test("ar-egy: the course is Egyptian, voiced by Azure's Egyptian voice, as long as its list", { skip: !made && "not made yet" }, () => {
  assert.equal(course.lang, "ar-egy");
  assert.match(course.voice.voice, /^ar-EG-\w+Neural$/);
  assert.equal(course.voice.locale, "ar-EG");
  assert.equal(course.planned, course.words.length);
});

test("ar-egy: evidence.json is up to date with the word list", { skip: !made && "not made yet" }, () => {
  assert.deepEqual(evidence.words.map((e) => `${e.n} ${e.word}`), course.words.map((w) => `${w.n} ${w.word}`),
    "run node tools/course/ar-egy/proof.mjs");
});

test("ar-egy: every word has a published meaning that matches what the course teaches", { skip: !made && "not made yet" }, () => {
  for (const [i, w] of course.words.entries()) {
    const own = evidence.words[i].meanings.filter((m) => !m.from);
    assert.ok(own.length, `${w.n} ${w.word}: no dictionary entry`);
    for (const m of own) assert.match(m.src, SOURCES, `${w.n} ${w.word}: ${m.src}`);
    const taught = new Set(keys(w.meaning));
    assert.ok(own.some((m) => keys(m.gloss).some((k) => taught.has(k))),
      `${w.n} ${w.word}: no dictionary gloss says “${w.meaning}”`);
  }
});

test("ar-egy: every word is used in the Egyptian texts, and the list goes most used first", { skip: !made && "not made yet" }, () => {
  for (const [i, e] of evidence.words.entries()) {
    assert.ok(e.comments + e.subtitles + e.forums >= 15, `${e.word}: used ${e.comments + e.subtitles + e.forums} times`);
    if (i) assert.ok(e.perMillion <= evidence.words[i - 1].perMillion, `${e.word} is used more than the word before it`);
  }
});

test("ar-egy: a word that looks like Standard Arabic says how it differs", { skip: !made && "not made yet" }, () => {
  for (const [i, w] of course.words.entries()) {
    const flags = evidence.words[i].flags || [];
    assert.ok(!flags.some((f) => f.startsWith("LIST")), `${w.word} is an MSA list word`);
    if (flags.some((f) => /^(MSA|SHIFT):/.test(f))) assert.ok(String(w.note || "").trim(), `${w.n} ${w.word} (${flags.join(" ")}) needs a note`);
  }
});

test("ar-egy: each word is said the way it is written in its sentence, and lit up there", { skip: !made && "not made yet" }, () => {
  for (const w of course.words) {
    assert.equal(w.say, w.word.replace(MARKS, ""), `${w.n}: say is the word without vowel marks`);
    assert.doesNotMatch(w.sentence, /[A-Za-z]/, `${w.n}: Latin letters in the sentence`);
    const lit = (w.sentence.match(/⟦([^⟦⟧]+)⟧/) || [])[1] || "";
    assert.ok(lit.includes(w.form) || w.form.includes(lit), `${w.n}: the lit-up part “${lit}” isn't the word “${w.form}”`);
    assert.ok((w.forms || []).length, `${w.n}: the spellings it is counted in`);
  }
});
