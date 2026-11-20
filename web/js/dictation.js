// "Type what you hear" (dictation): the parts that need no screen. The panel is components/dictation.js.
//
// A transcript is cut into sentences a learner can hold in their head (`sentencesFromWords`), one word at a time
// (`wordUnits`) or a few sentences at a time (`passages`). What they typed is NOT marked against what was said: the
// owner (2026-11-20) wanted the real words shown plainly, the learner comparing for themselves. `pieceWords` tells
// which of the player's words each shown word is, for a tap on it (the word popup).

import { joinWords, langInfo } from "./languages.js";

// ---------- sentences ----------
const ENDS = /[.!?؟。！？…‽।۔](?:["'”’»)\]」』]*)$/u;  // a word that ends a sentence
const COMMA = /[,،;:、，；：]$/u;
const SHORTEST = 1.5;   // seconds: shorter than this, a "sentence" joins the next one
const LONG = 6;         // a line this long, or longer, is a sentence by itself even without a full stop
const LONGEST = 15;     // seconds: past this a sentence is cut at the next comma
const LIMIT = 22;       // ... and past this anywhere
const PAUSE = 2;        // seconds of silence (or music) between two words: a sentence ends there, wherever it is

/** A line as it is typed from: no "[Music]" or ♪ (captions for the deaf), spaces tidied. */
export function cleanSentence(text) {
  return String(text ?? "").replace(/\[[^\]]*\]/g, " ").replace(/[♪♫]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * The transcript's sentences: [{text, start, end}] in order. `texts`, `starts`, `ends`, `segOf` are the
 * player's words (their text, times and line). Sentences end where a word ends one (a full stop), or at the
 * end of a line once there is enough to type, and always at a pause (a jingle, an advert: never played as part of
 * a sentence); a long one is cut at a comma. `lineTimed`: only whole lines
 * have real times (subtitles), so a sentence is never cut inside a line. Lines with nothing to type are left out.
 * `first` and `last`: the player's words it is made of (see pieceWords).
 */
export function sentencesFromWords({ texts, starts, ends, segOf, lang, lineTimed = false }) {
  const out = [];
  const n = texts.length;
  let first = 0;
  const flush = (last) => {
    const text = cleanSentence(joinWords(texts.slice(first, last + 1), lang));
    if (keysOf(text, lang).length) out.push({ text, start: starts[first], end: ends[last], first, last });
    first = last + 1;
  };
  for (let i = 0; i < n; i++) {
    const lineEnd = i === n - 1 || segOf[i + 1] !== segOf[i];
    const took = ends[i] - starts[first];
    const stop = ENDS.test(texts[i]);
    if (i < n - 1 && starts[i + 1] - ends[i] >= PAUSE) flush(i);
    else if (lineEnd) {
      // The next line's length: joining it would make this one too long to hold.
      let j = i + 1;
      while (j + 1 < n && segOf[j + 1] === segOf[i + 1]) j++;
      const nextTook = j < n ? ends[j] - starts[i + 1] : 0;
      if (i === n - 1 || (stop && took >= SHORTEST) || took >= LONG || took + nextTook > LONGEST) flush(i);
    } else if (!lineTimed && ((stop && took >= SHORTEST) || (took >= LONGEST && COMMA.test(texts[i])) || took >= LIMIT)) {
      flush(i);
    }
  }
  return out;
}

// ---------- words and passages ----------
const EDGE = /^[^\p{L}\p{N}\p{M}]+|[^\p{L}\p{N}\p{M}]+$/gu;

/** One word at a time: [{text, start, end, i}] for each word with letters in it (i: its place in the
 * player's words), its text without the punctuation round it. */
export function wordUnits({ texts, starts, ends }) {
  const out = [];
  for (let i = 0; i < texts.length; i++) {
    const text = cleanSentence(texts[i]).replace(EDGE, "");
    if (text && strictKey(text)) out.push({ text, start: starts[i], end: ends[i], i });
  }
  return out;
}

export const GIST_SIZES = [2, 3, 4, 5];
const GAP = 3; // seconds between two sentences: a passage stops there (a jingle, an advert is never played inside one)

/** The gist: `size` sentences (2–5) at a time, one after another: [{text, start, end, parts}], shorter where a
 * pause comes first. */
export function passages(sentences, size, lang) {
  const n = Math.max(2, Math.min(5, Math.round(size) || 3));
  const sep = langInfo(lang).unspaced ? "" : " ";
  const out = [];
  let part = [];
  const flush = () => {
    if (part.length) out.push({ text: part.map((s) => s.text).join(sep), start: part[0].start, end: part[part.length - 1].end, parts: part });
    part = [];
  };
  for (const s of sentences) {
    if (part.length && s.start - part[part.length - 1].end > GAP) flush();
    part.push(s);
    if (part.length >= n) flush();
  }
  flush();
  return out;
}

/**
 * Which of the player's words each word of a piece is, once it has been checked and its real text is shown (a tap
 * on one opens the player's word popup for it, the owner 2026-11-20). `unit`: a sentence (its `first` and `last`),
 * a gist passage (its `parts`) or one word (its `i`); `texts`: the player's words. Returns one word number for each
 * piece of the unit's text that has letters (piecesOf, in order: what the panel numbers), or null when they don't
 * line up (the player then finds the word by its letters: wordNear).
 */
export function pieceWords(unit, texts, lang) {
  if (!unit) return null;
  const count = keysOf(unit.text, lang).length;
  if (Number.isInteger(unit.i)) return Array(count).fill(unit.i);
  const out = [];
  for (const s of unit.parts || [unit]) {
    if (!Number.isInteger(s.first) || !Number.isInteger(s.last)) return null;
    for (let k = s.first; k <= s.last; k++) for (const p of keysOf(cleanSentence(texts[k]), lang)) out.push(k);
  }
  return out.length === count ? out : null;
}

/** The player's word, between `first` and `last`, written like `piece` (the same letters: strictKey), or -1. */
export function wordNear(piece, texts, first, last, lang) {
  const key = strictKey(piece);
  if (!key) return -1;
  for (let k = Math.max(0, first); k <= Math.min(last, texts.length - 1); k++) {
    if (keysOf(cleanSentence(texts[k]), lang).some((p) => p.key === key)) return k;
  }
  return -1;
}

// ---------- the words of a piece, as they are shown ----------
const ARABIC_MARKS = /[ؐ-ًؚ-ٰٟۖ-ۜ۟-۪ۨ-ۭـ]/g;  // vowel marks and the stretching line
const LETTERS = { "آ": "ا", "أ": "ا", "إ": "ا", "ٱ": "ا", "ى": "ي", "ی": "ي", "ک": "ك", "ۀ": "ه", "‌": "" };
const DIGITS = /[٠-٩۰-۹]/g;
const digit = (c) => String(c.charCodeAt(0) - (c.charCodeAt(0) >= 0x6f0 ? 0x6f0 : 0x660));

/** A piece of text as its letters: no vowel marks or punctuation, one spelling for Arabic letters written several
 * ways, lower case ("" for a piece with no letters: a dash, a lone punctuation mark). */
export function strictKey(text) {
  return String(text ?? "").normalize("NFKC")
    .replace(ARABIC_MARKS, "")
    .replace(/[̀́]/g, "")  // stress marks left over once letters are composed (Russian кни́га)
    .replace(/[آأإٱىیکۀ‌]/g, (c) => LETTERS[c])
    .replace(DIGITS, digit)
    .replace(/[^\p{L}\p{N}\p{M}]/gu, "")
    .toLowerCase();
}

const graphemes = (text, lang) => {
  if (typeof Intl !== "undefined" && Intl.Segmenter) {
    return [...new Intl.Segmenter(lang || undefined, { granularity: "grapheme" }).segment(text)].map((s) => s.segment);
  }
  return Array.from(text);
};

/** The pieces a text is shown in: words, or letters where no spaces are written. Each is {text, key, space}; a
 * piece with no letters has key "" (the panel numbers only those with letters: pieceWords). */
export function piecesOf(text, lang) {
  const clean = String(text ?? "").normalize("NFC");
  const raw = langInfo(lang).unspaced ? graphemes(clean, lang) : clean.split(/(\s+)/);
  return raw.filter((p) => p !== "").map((p) => {
    const space = /^\s+$/.test(p);
    return { text: p, key: space ? "" : strictKey(p), space };
  });
}
const keysOf = (text, lang) => piecesOf(text, lang).filter((p) => p.key);

// ---------- the player's speed menu while typing ----------

/** A drop-down's next choice (the last goes round to the first), as if chosen from its list: while the typing box
 * is in use, a tap on the player's speed menu steps instead of opening the list (components/dictation.js keepTyping). */
export function stepChoice(sel) {
  const opts = [...sel.options];
  if (!opts.length) return;
  for (let j = 1; j <= opts.length; j++) {
    const o = opts[(sel.selectedIndex + j) % opts.length];
    if (o.disabled || o.hidden) continue;
    if (o.selected) return;
    o.selected = true;
    sel.dispatchEvent(new Event("input", { bubbles: true }));
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }
}
