// The Moroccan basics course's own checks (the shared ones are course-content.test.mjs and
// dialect-course.test.mjs): every word has published proof of its meaning and is used in real Darija text,
// most used first; a word that looks like a Standard Arabic word says how it differs; the course has no audio;
// and words.json and the published course are up to date with the hand-written list.tsv (tools/course/ar-mor/README.md).
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { MAX_WORDS, MIN_USES, readList } from "../../tools/course/ar-mor/make.mjs";
import { overlaps } from "../../tools/course/dialect/overlap.mjs";

const at = (p) => new URL(`../../${p}`, import.meta.url);
const readJson = (p) => JSON.parse(readFileSync(at(p), "utf8"));
const course = readJson("tools/course/ar-mor/words.json");
const evidence = readJson("tools/course/ar-mor/evidence.json");
const DICTIONARIES = /^(Wiktionary \((Moroccan Arabic|Arabic, labelled Moroccan|Arabic, its Moroccan descendant)\)|Darija Open Dataset \(.+\))$/;

test("ar-mor: every word has a dictionary entry for its meaning, with its page", () => {
  for (const w of course.words) {
    assert.ok(Array.isArray(w.src) && w.src.length, `${w.n} ${w.word}: no dictionary entry`);
    for (const s of w.src) {
      assert.match(s.dictionary, DICTIONARIES, `${w.n}: ${s.dictionary}`);
      assert.ok(String(s.gloss || "").trim() && String(s.entry || "").trim(), `${w.n}: an empty dictionary sense`);
      assert.match(s.url, /^https:\/\/(en\.wiktionary\.org\/wiki\/|github\.com\/darija-open-dataset\/dataset\/blob\/main\/)/, `${w.n}: ${s.url}`);
      assert.doesNotMatch(s.gloss, /vulgar|obscene/i, `${w.n}: cites another word's sense`);
    }
  }
});

test("ar-mor: every word is used in the Darija texts, most used first", () => {
  for (const w of course.words) assert.ok(w.uses >= MIN_USES, `${w.n} ${w.word} is used only ${w.uses} times`);
  for (let i = 1; i < course.words.length; i++) {
    assert.ok(course.words[i].perMillion <= course.words[i - 1].perMillion, `${course.words[i].n} is used more than the word before it`);
  }
});

test("ar-mor: evidence.json has real sentences for every word, in the same order", () => {
  assert.equal(evidence.words.length, course.words.length, "run node tools/course/dialect/evidence.mjs mor");
  evidence.words.forEach((e, i) => {
    assert.equal(e.word, course.words[i].word, `evidence.json word ${i + 1} (run evidence.mjs mor again)`);
    assert.ok(e.examples.length > 0, `${e.word}: no real sentence uses it`);
  });
});

test("ar-mor: a word that looks like a Standard Arabic word says how it differs", () => {
  for (const w of course.words) {
    if ((w.msa || []).length) assert.ok(String(w.note || "").trim(), `${w.n} ${w.word} looks like Standard ${w.msa[0]}: add a note`);
    if ("note" in w) assert.ok(w.note.length <= 120, `${w.n}: its note is long`);
  }
});

test("ar-mor: no word is an MSA word, and the course has no audio", () => {
  assert.deepEqual(overlaps(course.words).map((f) => `${f.n} ${f.word}`), []);
  assert.equal(course.planned, course.words.length);
  assert.ok(course.words.length <= MAX_WORDS);
  assert.equal(course.audio, false, "no voice reads Darija well enough (README.md)");
  assert.ok(!("voice" in course));
});

test("ar-mor: words.json is the one list.tsv describes", () => {
  const list = readList();
  assert.equal(list.length, course.words.length, "list.tsv and words.json have the same words (run make.mjs; take out what it leaves out)");
  const byWord = new Map(course.words.map((w) => [`${w.word}|${w.pos}`, w]));
  for (const row of list) {
    const w = byWord.get(`${row.word}|${row.pos}`);
    assert.ok(w, `${row.word} is in list.tsv but not words.json (run make.mjs)`);
    assert.deepEqual([w.meaning, w.sentence, w.translation, w.note || "", w.form || ""],
      [row.meaning, row.sentence, row.translation, row.note, row.form], `${row.word}: words.json is out of date (run make.mjs)`);
  }
});

test("ar-mor: the published course is words.json, built without audio", { skip: !existsSync(at("docs/course/ar-mor/course.json")) && "not built yet" }, () => {
  const built = readJson("docs/course/ar-mor/course.json");
  assert.equal(built.words.length, course.words.length, "run build_course.py ar-mor --voice none");
  built.words.forEach((w, i) => {
    const src = course.words[i];
    assert.deepEqual([w.n, w.word, w.meaning, w.sentence, w.translation, w.note], [src.n, src.word, src.meaning, src.sentence, src.translation, src.note],
      `${w.n}: docs/course/ar-mor is out of date (run build_course.py ar-mor --voice none)`);
    assert.ok(!w.audio && !w.times, `${w.n}: has audio`);
  });
  assert.equal(built.voice, null);
});
