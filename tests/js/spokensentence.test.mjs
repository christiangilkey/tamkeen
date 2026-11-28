// Run with: node --test tests/js/
// The sentence a heard word is saved with (web/js/wordlookup.js spokenSentence): the whole sentence across the
// transcript's lines, not only the caption line on screen (the owner, 2026-11-27: "it only is pulling from what was
// currently being displayed. I want it to be able to sense the full sentence from the script").
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isPunctuated, LONG_PAUSE_S, SENTENCE_MAX, spokenSentence, startsSentence } from "../../web/js/wordlookup.js";

/** Words said one after another, `step` seconds apart, each lasting most of it; `gaps` adds a silence before a word. */
function timed(n, { step = 0.4, gaps = {} } = {}) {
  const starts = [], ends = [];
  let t = 0;
  for (let k = 0; k < n; k++) {
    t += gaps[k] || 0;
    starts.push(t);
    ends.push(t + step * 0.8);
    t += step;
  }
  return { starts, ends };
}
const words = (s) => s.split(" ");
const text = (texts, [a, b]) => texts.slice(a, b + 1).join(" ");

test("a sentence split over two caption lines is saved whole (the owner's 'superar' card)", () => {
  const texts = words("Y eso es lo que nos lleva. Incluso puedes tú superar para alcanzar lo que te propones. Gracias.");
  // The caption lines broke in the middle of the sentence: "Incluso puedes tú superar para alcanzar" | "lo que te propones."
  const segs = [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3];
  const k = texts.indexOf("superar");
  const r = spokenSentence(texts, segs, k, k, timed(texts.length));
  assert.equal(text(texts, r), "Incluso puedes tú superar para alcanzar lo que te propones.");
  // A word at the start of the next line belongs to the same sentence too.
  assert.deepEqual(spokenSentence(texts, segs, texts.indexOf("propones."), undefined, timed(texts.length)), r);
  assert.equal(text(texts, spokenSentence(texts, segs, texts.length - 1)), "Gracias.");
});

test("YouTube's automatic captions have no punctuation: the speaker's pauses end the sentence", () => {
  const texts = words("vamos a ver los aprendizajes de esta conversación para que tú puedas aplicarlos hoy bueno empecemos");
  assert.equal(isPunctuated(texts), false);
  const segs = texts.map((_, k) => Math.floor(k / 4)); // lines of four words, as YouTube shows them
  const pauseAt = texts.indexOf("bueno");
  const times = timed(texts.length, { gaps: { [pauseAt]: 1.2 } });
  const r = spokenSentence(texts, segs, texts.indexOf("aprendizajes"), undefined, times);
  assert.equal(text(texts, r), "vamos a ver los aprendizajes de esta conversación para que tú puedas aplicarlos hoy",
    "across the four-word lines, up to the pause");
  assert.equal(text(texts, spokenSentence(texts, segs, pauseAt + 1, undefined, times)), "bueno empecemos");
  // With no times to go by, unpunctuated lines are the sentences.
  assert.equal(text(texts, spokenSentence(texts, segs, 5)), "aprendizajes de esta conversación");
});

test("at most about 30 words, kept around the word, never part of a word", () => {
  const texts = Array.from({ length: 100 }, (_, k) => `w${k}`);
  const segs = texts.map((_, k) => Math.floor(k / 7));
  const times = timed(100);
  const mid = spokenSentence(texts, segs, 50, 50, times);
  assert.deepEqual(mid, [36, 65]);
  assert.equal(mid[1] - mid[0] + 1, SENTENCE_MAX);
  assert.deepEqual(spokenSentence(texts, segs, 2, 2, times), [0, 29], "near the start: the room goes after it");
  assert.deepEqual(spokenSentence(texts, segs, 98, 98, times), [70, 99], "near the end: before it");
  assert.deepEqual(spokenSentence(texts, segs, 40, 45, times), [28, 57], "a phrase: kept whole, the rest around it");
  assert.deepEqual(spokenSentence(texts, segs, 10, 50, times), [10, 50], "a phrase longer than that is itself");
  // A punctuated sentence that runs on and on is cut down the same way.
  const long = [...Array.from({ length: 60 }, (_, k) => `x${k}`), "fin."];
  assert.equal(spokenSentence(long, long.map(() => 0), 30, 30).flat().length, 2);
  const [a, b] = spokenSentence(long, long.map(() => 0), 30);
  assert.ok(b - a + 1 === SENTENCE_MAX && a <= 30 && b >= 30);
});

