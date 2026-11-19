// "Type what you hear" (dictation): the parts that need no screen. The panel is components/dictation.js.
//
// A transcript is cut into sentences a learner can hold in their head (`sentencesFromWords`), and what they
// typed is set against the sentence's real words (`compareTyped`): each real word is right, nearly right or
// missed, and each typed word that matches none is marked as extra. Vowel marks, capitals and punctuation
// never count against anyone (subtitles are written with and without them); accents, the forms of a letter
// and a one-letter slip make a word "nearly right". Languages written without spaces (Japanese, Chinese,
// Thai) are compared letter by letter instead.

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
 */
export function sentencesFromWords({ texts, starts, ends, segOf, lang, lineTimed = false }) {
  const out = [];
  const n = texts.length;
  let first = 0;
  const flush = (last) => {
    const text = cleanSentence(joinWords(texts.slice(first, last + 1), lang));
    if (keysOf(text, lang).length) out.push({ text, start: starts[first], end: ends[last] });
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

// ---------- comparing ----------
const ARABIC_MARKS = /[ؐ-ًؚ-ٰٟۖ-ۜ۟-۪ۨ-ۭـ]/g;  // vowel marks and the stretching line
const LETTERS = { "آ": "ا", "أ": "ا", "إ": "ا", "ٱ": "ا", "ى": "ي", "ی": "ي", "ک": "ك", "ۀ": "ه", "‌": "" };
const DIGITS = /[٠-٩۰-۹]/g;
const digit = (c) => String(c.charCodeAt(0) - (c.charCodeAt(0) >= 0x6f0 ? 0x6f0 : 0x660));

/** A piece of text as it counts as right: no vowel marks or punctuation, one spelling for Arabic letters
 * written several ways, lower case. */
export function strictKey(text) {
  return String(text ?? "").normalize("NFKC")
    .replace(ARABIC_MARKS, "")
    .replace(/[̀́]/g, "")  // stress marks left over once letters are composed (Russian кни́га)
    .replace(/[آأإٱىیکۀ‌]/g, (c) => LETTERS[c])
    .replace(DIGITS, digit)
    .replace(/[^\p{L}\p{N}\p{M}]/gu, "")
    .toLowerCase();
}

/** The same with accents and the like taken off too: a word that differs only there is nearly right. */
export function looseKey(text) {
  return strictKey(text).normalize("NFD").replace(/[̀-ͯ]/g, "").normalize("NFC")
    .replace(/ß/g, "ss").replace(/ё/g, "е").replace(/ة/g, "ه").replace(/[ؤئ]/g, (c) => (c === "ؤ" ? "و" : "ي"));
}

const graphemes = (text, lang) => {
  if (typeof Intl !== "undefined" && Intl.Segmenter) {
    return [...new Intl.Segmenter(lang || undefined, { granularity: "grapheme" }).segment(text)].map((s) => s.segment);
  }
  return Array.from(text);
};

/** The pieces a text is compared in, as they are shown: words, or letters where no spaces are written.
 * Each is {text, key, loose}; a piece with no letters (a dash, a lone punctuation mark) has key "". */
export function piecesOf(text, lang) {
  const clean = String(text ?? "").normalize("NFC");
  const raw = langInfo(lang).unspaced ? graphemes(clean, lang) : clean.split(/(\s+)/);
  return raw.filter((p) => p !== "").map((p) => {
    const space = /^\s+$/.test(p);
    return { text: p, key: space ? "" : strictKey(p), loose: space ? "" : looseKey(p), space };
  });
}
const keysOf = (text, lang) => piecesOf(text, lang).filter((p) => p.key);

/** How many single-letter changes (a letter added, left out, changed, or two swapped) turn a into b
 * (stops counting past `most`). */
export function distance(a, b, most = 3) {
  const A = [...a];
  const B = [...b];
  if (Math.abs(A.length - B.length) > most) return most + 1;
  let before = null;
  let prev = Array.from({ length: B.length + 1 }, (_, j) => j);
  for (let i = 1; i <= A.length; i++) {
    const row = [i];
    let low = i;
    for (let j = 1; j <= B.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (A[i - 1] === B[j - 1] ? 0 : 1));
      if (before && i > 1 && j > 1 && A[i - 1] === B[j - 2] && A[i - 2] === B[j - 1]) row[j] = Math.min(row[j], before[j - 2] + 1);
      low = Math.min(low, row[j]);
    }
    if (low > most) return most + 1;
    before = prev;
    prev = row;
  }
  return prev[B.length];
}

/** How well a typed piece matches a real one: 3 right, 2 nearly (accents, letter forms), 1 nearly (a slip
 * of a letter in a word of five letters or more, two from nine), 0 not at all. */
function score(real, typed, letters) {
  if (real.key === typed.key) return 3;
  if (real.loose === typed.loose) return 2;
  if (letters) return 0;
  const len = [...real.loose].length;
  if (len < 5) return 0;  // (a short word one letter off is often another word: went, want)
  return distance(real.loose, typed.loose, 2) <= (len >= 9 ? 2 : 1) ? 1 : 0;
}

/**
 * What was typed against the real sentence. Returns
 * {real: [{text, state}], typed: [{text, state}], right, near, total, letters}
 * where a real piece's state is "right", "near", "missed" or "" (spaces and punctuation, never counted),
 * and a typed piece's is "right", "near", "extra" or "". The pieces line up in order (the longest run of
 * matches, preferring exact ones), so a word typed in the wrong place counts once at most.
 */
export function compareTyped(realText, typedText, lang) {
  const letters = !!langInfo(lang).unspaced;
  const real = piecesOf(realText, lang);
  const typed = piecesOf(typedText, lang);
  const R = real.filter((p) => p.key);
  const T = typed.filter((p) => p.key);
  // The best line-up: most points, by dynamic programming over the two lists.
  const best = Array.from({ length: R.length + 1 }, () => new Int32Array(T.length + 1));
  for (let i = R.length - 1; i >= 0; i--) {
    for (let j = T.length - 1; j >= 0; j--) {
      const s = score(R[i], T[j], letters);
      best[i][j] = Math.max(best[i + 1][j], best[i][j + 1], s ? s + best[i + 1][j + 1] : 0);
    }
  }
  const realState = new Map();
  const typedState = new Map();
  let i = 0;
  let j = 0;
  while (i < R.length && j < T.length) {
    const s = score(R[i], T[j], letters);
    if (s && best[i][j] === s + best[i + 1][j + 1]) {
      const state = s === 3 ? "right" : "near";
      realState.set(R[i], state);
      typedState.set(T[j], state);
      i++;
      j++;
    } else if (best[i + 1][j] >= best[i][j + 1]) i++;
    else j++;
  }
  const out = {
    real: real.map((p) => ({ text: p.text, state: p.key ? realState.get(p) || "missed" : "" })),
    typed: typed.map((p) => ({ text: p.text, state: p.key ? typedState.get(p) || "extra" : "" })),
    right: 0, near: 0, total: R.length, letters,
  };
  for (const p of out.real) {
    if (p.state === "right") out.right++;
    else if (p.state === "near") out.near++;
  }
  return out;
}

/**
 * The gist: which words of what was said turn up anywhere in what was written (order doesn't matter, and
 * what was written may be partly in the learner's own language). Returns {real: [{text, state}], right, near,
 * total, letters}, a real piece's state being "right", "near", "other" (not caught) or "".
 */
export function caughtWords(realText, typedText, lang) {
  const letters = !!langInfo(lang).unspaced;
  const typed = piecesOf(typedText, lang).filter((p) => p.key);
  const strict = new Set(typed.map((p) => p.key));
  const loose = new Set(typed.map((p) => p.loose));
  const out = { real: [], right: 0, near: 0, total: 0, letters };
  for (const p of piecesOf(realText, lang)) {
    const state = !p.key ? "" : strict.has(p.key) ? "right" : loose.has(p.loose) ? "near" : "other";
    if (p.key) out.total++;
    if (state === "right") out.right++;
    if (state === "near") out.near++;
    out.real.push({ text: p.text, state });
  }
  return out;
}

/** A result as a share of the sentence, 0..1: a nearly-right word counts half. */
export const shareRight = (r) => (r.total ? (r.right + r.near / 2) / r.total : 0);

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
