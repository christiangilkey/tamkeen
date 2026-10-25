// Japanese basics course (tools/course/ja/words.json): checks of its own, beside course-content.test.mjs.
//  - a word written with kanji gives its reading in kana in its meaning: "person (ひと)";
//  - the word is a word of its sentence, cut the way the app cuts Japanese (kuromoji and IPADIC), not just
//    letters inside another word: 日 isn't found in 日本, nor 人 in 人気;
//  - `say` (how the voice says the word alone, tools/course/ja/say.py) is kana.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { JapaneseDictionary, tokenize } from "../../web/js/lexicon/kuromoji.js";

const path = new URL("../../tools/course/ja/words.json", import.meta.url);
const course = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
const KANJI = /[㐀-䶿一-鿿々〆ヶ]/u;
const KANA = /^[ぁ-ゖァ-ヺー]+$/u;

test("ja: a word with kanji has its reading in kana in its meaning", { skip: !course }, () => {
  for (const w of course.words) {
    if (!KANJI.test(w.word)) continue;
    assert.match(w.meaning, /\([^()]*[ぁ-ゖ][^()]*\)/u, `${w.n} ${w.word}: “${w.meaning}” has no reading`);
  }
});

test("ja: `say` is kana", { skip: !course }, () => {
  for (const w of course.words) if (w.say !== undefined) assert.match(w.say, KANA, `${w.n} ${w.word}: say “${w.say}”`);
});

test("ja: each word is a word of its sentence, not letters inside another word", { skip: !course }, () => {
  const dict = new JapaneseDictionary(gunzipSync(readFileSync(new URL("../../docs/lexicon/ja-ipadic.bin.gz", import.meta.url))));
  const bad = [];
  for (const w of course.words) {
    const want = new Set([w.word, ...[].concat(w.form || [])]);
    const tokens = tokenize(dict, w.sentence);
    let found = tokens.some((t) => t.basic === w.word);
    // or a run of whole tokens spelt like the word or its form: か+も for かも, 思い for 思う
    for (let i = 0; i < tokens.length && !found; i++) {
      let s = "";
      for (let j = i; j < tokens.length && s.length < 12; j++) {
        s += tokens[j].surface;
        if (want.has(s)) { found = true; break; }
      }
    }
    if (!found) bad.push(`${w.n} ${w.word}: not a word of “${w.sentence}” (${tokens.map((t) => t.surface).join("|")})`);
  }
  assert.deepEqual(bad, []);
});
