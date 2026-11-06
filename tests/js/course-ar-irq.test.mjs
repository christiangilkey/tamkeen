// The Iraqi basics course's own checks (the shared ones are course-content.test.mjs and dialect-course.test.mjs):
// every word has published proof of its meaning and is used in real Iraqi text, a word that looks like a Standard
// Arabic word says how it differs, words.json is up to date with the hand-written list.tsv, and the voice is told
// how to say every word written with گ or چ, which it would otherwise skip (tools/course/ar-irq/README.md).
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { readList, readSounds, unsaidWords, UNSAID, VOICE } from "../../tools/course/ar-irq/make.mjs";
import { overlaps } from "../../tools/course/dialect/overlap.mjs";
import { sayable } from "../../web/js/grammardata.js";

const at = (p) => new URL(`../../${p}`, import.meta.url);
const course = JSON.parse(readFileSync(at("tools/course/ar-irq/words.json"), "utf8"));
const evidence = JSON.parse(readFileSync(at("tools/course/ar-irq/evidence.json"), "utf8"));

test("ar-irq: every word has a published source for its meaning (Wiktionary or Tatoeba), with its page", () => {
  for (const w of course.words) {
    assert.ok(Array.isArray(w.src) && w.src.length, `${w.n} ${w.word}: no published source`);
    for (const s of w.src) {
      assert.match(s.dictionary, /^(Wiktionary|Tatoeba) \(.+\)$/, `${w.n}: ${s.dictionary}`);
      assert.ok(String(s.gloss || "").trim() && String(s.entry || "").trim(), `${w.n}: an empty dictionary sense`);
      assert.ok(/^https:\/\/(en\.wiktionary\.org\/wiki\/|tatoeba\.org\/en\/sentences\/show\/\d+$)/.test(s.url), `${w.n}: ${s.url}`);
    }
  }
});

test("ar-irq: every word is used in the Iraqi texts, most used first", () => {
  for (const w of course.words) assert.ok(w.uses > 0, `${w.n} ${w.word} is never used in the texts`);
  for (let i = 1; i < course.words.length; i++) assert.ok(course.words[i].uses <= course.words[i - 1].uses, `${course.words[i].n} is used more than the word before it`);
});

test("ar-irq: evidence.json has real sentences for every word, in the same order", () => {
  assert.equal(evidence.words.length, course.words.length, "run node tools/course/dialect/evidence.mjs irq");
  evidence.words.forEach((e, i) => {
    assert.equal(e.word, course.words[i].word, `evidence.json word ${i + 1} (run evidence.mjs irq again)`);
    assert.ok(e.examples.length > 0, `${e.word}: no real sentence uses it`);
  });
});

test("ar-irq: a word that looks like a Standard Arabic word says how it differs", () => {
  for (const w of course.words) {
    const standard = (w.msa || []).filter((m) => !/\(name\)/.test(m));
    if (standard.length) assert.ok(String(w.note || "").trim(), `${w.n} ${w.word} looks like Standard ${standard[0]}: add a note`);
    if ("note" in w) assert.ok(w.note.length <= 120, `${w.n}: its note is long`);
  }
});

test("ar-irq: no word is an MSA word, and the course is the one list.tsv describes", () => {
  assert.deepEqual(overlaps(course.words).map((f) => `${f.n} ${f.word}`), []);
  assert.equal(course.planned, course.words.length);
  const list = readList();
  assert.equal(list.length, course.words.length, "run node tools/course/ar-irq/make.mjs");
  const byWord = new Map(course.words.map((w) => [`${w.word}|${w.pos}`, w]));
  for (const row of list) {
    const w = byWord.get(`${row.word}|${row.pos}`);
    assert.ok(w, `${row.word} is in list.tsv but not words.json (run make.mjs)`);
    assert.deepEqual([w.meaning, w.sentence, w.translation, w.note || "", w.form || ""],
      [row.meaning, row.sentence, row.translation, row.note, row.form], `${row.word}: words.json is out of date (run make.mjs)`);
  }
});

// Azure's Iraqi voices say nothing for گ and چ; Bassel says them from IPA (build_course.py "ipa", a plain g).
test("ar-irq: the voice knows how to say every word written with گ or چ", () => {
  assert.deepEqual([course.voice.voice, course.voice.locale, course.voice.name], [VOICE.voice, VOICE.locale, VOICE.name]);
  assert.equal(course.voice.unsaid, UNSAID);
  const needed = unsaidWords(course.words.flatMap((w) => [w.word, w.sentence]));
  assert.ok(needed.length > 10, "the course writes the Baghdad g and ch");
  assert.deepEqual(needed.filter((t) => !course.voice.ipa[t]), [], "add these to sounds.tsv and run make.mjs");
  assert.deepEqual(Object.keys(course.voice.ipa).sort(), [...needed].sort(), "words.json carries only the sounds it uses");
  for (const [word, ipa] of Object.entries(course.voice.ipa)) {
    assert.equal(readSounds()[word], ipa, `${word}: as sounds.tsv says`);
    assert.ok(!ipa.includes("ɡ"), `${word}: write g as a plain g (the IPA letter came out silent)`);
    if (word.includes("چ")) assert.ok(ipa.includes("tʃ"), `${word}: چ is said tʃ`);
    if (word.includes("گ")) assert.ok(ipa.includes("g"), `${word}: گ is said g`);
  }
});

test("a grammar example's گ and چ go to the card voice as the Standard letters (ق, ك), only in Arabic", () => {
  assert.equal(sayable("گَال: الْبَيْت چِبِير.", "ar"), "قَال: الْبَيْت كِبِير.");
  assert.equal(sayable("شلونك", "ar"), "شلونك");
  assert.equal(sayable("گل", "fa"), "گل", "Persian has these letters of its own");
});

test("ar-irq: the published course is the word list as built", { skip: !existsSync(at("docs/course/ar-irq/course.json")) && "not built yet" }, () => {
  const built = JSON.parse(readFileSync(at("docs/course/ar-irq/course.json"), "utf8"));
  assert.equal(built.words.length, course.words.length, "build again: build_course.py ar-irq --voice azure");
  assert.equal(built.voice.name, VOICE.name);
  built.words.forEach((b, i) => {
    const w = course.words[i];
    assert.deepEqual([b.word, b.sentence, b.translation, b.note || ""], [w.word, w.sentence, w.translation, w.note || ""], `${b.n}: build again`);
    assert.ok(existsSync(at(`docs/course/ar-irq/${b.audio}`)), `${b.n}: its audio ${b.audio}`);
  });
});
