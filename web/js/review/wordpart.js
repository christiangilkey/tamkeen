// A part of the word for the Mnemonic maker. The owner: "a bar that appears below it that allows the user to
// highlight which part of the foreign language word that the user wants to be processed for mnemonics … selectable
// and draggable across the word and in between letters". The bar (review/partbar.js) shows the word in its own
// script with a highlight whose ends sit between letters; this file is what the choice means in sound:
//
//   - the word's letters (grapheme clusters: an Arabic letter with its vowel marks is one) and a choice {from, to};
//   - which of the word's sounds each letter stands for (alignLetters): the pronunciation (review/soundout.js: the
//     Wiktionary IPA, or the spelling rules) is laid along the letters, each letter taking the sounds nearest to
//     what its own spelling says, unwritten vowels going with the consonant before them (Arabic كتاب: k-i, t-aa, b);
//   - the pronunciation cut to the chosen letters' sounds (cutPron), which the keywords are then matched against,
//     and the whole word's sound line with that part lit (litLine: wa-TA-hu-fi-bay-da-i).
//
// No page code: tests/js/wordpart.test.mjs.

import { phones, soundGap, wordSounds } from "./phonemes.js";
import { respellPhones, spellingIpa } from "./soundout.js";

const VOWEL = /[aeiouyæøœɑɒɐɔəɛɜɞɤɨɪʊʉɯʌɘɵɶʏ]/;
const SOUNDING = /[\p{L}\p{N}]/u;

/** The letters of `text`: grapheme clusters, so a letter keeps its marks (كَ, é, ก็). */
export function graphemes(text) {
  const s = String(text ?? "");
  try {
    if (typeof Intl !== "undefined" && Intl.Segmenter) return Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(s), (x) => x.segment);
  } catch { /* the rule below */ }
  return s.match(/\P{M}\p{M}*|\p{M}+/gu) || [];
}

/** A choice {from, to} (letters from..to-1) kept inside a word of `n` letters, at least one letter long. */
export function cleanSel(sel, n) {
  if (n < 1) return { from: 0, to: 0 };
  let from = Number.isInteger(sel && sel.from) ? sel.from : 0, to = Number.isInteger(sel && sel.to) ? sel.to : n;
  from = Math.max(0, Math.min(n - 1, from));
  to = Math.max(from + 1, Math.min(n, to));
  return { from, to };
}

/** Is the whole word chosen (nothing but spaces and punctuation left out)? */
export function isWhole(sel, letters) {
  const n = letters.length, s = cleanSel(sel, n);
  const sounding = (a, b) => letters.slice(a, b).some((g) => SOUNDING.test(g));
  return !sounding(0, s.from) && !sounding(s.to, n);
}

/** The chosen letters as text. */
export const selText = (letters, sel) => letters.slice(sel.from, sel.to).join("").trim();

/** One end of the choice ("start" or "end") moved by `by` letters, the choice staying at least one letter long. */
export function moveEdge(sel, edge, by, n) {
  const s = cleanSel(sel, n);
  if (edge === "start") return { from: Math.max(0, Math.min(s.to - 1, s.from + by)), to: s.to };
  return { from: s.from, to: Math.max(s.from + 1, Math.min(n, s.to + by)) };
}

const plain = (g) => g.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** Where `core` (the part of the word that is matched, review/wordcore.js) lies in the letters: [from, to). The
 * whole word when it can't be found as written. */
function coreSpan(letters, core) {
  const want = graphemes(String(core || "").trim()).map(plain).join("");
  if (!want) return [0, letters.length];
  const parts = letters.map(plain);
  const at = parts.join("").indexOf(want);
  if (at < 0) return [0, letters.length];
  let pos = 0, from = -1, to = letters.length;
  for (let i = 0; i < parts.length; i++) {
    if (from < 0 && pos >= at && parts[i]) from = i;
    pos += parts[i].length;
    if (pos >= at + want.length) { to = i + 1; break; }
  }
  return [Math.max(0, from), to];
}

// What a letter says by itself, as far as the language's spelling rules know (nothing for a kanji or a Thai letter).
function expected(letter, lang) {
  // (Arabic's ا و ي inside a word are its long vowels; read alone, the rules take them for a word's first letter)
  if ((lang === "ar" || lang === "fa") && LONG_VOWEL[letter]) return phones(LONG_VOWEL[letter]);
  try { return phones(spellingIpa(letter, lang)); } catch { return []; }
}
const LONG_VOWEL = { "ا": "aː", "ى": "aː", "و": "uː", "ي": "iː", "ی": "iː" };

// How well the sounds a letter should make (`want`) fit the sounds given to it (`got`).
function fit(want, got, average) {
  if (!want.length) return 0.05 + 0.3 * Math.abs(got.length - average);  // an unknown letter: about its share
  let prev = [0];
  const extra = (p) => (VOWEL.test(p.s) ? 0.12 : 0.6);  // an unwritten vowel is cheap; a consonant of its own is not
  for (let j = 1; j <= got.length; j++) prev[j] = prev[j - 1] + extra(got[j - 1]);
  for (let i = 1; i <= want.length; i++) {
    const cur = [prev[0] + 0.35];  // (a silent letter)
    for (let j = 1; j <= got.length; j++) {
      // (a vowel letter takes the vowel that is said there, whichever it is: Russian о said "a")
      const gap = soundGap(want[i - 1], got[j - 1]);
      const swap = VOWEL.test(want[i - 1].s) && VOWEL.test(got[j - 1].s) ? Math.min(0.3, gap) : gap;
      cur[j] = Math.min(prev[j - 1] + swap, prev[j] + 0.35, cur[j - 1] + extra(got[j - 1]));
    }
    prev = cur;
  }
  return prev[got.length];
}