test("Arabic (right to left): ؟ and the full stop end a sentence across lines", () => {
  const texts = words("قال الرجل. ثم ذهب إلى البيت وجلس مع أمه؟ نعم");
  const segs = [0, 0, 0, 0, 0, 1, 1, 1, 1, 2];
  const r = spokenSentence(texts, segs, texts.indexOf("البيت"), undefined, timed(texts.length));
  assert.equal(text(texts, r), "ثم ذهب إلى البيت وجلس مع أمه؟");
  assert.equal(text(texts, spokenSentence(texts, segs, 0)), "قال الرجل.");
});

test("Chinese and Japanese: 。！？ end a sentence across lines (words as the app splits them)", () => {
  const texts = ["我", "今天", "去", "市场", "买", "了", "很多", "水果。", "你", "呢？"];
  const segs = [0, 0, 0, 0, 1, 1, 1, 1, 2, 2];
  assert.deepEqual(spokenSentence(texts, segs, 4), [0, 7]);
  assert.deepEqual(spokenSentence(texts, segs, 8), [8, 9]);
  const ja = ["私は", "毎日", "日本語を", "勉強", "します。", "楽しい！"];
  assert.deepEqual(spokenSentence(ja, [0, 0, 1, 1, 1, 2], 1), [0, 4]);
});

test("Spanish ¿ and ¡ open a sentence; a long silence ends one even with punctuation", () => {
  assert.ok(startsSentence("¿Qué") && startsSentence("«¡Vamos") && !startsSentence("que"));
  const texts = words("Sí claro ¿qué quieres hacer hoy? ¡Vamos ya!");
  const segs = [0, 0, 0, 1, 1, 1, 2, 2];
  assert.equal(text(texts, spokenSentence(texts, segs, texts.indexOf("quieres"))), "¿qué quieres hacer hoy?");
  assert.equal(text(texts, spokenSentence(texts, segs, 0)), "Sí claro", "(no full stop before ¿: it still begins one)");
  const said = words("Bueno entonces nos vemos mañana. Hola a todos y bienvenidos.");
  const pause = said.indexOf("entonces");
  const times = timed(said.length, { gaps: { [pause]: LONG_PAUSE_S + 0.5 } });
  assert.equal(text(said, spokenSentence(said, said.map(() => 0), 0, 0, times)), "Bueno");
});

test("punctuated or not: one sentence end in about 40 words is enough to go by punctuation", () => {
  assert.equal(isPunctuated([]), false);
  assert.equal(isPunctuated(words("uno dos tres.")), true);
  assert.equal(isPunctuated([...Array.from({ length: 39 }, () => "a"), "b."]), true);
  assert.equal(isPunctuated([...Array.from({ length: 80 }, () => "a"), "b."]), false);
  assert.deepEqual(spokenSentence([], [], 0), [-1, -1]);
});

test("every player that saves a heard word uses it: podcasts and videos, reels, Netflix and Prime Video", () => {
  const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
  for (const p of ["web/js/pages/player.js", "web/js/pages/reels.js", "extension/src/js/ext/panel.js", "extension/src/js/ext/prime-panel.js"]) {
    const src = read(p);
    assert.match(src, /spokenSentence/, p);
    assert.ok(!/sentenceBounds\(/.test(src), `${p}: no longer cut at the line on screen`);
  }
});
