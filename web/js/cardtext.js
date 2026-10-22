// What a word's card shows as its sentence: one short line, whatever the word was saved from.
//
// A word saved from a player comes with one caption line or spoken sentence: short. A word saved
// from a web page comes with the page's sentence, and news Arabic in particular writes whole
// paragraphs as one sentence joined by commas. The owner wants every card the same size, so a
// card shows only the part of its sentence around the word: the clause it is in, plus the clauses
// either side while they fit. The saved sentence itself is never changed: this is only how it is
// shown (the Vocab page, the reviewer's card), so nothing of the original is lost.

export const CARD_SENTENCE_MAX = 110; // characters: about two lines on a phone, like a caption line

// Arabic vowel marks and the stretching line: left out when comparing, kept when showing.
const HARAKAT = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/;
const HARAKAT_ALL = new RegExp(HARAKAT.source, "g");
const LETTER = { "أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا", "ى": "ي", "ة": "ه", "ی": "ي", "ک": "ك" };
// Persian: the half space inside a word (ZWNJ) is left out when comparing, so می‌خواهم and میخواهم are one word.
const ZWNJ = /‌/g;
const isZwnj = (ch) => ch === "‌";

/** Text as it is compared: no vowel marks or punctuation, one spelling for the Arabic letters
 * that are written several ways (and Persian's own y and k, ی ک), lower case. */
export function fold(text) {
  return String(text || "").normalize("NFC").replace(HARAKAT_ALL, "").replace(ZWNJ, "").replace(/[یک]/g, (c) => LETTER[c]).replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه")
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, " ").trim().toLowerCase();
}

/** [from, to) of `word` inside `text`, compared without vowel marks or letter variants; null if absent. */
export function findWord(text, word) {
  text = String(text || "");
  const plain = [];
  const at = []; // at[i] = where plain[i] is in `text`
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (HARAKAT.test(ch) || isZwnj(ch)) continue;
    plain.push((LETTER[ch] || ch).toLowerCase());
    at.push(i);
  }
  const want = [...String(word || "").replace(HARAKAT_ALL, "").replace(ZWNJ, "")].map((ch) => (LETTER[ch] || ch).toLowerCase()).join("").trim();
  if (!want) return null;
  const k = plain.join("").indexOf(want);
  if (k < 0) return null;
  const last = at[k + want.length - 1];
  let to = last + 1;
  while (to < text.length && HARAKAT.test(text[to])) to++; // the last letter's own vowel marks
  return [at[k], to];
}

// A clause ends after one of these, where a space follows.
const CLAUSE_END = /[،,;؛:.!?؟…\n]/u;
const SENTENCE_END = /[.!?؟…]$/u;

/**
 * `text` cut down to at most `limit` characters around [from, to): whole clauses when they fit,
 * else whole words. "…" marks a side that was cut. Text that already fits is returned unchanged.
 */
export function trimAround(text, from, to, limit = CARD_SENTENCE_MAX) {
  text = String(text || "");
  if (text.length <= limit) return text;
  from = Math.max(0, Math.min(from, text.length));
  to = Math.max(from, Math.min(to, text.length));
  // Clauses: [start, end) spans that together cover the text.
  const spans = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (CLAUSE_END.test(text[i]) && /\s/.test(text[i + 1] || "")) { spans.push([start, i + 1]); start = i + 1; }
  }
  if (start < text.length) spans.push([start, text.length]);
  const of = (pos) => Math.max(0, spans.findIndex(([s, e]) => pos >= s && pos < e));
  let a = of(from);
  let b = of(Math.max(from, to - 1));
  const size = () => text.slice(spans[a][0], spans[b][1]).trim().length;
  let lo, hi;
  if (size() <= limit) {
    // Add the clauses either side, the one after first, while they fit.
    for (let grew = true; grew;) {
      grew = false;
      if (b + 1 < spans.length) { b++; if (size() <= limit) grew = true; else b--; }
      if (a > 0) { a--; if (size() <= limit) grew = true; else a++; }
    }
    lo = spans[a][0];
    hi = spans[b][1];
  } else {
    // One clause longer than a card: whole words either side of the word, while they fit.
    lo = from;
    hi = to;
    const room = () => limit - text.slice(lo, hi).trim().length;
    for (let grew = true; grew;) {
      grew = false;
      const next = text.slice(hi).match(/^\s*\S+/u);
      if (next && room() >= next[0].length) { hi += next[0].length; grew = true; }
      const prev = text.slice(0, lo).match(/\S+\s*$/u);
      if (prev && room() >= prev[0].length) { lo -= prev[0].length; grew = true; }
    }
  }
  let out = text.slice(lo, hi).trim();
  if (hi < text.trimEnd().length) out = out.replace(/[\s،,;؛:]+$/u, "") + (SENTENCE_END.test(out) ? "" : "…");
  if (lo > 0 && text.slice(0, lo).trim()) out = "…" + out;
  return out;
}

/** The part of a word's sentence its card shows (see the top of this file). */
export function cardSentence(sentence, word, limit = CARD_SENTENCE_MAX) {
  sentence = String(sentence || "");
  if (sentence.length <= limit) return sentence;
  const at = findWord(sentence, word) || [0, 0];
  return trimAround(sentence, at[0], at[1], limit);
}

/** The same for the sentence's translation, around the part marked ⟦ ⟧ as rendering the word.
 * A mark the cut would leave without its partner is dropped. */
export function cardTranslation(translation, limit = CARD_SENTENCE_MAX) {
  translation = String(translation || "");
  const shown = translation.replace(/[⟦⟧]/gu, "");
  if (shown.length <= limit) return translation;
  const open = translation.indexOf("⟦");
  const close = translation.indexOf("⟧", open + 1);
  const cut = open >= 0 && close > open ? trimAround(translation, open, close + 1, limit + 2) : trimAround(translation, 0, 0, limit);
  let out = "";
  let inside = false;
  for (let i = 0; i < cut.length; i++) {
    const ch = cut[i];
    if (ch === "⟦") {
      if (inside || cut.indexOf("⟧", i + 1) < 0) continue;
      inside = true;
    } else if (ch === "⟧") {
      if (!inside) continue;
      inside = false;
    }
    out += ch;
  }
  return out;
}
