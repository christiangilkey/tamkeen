// The Gulf (Saudi) basics list keeps its proof: every word in tools/course/ar-glf/words.json has, in
// evidence.json, a published source for its meaning (with a link), real counts in the Saudi texts, and real
// Saudi sentences. tools/course/ar-glf/README.md explains the sources.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const DIR = new URL("../../tools/course/ar-glf/", import.meta.url);
const read = (f) => JSON.parse(readFileSync(new URL(f, DIR), "utf8"));
const words = read("words.json");
const evidence = read("evidence.json");
const list = read("list.json");

test("ar-glf: every word has its evidence, in the same order", () => {
  assert.equal(evidence.words.length, words.words.length);
  words.words.forEach((w, i) => {
    const e = evidence.words[i];
    assert.equal(e.n, w.n);
    assert.equal(e.word, w.word);
  });
});

test("ar-glf: every word's meaning has a published source with a link", () => {
  for (const e of evidence.words) {
    assert.ok(e.meanings.length >= 1, `${e.n} ${e.word}: no published meaning`);
    for (const m of e.meanings) {
      assert.ok(String(m.src || "").trim() && String(m.gloss || "").trim(), `${e.n} ${e.word}: a meaning without its source or gloss`);
      assert.match(String(m.url || ""), /^https:\/\//, `${e.n} ${e.word}: ${m.src} has no link`);
    }
  }
});

test("ar-glf: every word is used in the Saudi texts and has real example sentences", () => {
  for (const e of evidence.words) {
    const total = Object.values(e.counted.count).reduce((a, b) => a + b, 0);
    assert.ok(total >= 100, `${e.n} ${e.word}: only ${total} uses counted`);
    const examples = Object.values(e.examples).flat();
    assert.ok(examples.length >= 2, `${e.n} ${e.word}: ${examples.length} example sentences`);
  }
});

test("ar-glf: the word list is built from list.json, with the approved Saudi voice", () => {
  assert.equal(words.words.length, list.length);
  assert.equal(words.planned, words.words.length);
  assert.equal(words.voice.voice, "ar-SA-HamedNeural");
  const chosen = new Set(list.map((w) => w.word));
  for (const w of words.words) assert.ok(chosen.has(w.word), `${w.word} isn't in list.json`);
});
