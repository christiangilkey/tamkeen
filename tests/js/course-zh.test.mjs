// The Chinese basics course's own checks (the shared ones are in course-content.test.mjs): every meaning
// starts with the word's pinyin with tone marks, in brackets; words and sentences are in simplified
// characters, with Chinese punctuation and no spaces.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

const FILE = new URL("../../tools/course/zh/words.json", import.meta.url);
const LEXICON = new URL("../../docs/lexicon/zh-cedict.json.gz", import.meta.url);

if (existsSync(FILE)) {
  const course = JSON.parse(readFileSync(FILE, "utf8"));
  const { t2s, s2tc } = JSON.parse(gunzipSync(readFileSync(LEXICON)).toString("utf8"));
  // A character with a simplified form that isn't itself a simplified character (么 is both). 著 is also
  // simplified (著名 famous), not only the old form of 着.
  const traditional = (s) => [...s].filter((c) => t2s[c] && t2s[c] !== c && !s2tc[c] && c !== "著");

  test("zh: each meaning starts with the word's pinyin, with tone marks", () => {
    for (const w of course.words) {
      const m = /^\(([^)]+)\) \S/.exec(w.meaning);
      assert.ok(m, `${w.n}: “${w.meaning}” should start with “(pinyin) ”`);
      assert.match(m[1], /^[a-zA-Zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü' ]+$/u, `${w.n}: pinyin “${m[1]}”`);
      // One syllable per character at most (儿 can join the syllable before it).
      const syllables = m[1].match(/[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/gu) || [];
      assert.ok(syllables.length <= [...w.word].length, `${w.n}: more tone marks than characters in “${m[1]}”`);
    }
  });

  test("zh: simplified characters, Chinese punctuation, no spaces", () => {
    for (const w of course.words) {
      for (const k of ["word", "sentence"]) {
        assert.deepEqual(traditional(w[k]), [], `${w.n}: ${k} “${w[k]}” has traditional characters`);
        assert.doesNotMatch(w[k], /[\s,.?!;:]/, `${w.n}: ${k} “${w[k]}” has a space or Western punctuation`);
      }
      assert.match(w.word, /^\p{Script=Han}+$/u, `${w.n}: the word is written in Chinese characters only`);
    }
  });
}
