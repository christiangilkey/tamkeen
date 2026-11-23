// A lesson's words, as the lesson page draws them (prototype lesson_words, components/lessonwords.js). No screen code:
// the same on the computer, the phones and the web app, and tests/js/lessonwords.test.mjs runs it.

import { gap, regroupWords } from "./languages.js";

const escText = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/**
 * The words of several texts, in order: {text: [...words], seg: [...which text each word is in]}. Words are what the
 * spaces divide, as a book's are (pages/reader.js), and Japanese, Chinese and Thai text is split into its real words
 * (languages.js regroupWords, as a page's is).
 */
export function lessonTokens(texts, lang) {
  const W = { start: [], end: [], text: [], seg: [] };
  (texts || []).forEach((s, k) => {
    for (const w of String(s == null ? "" : s).split(/\s+/)) {
      if (!w) continue;
      const i = W.text.length;
      W.start.push(i); W.end.push(i + 1); W.text.push(w); W.seg.push(k);
    }
  });
  const R = regroupWords(W, lang, false);
  return { text: R.text.map(String), seg: R.seg.map(Number) };
}

/** The HTML for text number `k`'s words, from word `from` on: a span per word, `data-i` its place among all the
 *  lesson's words. `face(word, lang)` draws a word (wordface.js wordHtml: readings for Japanese and Chinese).
 *  Resolves to {html, next} (`next`: the first word of the following text). */
export function wordsHtml(tok, k, from, lang, face = escText) {
  const parts = [];
  let w = from;
  while (w < tok.text.length && tok.seg[w] === k) {
    if (w > from) parts.push(gap(tok.text[w - 1], tok.text[w], lang));
    parts.push(`<span class="w" data-i="${w}">${face(tok.text[w], lang)}</span>`);
    w++;
  }
  return { html: parts.join(""), next: w };
}
