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

// A sentence can say where its word is: ⟦ ⟧ round the part that carries the word's meaning there (the
// basics courses mark every sentence; holding a word in a review card marks it too). The marks are
// never shown or said: they only decide what is lit up. Without them the word is looked for.
// A sentence in which the learner put out every lit word on the review card (even the word the card
// found by itself) starts with an empty pair, ⟦⟧: nothing in it is lit.
const PAIRED = /^[^⟦⟧]*(?:⟦[^⟦⟧]+⟧[^⟦⟧]*)+$/u;
/** The start of a sentence in which nothing is lit (see above). */
export const NO_MARKS = "⟦⟧";

/** The text without its ⟦ ⟧ marks. */
export const stripMarks = (s) => String(s ?? "").replace(/[⟦⟧]/gu, "");

/** {text, spans}: the sentence without its marks, and the [from, to) of each marked part in that text;
 * spans is null when the sentence has no marks, or marks that don't pair up; [] when it starts with
 * NO_MARKS (nothing lit). */
export function sentenceMarks(sentence) {
  sentence = String(sentence ?? "");
  if (sentence.startsWith(NO_MARKS) && !/[⟦⟧]/u.test(sentence.slice(NO_MARKS.length))) {
    return { text: sentence.slice(NO_MARKS.length), spans: [] };
  }
  if (!PAIRED.test(sentence)) return { text: stripMarks(sentence), spans: null };
  const spans = [];
  let text = "";
  for (const part of sentence.split(/(⟦[^⟦⟧]+⟧)/u)) {
    if (part.startsWith("⟦")) {
      spans.push([text.length, text.length + part.length - 2]);
      text += part.slice(1, -1);
    } else text += part;
  }
  return { text, spans };
}

// Arabic-script letters, which join their neighbours: a <b> inside a word would break the joins.
const JOINING = /[ؠ-يٮ-ۓەۺ-ۼݐ-ݿࢠ-ࣉ]/u;
const ZWJ = "‍";

/** The sentence as HTML with its word in <b>: what its ⟦ ⟧ marks say, else where the word is found.
 * `esc` escapes text. Where a lit part starts or ends inside a word of joining letters (Arabic,
 * Persian), a zero-width joiner on both sides of the edge keeps the letters joined. */
export function markedSentenceHtml(sentence, word, esc) {
  const { text, marks } = litParts(sentence, word);
  return marks.length ? litTextHtml(text, marks, esc) : esc(text);
}

/**
 * What a card lights up in `sentence` (as stored): {text, marks, chosen}. `text` is the sentence
 * without its marks; `marks` the lit parts in it: the marked ones when it has marks (`chosen`), else
 * the card's `word` wherever it is found. With `word` null (a translation) only marked parts are lit.
 */
export function litParts(sentence, word = null) {
  const { text, spans } = sentenceMarks(sentence);
  if (spans) return { text, marks: spans, chosen: true };
  const at = word == null ? null : findWord(text, word);
  return { text, marks: at ? [at] : [], chosen: false };
}

/**
 * `text` (without marks) as HTML with `marks` lit in <b>: the one renderer of a card's sentence (the
 * Vocab list, the Basics list, the review card). With `words` ([from, to) of each word: the review
 * card, where a word can be held), each word is in a <span class="rv-tok" data-a data-b> of its own;
 * a lit stretch over several of them is then drawn in pieces, <b class="s"> (its start), "m" and "e"
 * (its end), a whole one in a plain <b>. `from`/`to`: only that part of the text (a long sentence's
 * cut); `shown(a, b)`: what to show for a part (the same letters with vowel marks).
 */
export function litTextHtml(text, marks, esc, { words = [], from = 0, to = text.length, shown = null } = {}) {
  const pieces = litPieces(from, to, words, marks);
  const lit = (k) => k >= 0 && k < pieces.length && pieces[k].lit;
  const show = (a, b) => esc(shown ? shown(a, b) : text.slice(a, b));
  // The letter before position i, skipping vowel marks (they sit on the letter before them).
  const letterBefore = (i) => { while (i > 0 && HARAKAT.test(text[i - 1])) i--; return text[i - 1] || ""; };
  const join = (i) => (JOINING.test(letterBefore(i)) && JOINING.test(text[i] || "") ? ZWJ : "");
  const piece = (k) => {
    const p = pieces[k];
    if (!p.lit) return show(p.from, p.to);
    const first = !lit(k - 1), last = !lit(k + 1);
    const kind = first && last ? "" : first ? ' class="s"' : last ? ' class="e"' : ' class="m"';
    const joinIn = first ? join(p.from) : "", joinOut = last ? join(p.to) : "";
    return `${joinIn}<b${kind}>${joinIn}${show(p.from, p.to)}${joinOut}</b>${joinOut}`;
  };
  let html = "";
  for (let k = 0; k < pieces.length;) {
    const w = pieces[k].word;
    if (w < 0) { html += piece(k++); continue; }
    let inner = "";
    while (k < pieces.length && pieces[k].word === w) inner += piece(k++);
    html += `<span class="rv-tok" data-a="${words[w][0]}" data-b="${words[w][1]}">${inner}</span>`;
  }
  return html;
}

