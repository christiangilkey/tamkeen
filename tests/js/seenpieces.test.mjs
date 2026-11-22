// Run with: node --test tests/js/
// New words are worked out a piece at a time, the words on screen first (lexicon/seen.js; the owner, 2026-11-21:
// the purple words took a long time to show up). Read in pieces, a long text must come out exactly as it does read
// whole, in every language with a context-reading analyser (Arabic's dialect, English, German, the Romance tables).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { Dictionary, textDialect } from "../../web/js/lexicon/arabic.js";
import { LemmaTable } from "../../web/js/lexicon/romance.js";
import { lexemesFor, pieceRanges, wholeTextOptions } from "../../web/js/lexicon/words.js";

const raw = (name) => JSON.parse(gunzipSync(readFileSync(fileURLToPath(new URL(`../../docs/lexicon/${name}`, import.meta.url)))));
const DICTS = {
  ar: () => ["msa", "egy", "lev", "glf"].map((n) => new Dictionary(raw(`ar-${n}.json.gz`))),
  es: () => [new LemmaTable(raw("es-lemmas.json.gz"))],
  en: () => [new LemmaTable(raw("en-lemmas.json.gz"))],
  de: () => [new LemmaTable(raw("de-lemmas.json.gz"))],
};

/** A long text of real sentences in `lang`: its example sentences, joined (a transcript has no line breaks). */
function longText(lang, words) {
  const sentences = [];
  JSON.stringify(raw(`${lang === "en" ? "es" : lang}-examples.json.gz`)).replace(/"([^"]{20,240})"/g, (_, s) => { sentences.push(s); return ""; });
  return sentences.join(" ").split(/\s+/).filter(Boolean).slice(0, words);
}

/** How seen.js reads it: pieces, the one at `start` first, each read on its own with the whole text's options. */
function inPieces(tokens, lang, dicts, start) {
  const out = new Array(tokens.length);
  const whole = wholeTextOptions(tokens, lang, dicts);
  for (const [a, b] of pieceRanges(tokens, start)) {
    const found = lexemesFor(tokens.slice(a, b), lang, dicts, whole);
    for (let k = 0; k < found.length; k++) out[a + k] = found[k];
  }
  return out;
}

test("pieces cover every word once, end at a sentence's end, and the one on screen comes first", () => {
  const tokens = Array.from({ length: 2000 }, (_, i) => (i % 25 === 24 ? `w${i}.` : `w${i}`));
  const ranges = pieceRanges(tokens, 1300);
  assert.ok(ranges[0][0] <= 1300 && 1300 < ranges[0][1], "the piece on screen first");
  const sorted = [...ranges].sort((x, y) => x[0] - y[0]);
  let at = 0;
  for (const [a, b] of sorted) { assert.equal(a, at, "no gap and no overlap"); at = b; }
  assert.equal(at, tokens.length);
  for (const [, b] of sorted.slice(0, -1)) assert.match(tokens[b - 1], /\.$/, "cut after a full stop");
  assert.deepEqual(pieceRanges(tokens, 0)[0][0], 0);
  assert.deepEqual(pieceRanges([], 0), []);
  // No full stop at all (a transcript without punctuation): cut at twice the size rather than never.
  const bare = Array.from({ length: 3000 }, (_, i) => `w${i}`);
  assert.ok(pieceRanges(bare, 0).every(([a, b]) => b - a <= 1200));
});

for (const lang of Object.keys(DICTS)) {
  test(`${lang}: a long text read in pieces is read exactly as when read whole`, () => {
    const dicts = DICTS[lang]();
    const tokens = longText(lang, 6000);
    assert.ok(tokens.length > 3000, "a long text");
    const whole = lexemesFor(tokens, lang, dicts).map((x) => x && x.key);
    for (const start of [0, Math.floor(tokens.length / 2), tokens.length - 1]) {
      assert.deepEqual(inPieces(tokens, lang, dicts, start).map((x) => x && x.key), whole, `starting at word ${start}`);
    }
  });
}

test("Arabic: the whole text's dialect is the one each piece is read in", () => {
  const dicts = DICTS.ar();
  const tokens = longText("ar", 3000);
  assert.deepEqual(wholeTextOptions(tokens, "ar", dicts), { dialect: textDialect(tokens, dicts) });
  assert.deepEqual(wholeTextOptions(tokens, "es", DICTS.es()), {}, "other languages need nothing");
});
