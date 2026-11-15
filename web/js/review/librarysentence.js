// Real example sentences from the learner's own library (their transcripts, books and web pages), for the
// word editor's Sentence tool with no AI ("Find a real one", review/sentencefind.js). The card's own source
// (the book or episode the word was saved from) comes first, then the rest of the library, then the
// examples file (Tatoeba, Wiktionary, the courses: lexicon/exampledata.js).
//
// A phrase is matched word by word with the vowel marks taken off and, in Arabic and Persian, with و ف ب ل ك ال
// in front of a word allowed (وتاهوا في بيداء is found as "تاهوا في البيداء"). When the whole phrase is nowhere,
// a sentence with its main word (the longest one that isn't a little word) is offered instead, after the others.
// A long paragraph (a book's) is cut down to the sentence the match is in, or to the words round it.
//
// Pure: the library's search results come in (`/search`, the same on the computer, the phone and the web app).
// Tested in tests/js/librarysentence.test.mjs.

import { wordsOf } from "../lexicon/exampledata.js";

const UNSPACED = new Set(["ja", "zh", "th"]);
const FRONT_ONLY = /^(?:و|ف)?(?:ب|ل|ك)?(?:ال|لل)?/;
const MARKS = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g;   // Arabic vowel marks and the stretching line
// Little words never taken as a phrase's main word (most are short anyway: في, de, the).
const LITTLE = new Set(["على", "الى", "إلى", "عن", "من", "مع", "هذا", "هذه", "ذلك", "التي", "الذي", "كان", "that", "this",
  "with", "from", "para", "como", "pero", "dans", "pour", "avec", "nicht", "eine", "einen", "und", "oder", "della", "sono",
  "the", "and", "for", "por", "del", "los", "las", "una", "les", "des", "une", "der", "die", "das", "von", "che", "per", "non"]);
// How long a sentence offered may be, in words (characters for Japanese, Chinese and Thai), and how many words are
// kept on each side of the match when a sentence is longer.
export const MAX_WORDS = 32, SIDE_WORDS = 12, MAX_CHARS = 60;
// What makes one find better than another (less is better): the card's own source first, a sentence with only the
// phrase's main word after every one with the whole phrase.
export const OWN_SOURCE = -1, MAIN_WORD_ONLY = 2;

const isArabicScript = (lang) => lang === "ar" || lang === "fa" || lang === "ur";

/** One word as it is compared: its key (no marks, one alef: exampledata.js wordsOf) and, in Arabic script, the same
 * without the little words in front. */
function keysOf(token, lang) {
  const w = wordsOf(token, lang);
  const k = w.k.join("");
  return { k, b: w.b ? w.b.join("") : k };
}

/** Text without Arabic's vowel marks (what the library search is given). */
export const unmarked = (text) => String(text ?? "").replace(MARKS, "").normalize("NFC");

/**
 * A phrase's main words, the ones a sentence may have instead of the whole phrase: every word that isn't a little
 * word, longest first, as written (without vowel marks): ["وتاهوا", "بيداء"] for "وتاهوا في بيداء". None for a
 * single word (the word itself is searched for then).
 */
export function mainWordsOf(phrase, lang) {
  if (UNSPACED.has(lang)) return [];
  const words = unmarked(phrase).split(/\s+/).map((w) => w.replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, "")).filter(Boolean);
  if (words.length < 2) return [];
  const out = [];
  for (const w of words) {
    const { b } = keysOf(w, lang);
    if (b.length < 3 || LITTLE.has(w.toLowerCase()) || LITTLE.has(b)) continue;
    if (!out.some((x) => x.w === w)) out.push({ w, n: b.length });
  }
  return out.sort((a, b) => b.n - a.n).map((x) => x.w);  // (sort keeps the phrase's order among equals)
}

/** The main word of a phrase: the first of mainWordsOf, or "". */
export const mainWordOf = (phrase, lang) => mainWordsOf(phrase, lang)[0] || "";

/**
 * What to ask the library search for (it matches text inside a line, with the vowel marks and spelling variants
 * evened out): the phrase without the و or ف on its first word (so وتاهوا also finds تاهوا), and its two main words.
 */
export function searchQueries(phrase, lang) {
  const plain = unmarked(phrase).trim().replace(/\s+/g, " ");
  if (!plain) return [];
  const front = (x) => (isArabicScript(lang) ? x.replace(/^[وف](?=[^\s]{3,})/, "") : x);
  const out = [front(plain), ...mainWordsOf(plain, lang).slice(0, 2).map(front)];
  return [...new Set(out.filter(Boolean))];
}

/** A text cut into sentences (at . ! ? ؟ ۔ … and line breaks), each trimmed. */
export function sentencesOf(text) {
  return String(text ?? "").split(/(?<=[.!?؟۔…。！？])\s+|\n+/u).map((s) => s.trim()).filter(Boolean);
}

/** Where `phrase` is in the list of word keys `tokens`: {from, to} (to exclusive), or null. Each word of the phrase
 * matches as written or, in Arabic script, without the little words in front. */
function findRun(tokens, want) {
  for (let s = 0; s + want.length <= tokens.length; s++) {
    let ok = true;
    for (let t = 0; t < want.length && ok; t++) {
      const got = tokens[s + t], w = want[t];
      ok = !!got.k && (got.k === w.k || got.b === w.b || got.b === w.k || got.k === w.b);
    }
    if (ok) return { from: s, to: s + want.length };
  }
  return null;
}

