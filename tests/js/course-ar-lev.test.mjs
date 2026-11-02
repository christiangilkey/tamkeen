// The Levantine basics course's own checks (the shared ones are course-content.test.mjs and
// dialect-course.test.mjs): every word has published proof of its meaning and is used in real Levantine
// text, a word that looks like a Standard Arabic word says how it differs, and words.json is up to date
// with the hand-written list.tsv (tools/course/ar-lev/README.md).
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { readList } from "../../tools/course/ar-lev/make.mjs";
import { overlaps } from "../../tools/course/dialect/overlap.mjs";

const at = (p) => new URL(`../../${p}`, import.meta.url);
const course = JSON.parse(readFileSync(at("tools/course/ar-lev/words.json"), "utf8"));
const evidence = JSON.parse(readFileSync(at("tools/course/ar-lev/evidence.json"), "utf8"));

test("ar-lev: every word has a dictionary entry for its meaning, with its page", () => {
  for (const w of course.words) {
    assert.ok(Array.isArray(w.src) && w.src.length, `${w.n} ${w.word}: no dictionary entry`);
    for (const s of w.src) {
      assert.match(s.dictionary, /^Wiktionary \((North|South) Levantine Arabic|Arabic, labelled Levantine\)$/, `${w.n}: ${s.dictionary}`);
      assert.ok(String(s.gloss || "").trim() && String(s.entry || "").trim(), `${w.n}: an empty dictionary sense`);
      assert.ok(s.url.startsWith("https://en.wiktionary.org/wiki/"), `${w.n}: ${s.url}`);
    }
  }
});

test("ar-lev: every word is used in the Levantine texts, most used first", () => {
  for (const w of course.words) assert.ok(w.uses > 0, `${w.n} ${w.word} is never used in the texts`);
  for (let i = 1; i < course.words.length; i++) assert.ok(course.words[i].uses <= course.words[i - 1].uses, `${course.words[i].n} is used more than the word before it`);
});

test("ar-lev: evidence.json has real sentences for every word, in the same order", () => {
  assert.equal(evidence.words.length, course.words.length, "run node tools/course/dialect/evidence.mjs lev");
  evidence.words.forEach((e, i) => {
    assert.equal(e.word, course.words[i].word, `evidence.json word ${i + 1} (run evidence.mjs lev again)`);
    assert.ok(e.examples.length > 0, `${e.word}: no real sentence uses it`);
  });
});

test("ar-lev: a word that looks like a Standard Arabic word says how it differs", () => {
  for (const w of course.words) {
    const standard = (w.msa || []).filter((m) => !/\(name\)/.test(m));
    if (standard.length) assert.ok(String(w.note || "").trim(), `${w.n} ${w.word} looks like Standard ${standard[0]}: add a note`);
    if ("note" in w) assert.ok(w.note.length <= 120, `${w.n}: its note is long`);
  }
});

test("ar-lev: no word is an MSA word, and the course is the one list.tsv describes", () => {
  assert.deepEqual(overlaps(course.words).map((f) => `${f.n} ${f.word}`), []);
  assert.equal(course.planned, course.words.length);
  assert.equal(course.voice.voice, "ar-SY-AmanyNeural");
  const list = readList();
  assert.equal(list.length, course.words.length, "run node tools/course/ar-lev/make.mjs");
  const byWord = new Map(course.words.map((w) => [`${w.word}|${w.pos}`, w]));
  for (const row of list) {
    const w = byWord.get(`${row.word}|${row.pos}`);
    assert.ok(w, `${row.word} is in list.tsv but not words.json (run make.mjs)`);
    assert.deepEqual([w.meaning, w.sentence, w.translation, w.note || "", w.form || ""],
      [row.meaning, row.sentence, row.translation, row.note, row.form], `${row.word}: words.json is out of date (run make.mjs)`);
  }
});

test("ar-lev: the published course is the word list as built", { skip: !existsSync(at("docs/course/ar-lev/course.json")) && "not built yet" }, () => {
  const built = JSON.parse(readFileSync(at("docs/course/ar-lev/course.json"), "utf8"));
  assert.equal(built.words.length, course.words.length, "build again: build_course.py ar-lev --voice azure");
  built.words.forEach((b, i) => {
    const w = course.words[i];
    assert.deepEqual([b.word, b.sentence, b.translation, b.note || ""], [w.word, w.sentence, w.translation, w.note || ""], `${b.n}: build again`);
    assert.ok(existsSync(at(`docs/course/ar-lev/${b.audio}`)), `${b.n}: its audio ${b.audio}`);
  });
});
