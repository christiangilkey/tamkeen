// Japanese basics course (tools/course/ja/words.json): checks of its own, beside course-content.test.mjs.
//  - a word written with kanji gives its reading in kana in its meaning: "person (ひと)";
//  - the word is a word of its sentence, cut the way the app cuts Japanese (kuromoji and IPADIC), not just
//    letters inside another word: 日 isn't found in 日本, nor 人 in 人気;
//  - the ⟦ ⟧ marks in the sentence (what the app lights up) start and end where words do, so they sit on the
//    word itself and never on the same kana inside another word;
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
const plain = (s) => s.replace(/[⟦⟧]/gu, "");
let dict;
const ja = () => (dict ||= new JapaneseDictionary(gunzipSync(readFileSync(new URL("../../docs/lexicon/ja-ipadic.bin.gz", import.meta.url)))));

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
  const bad = [];
  for (const w of course.words) {
    const want = new Set([w.word, ...[].concat(w.form || [])]);
    const tokens = tokenize(ja(), plain(w.sentence));
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

test("ja: each ⟦ ⟧ mark starts and ends where a word does", { skip: !course }, () => {
  const bad = [];
  for (const w of course.words) {
    const text = plain(w.sentence);
    const tokens = tokenize(ja(), text);
    const edges = new Set([0, text.length, ...tokens.map((t) => t.start)]);
    // The marked pieces, as positions in the sentence without its marks.
    const pieces = [];
    for (let i = 0, at = 0, open = -1; i < w.sentence.length; i++) {
      const c = w.sentence[i];
      if (c === "⟦") open = at;
      else if (c === "⟧") pieces.push([open, at]);
      else at++;
    }
    if (!pieces.length) { bad.push(`${w.n} ${w.word}: no ⟦ ⟧ mark`); continue; }
    for (const [a, b] of pieces) {
      if (edges.has(a) && edges.has(b)) continue;
      // The word inside a token spelt like one of its forms (後 in 後で, 客 in お客) is fine too.
      const t = tokens.find((t) => t.start <= a && b <= t.start + t.surface.length);
      if (t && [].concat(w.form || []).includes(t.surface) && text.slice(a, b) === w.word) continue;
      bad.push(`${w.n} ${w.word}: “${text.slice(a, b)}” isn't a whole word in ${tokens.map((t) => t.surface).join("|")}`);
    }
  }
  assert.deepEqual(bad, []);
});