/**
 * Which sounds each letter of `text` stands for: [[from, to), …] per letter, counting the word's sounds from 0
 * (all of `pron`'s syllables in a row, as phonemes.js wordSounds reads them). `core`: the part of the word the
 * pronunciation is of (الكتاب said "kitaab": ال takes no sounds). Letters outside it, spaces and punctuation get
 * an empty span where they stand.
 */
export function alignLetters(text, lang, pron, core = "") {
  const letters = graphemes(text);
  const word = pron && wordSounds(pron.syllables, pron.stress);
  const sounds = word ? word.syllables.flat() : [];
  const m = sounds.length;
  const [c0, c1] = coreSpan(letters, core);
  const idx = [];
  for (let i = c0; i < c1; i++) if (SOUNDING.test(letters[i])) idx.push(i);
  const n = idx.length;
  const spans = letters.map(() => [0, 0]);
  if (!n || !m) return spans;
  const want = idx.map((i) => expected(letters[i], lang));
  const unknown = want.every((w) => !w.length);
  let take = null;  // sounds taken by each sounding letter
  if (unknown && word.syllables.length === n) take = word.syllables.map((s) => s.length);  // a syllable a letter (汉字, 한글)
  else {
    const MAX = Math.min(m, Math.max(6, Math.ceil(m / n) + 3));
    const average = m / n;
    // best[i][j]: the least cost of giving the first j sounds to the first i letters
    const best = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(Infinity));
    const back = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    best[0][0] = 0;
    for (let i = 1; i <= n; i++) {
      for (let j = 0; j <= m; j++) {
        for (let k = 0; k <= Math.min(MAX, j); k++) {
          if (best[i - 1][j - k] === Infinity) continue;
          const c = best[i - 1][j - k] + fit(want[i - 1], sounds.slice(j - k, j), average);
          if (c < best[i][j]) { best[i][j] = c; back[i][j] = k; }
        }
      }
    }
    if (best[n][m] !== Infinity) {
      take = new Array(n);
      for (let i = n, j = m; i >= 1; i--) { take[i - 1] = back[i][j]; j -= back[i][j]; }
    } else {  // (more sounds than the letters can take: shared out evenly)
      take = idx.map((_, i) => Math.round(((i + 1) * m) / n) - Math.round((i * m) / n));
    }
  }
  let at = 0, k = 0;
  for (let i = 0; i < letters.length; i++) {
    if (k < n && idx[k] === i) { spans[i] = [at, at + take[k]]; at += take[k]; k++; } else spans[i] = [at, at];
  }
  return spans;
}

/** The sounds of the chosen letters: [from, to) among the word's sounds. */
export function soundSpan(spans, sel) {
  const s = cleanSel(sel, spans.length);
  return spans.length ? [spans[s.from][0], spans[s.to - 1][1]] : [0, 0];
}

const symbol = (p) => p.s + (p.long ? "ː" : "");
const hasVowel = (group) => group.some((p) => VOWEL.test(p.s));

/**
 * The pronunciation cut to its sounds from..to-1: {romanization, ipa, syllables: [{text, ipa}], stress}, the shape
 * the makers take. A piece with no vowel joins the syllable beside it (the "t" cut off "ta" goes with "hu"). Null
 * when nothing with a vowel is left: there is no sound to find a sound-alike for.
 */
export function cutPron(pron, from, to) {
  const word = pron && wordSounds(pron.syllables, pron.stress);
  if (!word) return null;
  const groups = [];  // {sounds, stressed}
  let at = 0;
  word.syllables.forEach((syl, k) => {
    const kept = syl.filter((_, i) => at + i >= from && at + i < to);
    at += syl.length;
    if (kept.length) groups.push({ sounds: kept, stressed: k === word.stress && hasVowel(kept) });
  });
  for (let i = 0; i < groups.length;) {  // vowel-less pieces join a neighbour
    if (hasVowel(groups[i].sounds) || groups.length === 1) { i++; continue; }
    if (i === 0) groups[1].sounds.unshift(...groups[0].sounds);
    else groups[i - 1].sounds.push(...groups[i].sounds);
    groups.splice(i, 1);
  }
  if (!groups.length || !groups.some((g) => hasVowel(g.sounds))) return null;
  const syllables = groups.map((g) => ({ text: respellPhones(g.sounds), ipa: g.sounds.map(symbol).join("") }));
  const stress = groups.length > 1 ? groups.findIndex((g) => g.stressed) : -1;
  return { romanization: syllables.map((s) => s.text).join(""), ipa: syllables.map((s) => s.ipa).join("."), syllables, stress, from: pron.from };
}

/**
 * The whole word's sound line with the chosen sounds lit, for the card: [{text, lit}] in order, dashes between the
 * syllables as on the line ("wa-", lit "TA-hu", "-fi-bay-da-i"); the stressed syllable in capitals.
 */
export function litLine(pron, from, to) {
  const word = pron && wordSounds(pron.syllables, pron.stress);
  if (!word) return [];
  const out = [];
  const add = (text, lit) => {
    const last = out[out.length - 1];
    if (last && last.lit === lit) last.text += text; else out.push({ text, lit });
  };
  let at = 0;
  word.syllables.forEach((syl, k) => {
    // (the dash is lit when the choice runs across it)
    if (k) add("-", at > from && at < to);
    const caps = k === word.stress && word.syllables.length > 1;
    syl.forEach((p, i) => {
      const text = respellPhones([p]);
      add(caps ? text.toLocaleUpperCase() : text, at + i >= from && at + i < to);
    });
    at += syl.length;
  });
  return out;
}