/** [from, to) of `word` inside `text`, compared without vowel marks or letter variants; null if absent.
 * A text with ⟦ ⟧ marks: the first marked part, marks included. */
export function findWord(text, word) {
  text = String(text || "");
  if (PAIRED.test(text)) {
    const open = text.indexOf("⟦");
    return [open, text.indexOf("⟧", open) + 1];
  }
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
const CLAUSE_END = /[،,;؛:.!?؟…।॥\n]/u; // (। ॥: Hindi's full stops)
const SENTENCE_END = /[.!?؟…।॥]$/u;

/**
 * `text` cut down to at most `limit` characters around [from, to): whole clauses when they fit,
 * else whole words. "…" marks a side that was cut. Text that already fits is returned unchanged.
 */
export function trimAround(text, from, to, limit = CARD_SENTENCE_MAX) {
  text = String(text || "");
  if (text.length <= limit) return text;
  const cut = trimSpan(text, from, to, limit);
  return (cut.before ? "…" : "") + text.slice(cut.lo, cut.hi) + (cut.after ? "…" : "");
}

/**
 * Where trimAround cuts `text`: the part shown is text.slice(lo, hi), with "…" before it when
 * `before` and after it when `after`. The whole text when it fits.
 */
export function trimSpan(text, from, to, limit = CARD_SENTENCE_MAX) {
  text = String(text || "");
  if (text.length <= limit) return { lo: 0, hi: text.length, before: false, after: false };
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
  const cutAfter = hi < text.trimEnd().length;
  const before = lo > 0 && Boolean(text.slice(0, lo).trim());
  while (lo < hi && /\s/.test(text[lo])) lo++;
  while (hi > lo && /\s/.test(text[hi - 1])) hi--;
  const ends = SENTENCE_END.test(text.slice(lo, hi));  // (the shown part ends a sentence: no "…")
  if (cutAfter) while (hi > lo && /[\s،,;؛:]/u.test(text[hi - 1])) hi--;
  return { lo, hi, before, after: cutAfter && !ends };
}

/** The part of a word's sentence its card shows (see the top of this file), with the parts lit up
 * that the learner chose (⟦ ⟧, see below) still marked in it. */
export function cardSentence(sentence, word, limit = CARD_SENTENCE_MAX) {
  const { text, spans } = sentenceMarks(sentence);
  if (!spans) {  // no marks: the card lights the word wherever it is
    if (text.length <= limit) return text;
    const at = findWord(text, word) || [0, 0];
    return trimAround(text, at[0], at[1], limit);
  }
  // Cut round the first lit part, and the marks put back into what is left.
  const focus = spans[0] || findWord(text, word) || [0, 0];
  const cut = trimSpan(text, focus[0], focus[1], limit);
  const inside = spans.map(([a, b]) => [Math.max(a, cut.lo) - cut.lo, Math.min(b, cut.hi) - cut.lo]).filter(([a, b]) => b > a);
  return (spans.length ? "" : NO_MARKS) + (cut.before ? "…" : "") + writeMarks(text.slice(cut.lo, cut.hi), inside) + (cut.after ? "…" : "");
}

// ----- holding a word on the review card: lighting it up, or putting it out -----
// The review card lights the word being learned in its sentence: what the sentence's ⟦ ⟧ say (above),
// else the card's word wherever it is found. Holding a word of the sentence lights it up too, or puts
// it out (a verb in two parts, a word the card missed, a wrong guess); the choice is written into the
// sentence as ⟦ ⟧ round each lit part (NO_MARKS when none is left), so it syncs with the sentence and
// everything that draws it (the review card, the Vocab list, the Anki export) lights the same parts.
// Its translation works the same way, without anything lit by itself.

const OPEN = "⟦";
const CLOSE = "⟧";

/** Lit parts as they are kept: in order, inside the text, without spaces at their ends, and one
 * part where two touch or only spaces lie between them ("dar" and "la" lit = "dar la"). */
function tidyMarks(plain, marks) {
  const out = [];
  for (let [a, b] of [...marks].sort((x, y) => x[0] - y[0] || x[1] - y[1])) {
    a = Math.max(0, Math.min(a, plain.length));
    b = Math.max(a, Math.min(b, plain.length));
    while (a < b && /\s/u.test(plain[a])) a++;
    while (b > a && /\s/u.test(plain[b - 1])) b--;
    if (a >= b) continue;
    const last = out[out.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else if (last && !/\S/u.test(plain.slice(last[1], a))) last[1] = b;
    else out.push([a, b]);
  }
  return out;
}

/** `plain` with ⟦ ⟧ round each of `marks` (and NO_MARKS in front when `none` and nothing is lit):
 * what sentenceMarks reads back. */
export function writeMarks(plain, marks = [], none = false) {
  plain = String(plain ?? "");
  const list = tidyMarks(plain, marks);
  if (!list.length) return none ? NO_MARKS + plain : plain;
  let out = "", at = 0;
  for (const [a, b] of list) {
    out += plain.slice(at, a) + OPEN + plain.slice(a, b) + CLOSE;
    at = b;
  }
  return out + plain.slice(at);
}

const same = (x, y) => x.length === y.length && x.every(([a, b], i) => a === y[i][0] && b === y[i][1]);

/**
 * Hold a word: `stored` (a sentence or translation as stored) with the word at [from, to) of its
 * text lit up, or put out when any of it was lit. `word` = the card's word, for a sentence (whose lit
 * part is the word itself until something is marked); null for a translation. Coming back to what the
 * card would light by itself keeps no marks at all.
 */
export function toggleWord(stored, [from, to], word = null) {
  const { text: plain, marks } = litParts(stored, word);
  const auto = litParts(plain, word).marks;
  const lit = marks.some(([a, b]) => a < to && b > from);
  const next = tidyMarks(plain, lit
    ? marks.flatMap(([a, b]) => (b <= from || a >= to ? [[a, b]] : [...(a < from ? [[a, from]] : []), ...(b > to ? [[to, b]] : [])]))
    : [...marks, [from, to]]);
  if (same(next, auto)) return plain;
  return writeMarks(plain, next, !next.length);
}

/**
 * `before` (a sentence or translation as stored) after its text was typed over as `plain`: the lit
 * parts stay on the same letters. The change is found as what lies between the unchanged start and
 * end of the text; a lit part with the change inside it (a typo put right) takes the change in, the
 * part of one that the change only touches is put out, and the rest move with the text.
 */
export function carryMarks(before, plain) {
  const { text: old, spans } = sentenceMarks(before);
  const marks = spans || [];
  plain = String(plain ?? "");
  if (!marks.length) return spans && plain ? NO_MARKS + plain : plain;  // (nothing lit stays nothing lit)
  let p = 0;
  while (p < old.length && p < plain.length && old[p] === plain[p]) p++;
  let s = 0;
  while (s < old.length - p && s < plain.length - p && old[old.length - 1 - s] === plain[plain.length - 1 - s]) s++;
  const oldEnd = old.length - s, newEnd = plain.length - s, shift = plain.length - old.length;
  const added = plain.slice(p, newEnd);
  const inserted = p === oldEnd;  // nothing taken away, only typed in
  const moved = [];
  for (const [a, b] of marks) {
    const atEdge = inserted && (p === a || p === b);
    if (atEdge ? !/\s/u.test(added) : a <= p && oldEnd <= b) moved.push([a, b + shift]);  // the change is part of the lit word
    else if (b <= p) moved.push([a, b]);
    else if (a >= oldEnd) moved.push([a + shift, b + shift]);
    else {
      if (a < p) moved.push([a, p]);
      if (b > oldEnd) moved.push([newEnd, b + shift]);
    }
  }
  const kept = tidyMarks(plain, moved);
  return kept.length ? writeMarks(plain, kept) : plain;
}

/**
 * The pieces a lit text is drawn in, between `lo` and `hi` of its plain text: [{from, to, word,
 * lit}], word = the index in `words` ([from, to) of each word) of the word the piece is part of,
 * or -1 (spaces, punctuation); lit = inside one of `marks`.
 */
export function litPieces(lo, hi, words, marks) {
  const cuts = new Set([lo, hi]);
  for (const [a, b] of [...words, ...marks]) {
    if (a > lo && a < hi) cuts.add(a);
    if (b > lo && b < hi) cuts.add(b);
  }
  const at = [...cuts].sort((x, y) => x - y);
  const out = [];
  for (let i = 0; i + 1 < at.length; i++) {
    const from = at[i], to = at[i + 1];
    out.push({ from, to, word: words.findIndex(([a, b]) => a <= from && to <= b), lit: marks.some(([a, b]) => a <= from && to <= b) });
  }
  return out;
}

/**
 * Where each letter of `plain` is in `shown`, the same text with (other) Arabic vowel marks: at[i]
 * = the place in `shown` of plain[i], at[plain.length] = shown.length. So a part [a, b) of the plain
 * text is shown.slice(at[a], at[b]), vowel marks and all. Null when the letters differ.
 */
export function vowelPlaces(plain, shown) {
  plain = String(plain ?? "");
  shown = String(shown ?? "");
  const at = [];
  let j = 0;
  for (let i = 0; i < plain.length; i++) {
    const ch = plain[i];
    if (HARAKAT.test(ch)) {  // a mark of the plain text's own: the same one, or none, in `shown`
      at.push(j);
      if (shown[j] === ch) j++;
      continue;
    }
    while (j < shown.length && shown[j] !== ch && HARAKAT.test(shown[j])) j++;
    if (shown[j] !== ch) return null;
    at.push(j++);
  }
  while (j < shown.length && HARAKAT.test(shown[j])) j++;
  if (j !== shown.length) return null;
  at.push(shown.length);
  return at;
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