/** The words round a match when the sentence is long: SIDE_WORDS each side, with … where words were left out. */
function around(raw, run) {
  if (raw.length <= MAX_WORDS) return raw.join(" ");
  const from = Math.max(0, run.from - SIDE_WORDS), to = Math.min(raw.length, run.to + SIDE_WORDS);
  return `${from > 0 ? "… " : ""}${raw.slice(from, to).join(" ")}${to < raw.length ? " …" : ""}`;
}

/**
 * The sentence of `text` (a line of a transcript, or a book's paragraph) that has `phrase`, cut to a readable length:
 * {text, main, mark?} (`main` true when only one of the phrase's main words was found: `mark`, that word), or null.
 */
export function sentenceWith(text, phrase, lang) {
  const plain = unmarked(phrase).trim();
  if (!plain) return null;
  if (UNSPACED.has(lang)) {
    const want = plain.replace(/[\s\p{P}\p{S}]+/gu, "");
    for (const s of sentencesOf(text)) {
      const at = s.indexOf(want);
      if (at < 0) continue;
      if (s.length <= MAX_CHARS) return { text: s, main: false };
      const from = Math.max(0, at - 20), to = Math.min(s.length, at + want.length + 20);
      return { text: `${from > 0 ? "…" : ""}${s.slice(from, to)}${to < s.length ? "…" : ""}`, main: false };
    }
    return null;
  }
  const want = plain.split(/\s+/).map((w) => keysOf(w, lang)).filter((w) => w.k);
  const mains = mainWordsOf(plain, lang).map((w) => ({ w, want: [keysOf(w, lang)] }));
  let fallback = null, fallbackRank = Infinity;
  for (const s of sentencesOf(text)) {
    const raw = s.split(/\s+/).filter(Boolean);
    const tokens = raw.map((r) => keysOf(r, lang));
    const run = want.length && findRun(tokens, want);
    if (run) return { text: around(raw, run), main: false };
    // (no whole phrase: the sentence with the most important of its main words, the first such)
    for (let r = 0; r < Math.min(mains.length, fallbackRank); r++) {
      const m = findRun(tokens, mains[r].want);
      if (m) { fallback = { text: around(raw, m), main: true, mark: mains[r].w }; fallbackRank = r; break; }
    }
  }
  return fallback;
}

/**
 * Sentences for card `v` from library search results (`hits`: [{episode_id, episode_title, text}], from `/search`),
 * best first: [{sentence, translation: "", source: "library", title, own, main, mark?, cost}] (`mark`: the main word,
 * to light up, when only it was found). The card's own source
 * (same episode, or same title when the card keeps only that) first; a sentence with the whole phrase before one
 * with only its main word; shorter (nearer 12 words) before longer. Repeats, and sentences in `skip`, left out.
 */
export function librarySentences(hits, v, lang, { skip = [], max = 12 } = {}) {
  const phrase = String((v && v.text) || "").trim();
  if (!phrase) return [];
  const ownId = v.episode_id != null && v.episode_id !== "" ? String(v.episode_id) : "";
  const ownTitle = String(v.episode_title || "").trim();
  const seen = new Set(skip.map((s) => unmarked(s).trim()));
  const out = [];
  for (const hit of hits || []) {
    const got = sentenceWith(hit.text, phrase, lang);
    if (!got) continue;
    const key = unmarked(got.text).trim();
    if (seen.has(key)) continue;
    seen.add(key);
    const own = (ownId && String(hit.episode_id) === ownId) || (!ownId && !!ownTitle && String(hit.episode_title || "").trim() === ownTitle);
    const n = UNSPACED.has(lang) ? got.text.length / 2.5 : got.text.split(/\s+/).length;
    const cost = (own ? OWN_SOURCE : 0) + (got.main ? MAIN_WORD_ONLY : 0) + Math.abs(n - 12) * 0.04;
    out.push({ sentence: got.text, translation: "", source: "library", title: String(hit.episode_title || ""), own, main: got.main,
      ...(got.mark ? { mark: got.mark } : {}), cost });
  }
  return out.sort((a, b) => a.cost - b.cost).slice(0, max);
}

/**
 * Every find in the order the learner steps through them: the library's (`library`, from librarySentences) with the
 * whole phrase, then the examples file's with it (`file`: [{sentence, translation, source, readable, main, mark}]),
 * then those with only a main word (the library's, then the file's). Repeats left out, and a file's main-word find
 * whose word isn't really in it (the file counts بَيْدَ "but" as a form of بيداء "desert": not for a phrase's word).
 */
export function mergeFinds(library, file, lang = "") {
  const whole = (x) => !x.main;
  const really = (x) => !x.mark || !lang || UNSPACED.has(lang) || !!sentenceWith(x.sentence, x.mark, lang);
  const order = [...library.filter(whole), ...file.filter(whole), ...library.filter((x) => x.main), ...file.filter((x) => x.main && really(x))];
  const seen = new Set(), out = [];
  for (const x of order) {
    const key = unmarked(x.sentence).trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(x);
  }
  return out;
}
