// Example sentences for a word, with their English translation, from the language's examples file
// (docs/lexicon/<lang>-examples.json.gz, tools/build_examples.py): Tatoeba's sentences and the English
// Wiktionary's usage examples. For "Add words" with no AI key (and its sentence choice "Write one for
// me"): a real sentence a person wrote, not one made up.
//
// A word is found as written (its key, as meanings.js matches words: no vowel marks, one alef, ة as ه), with
// Arabic's little words in front taken off (و، ف، ب، ل، ك، ال), then in its other forms: the file's own table of
// which word each form is (`forms`, tools/enrich_examples.mjs: مشاكل, مشكلتي and المشكلات count for مشكلة, Teile
// for Teil, incluye for incluir), and by its dictionary form when the app's word tables are on the device
// (`lemmaOf`: hablaba is found for hablar). Japanese, Chinese and Thai, written without spaces, are found inside
// the sentence; Korean also with its endings on (정보를 for 정보). Short everyday sentences first. The Basics
// course's own sentence for each of the 1,000 commonest words is in the file too (source "b"), so those words
// always have one.
//
// No page code: tests/js/exampledata.test.mjs, tests/js/freemnemonic.test.mjs.

import { arabicVariants, matchKey } from "./meaningdata.js";

const UNSPACED = new Set(["ja", "zh", "th"]);
// The app's Arabic dialect courses (coursedata.js ARABIC_VARIETIES) and the codes their sentences and sounds are
// filed under in the examples file (Tatoeba's and Wiktionary's; the courses' own sentences under the first).
export const DIALECT_CODES = { egy: ["arz"], lev: ["apc", "ajp"], glf: ["afb", "acw"], mor: ["ary"], irq: ["acm"] };
const codesOf = (dialect) => (dialect ? DIALECT_CODES[dialect] || [dialect] : []);
// What new words cost a sentence (i+1): one with no new word but the card's gains READABLE; each new word
// costs NEW_WORD, at most NEW_WORD_CAP (a hard sentence of the right sense still beats a wrong one).
export const READABLE = -1.8, NEW_WORD = 0.4, NEW_WORD_CAP = 1.8;
const WORD = /[\p{L}\p{M}\p{N}'’-]+/gu;
const AR_FRONT = /^(?:و|ف)?(?:ب|ل|ك)?(?:ال|لل)?/;
// What a sentence costs when it has another form of the word (less is better; as written is 0, with و ف ب ل ك ال
// in front 0.5): a form in the file's table (FORM_COST: مشاكل for مشكلة), one that is also a word of its own
// (ALSO_COST: كتب is "books" and "he wrote"), Korean with an ending on (KO_COST: 정보를 for 정보).
export const FORM_COST = 0.8, ALSO_COST = 1.3, KO_COST = 0.7;
// A sentence with only the core of a card's word ("Teil" for "der Teil, -e"), not all of it.
export const CORE_COST = 0.3;
// Korean's little words after a noun, for a word of one syllable (힘이, 뜻을; 힘들다 is another word).
const KO_PARTICLES = ["이", "가", "은", "는", "을", "를", "에", "의", "도", "만", "로", "으로", "과", "와", "에서", "에게", "까지",
  "부터", "이에요", "예요", "이야", "이다", "입니다", "이랑", "랑", "하고", "처럼", "보다"];
// Arabic letters in their joined shapes (ﻣﺸﻜﻠﺔ, copied from a PDF), and characters nobody sees that come with copied
// text (the marks that set the writing direction, zero-width spaces): made plain before a word is looked for.
const PRESENTATION = /[ﭐ-﷿ﹰ-﻾]/u;
const INVISIBLE = /[​‍-‏‪-‮⁦-⁩؜﻿­]/gu;
/** A word as it is looked for: without characters nobody sees, Arabic's joined shapes made plain letters. */
export function plainWord(text) {
  let w = String(text ?? "");
  if (PRESENTATION.test(w)) w = w.normalize("NFKC");
  return w.replace(INVISIBLE, "").trim();
}

const clean = (w) => w.replace(/^['’-]+|['’-]+$/g, "");
const EDGE = /^[\s\p{P}\p{S}]+|[\s\p{P}\p{S}]+$/gu;

/**
 * A text's words as keys, in order, for finding phrases: {k: [keys], b: [the same without و ف ب ل ك ال in front]
 * (Arabic and Persian only, else null)}. Japanese, Chinese and Thai: the whole text without spaces and
 * punctuation, as one key (they are searched for inside the sentence instead).
 */
export function wordsOf(text, lang) {
  if (UNSPACED.has(lang)) {
    const all = String(text ?? "").replace(/[\s\p{P}\p{S}]+/gu, "");
    return { k: all ? [all] : [], b: null };
  }
  const k = [], b = lang === "ar" || lang === "fa" ? [] : null;
  for (const m of String(text ?? "").matchAll(WORD)) {
    const w = clean(m[0]);
    if (!w) continue;
    const key = matchKey(w, lang);
    k.push(key);
    if (b) { const bare = key.replace(AR_FRONT, ""); b.push(bare.length >= 3 ? bare : key); }
  }
  return { k, b };
}

/** The words of a sentence, as keys. Arabic: each also without the little words in front. */
export function sentenceKeys(text, lang) {
  const out = [];
  for (const m of String(text).matchAll(WORD)) {
    const w = clean(m[0]);
    if (!w || /^\d+$/.test(w)) continue;
    const k = matchKey(w, lang);
    out.push(k);
    if (lang === "ar" || lang === "fa") {
      const bare = k.replace(AR_FRONT, "");
      if (bare && bare !== k && bare.length >= 2) out.push(bare);
    }
  }
  return out;
}

export class ExamplePack {
  constructor(data, lang) {
    this.lang = lang;
    this.sentences = (data && data.sentences) || [];
    this.words = (data && data.words) || {};
    this.ipa = (data && data.ipa) || {};
    this.t2s = (data && data.t2s) || null;  // Chinese: traditional characters' simplified ones
    this.dialectIpa = (data && data.dialect_ipa) || {};  // Arabic: each dialect's own pronunciations
    // {a word of the sentences: "its dictionary words, joined by |"} (tools/enrich_examples.mjs); `also`: those that
    // are dictionary words themselves too
    this.forms = (data && data.forms) || {};
    this.also = (data && data.also) || {};
    this.index = null;
    this.lemmaIndex = null;
  }

  /** The dictionary words `key` is a form of, each with what a sentence through it costs: [[lemma, cost]]. */
  lemmasOf(key) {
    const out = [];
    for (const [table, cost] of [[this.forms, FORM_COST], [this.also, ALSO_COST]]) {
      if (Object.prototype.hasOwnProperty.call(table, key)) for (const l of String(table[key]).split("|")) if (l) out.push([l, cost]);
    }
    return out;
  }

  /** dictionary word -> [[a form of it that the sentences have, cost]], made the first time it is needed. */
  formsByLemma() {
    if (!this.lemmaIndex) {
      this.lemmaIndex = new Map();
      for (const [table, cost] of [[this.forms, FORM_COST], [this.also, ALSO_COST]]) {
        for (const [form, lemmas] of Object.entries(table)) {
          for (const l of String(lemmas).split("|")) {
            if (!l) continue;
            const list = this.lemmaIndex.get(l);
            if (list) list.push([form, cost]); else this.lemmaIndex.set(l, [[form, cost]]);
          }
        }
      }
    }
    return this.lemmaIndex;
  }

  /**
   * Sentences with another form of the word whose key is `key` (its plural, with a pronoun ending, a verb's other
   * forms), through the file's table, given to `add(i, cost)`: the forms of `key` itself and, when `key` is itself
   * a form of a dictionary word (a card of مشاكل), that word and its other forms, for a little more. `base` is
   * added to every cost.
   */
  otherForms(key, add, base = 0) {
    const index = this.byKey(), byLemma = this.formsByLemma();
    const through = (lemma, extra) => {
      if (extra) for (const i of index.get(lemma) || []) add(i, base + extra);
      for (const [form, cost] of byLemma.get(lemma) || []) {
        if (form === key) continue;
        for (const i of index.get(form) || []) add(i, base + extra + cost);
      }
    };
    through(key, 0);
    for (const [lemma, cost] of this.lemmasOf(key)) through(lemma, cost);
  }

  /** Korean: sentences with `key` and an ending or little word after it, given to `add(i, cost)`: a word of two
   * syllables or more, or a verb's stem (이용하다: 이용하…, and 이용 for 이용해서), with anything after it; one of
   * one syllable only with a little word after it (힘이, not 힘들다). */
  koreanForms(key, add) {
    const stem = key.endsWith("다") && key.length >= 3 ? key.slice(0, -1) : key;
    const stems = stem.length >= 2 ? [stem] : [];
    if (stem.endsWith("하") && stem.length >= 3) stems.push(stem.slice(0, -1));
    const one = stems.length ? null : new Set(KO_PARTICLES.map((p) => key + p));
    let n = 0;
    for (const [k, list] of this.byKey()) {
      if (k === key || !(one ? one.has(k) : stems.some((s) => k.startsWith(s)))) continue;
      for (const i of list) add(i, KO_COST);
      if (++n >= 200) break;
    }
  }

  /** Wiktionary's IPA for the word ("" when it has none). Chinese: "py:<pinyin>". Arabic and Persian list
   * every word written that way with its part of speech ("qalam|n;qallama|v"): the verb's is taken when
   * `verb` (a meaning like "to write"), else the first. */
  ipaOf(word, { verb = false, dialect = "" } = {}) {
    // A dialect course's own sounds first (Egyptian ʔalb, not MSA qalb), from Wiktionary's dialect entries.
    for (const code of codesOf(dialect)) {
      const own = (this.dialectIpa[code] || {})[matchKey(word, this.lang)];
      if (own) return own;
    }
    let said = this.ipa[matchKey(word, this.lang)] || "";
    // Thai, Japanese and Chinese words the file lacks are often made of words it has: the longest known
    // piece first, each piece's sounds one after the other.
    let w = String(word ?? "").trim();
    if (!said && this.t2s) { w = Array.from(w, (c) => this.t2s[c] || c).join(""); said = this.ipa[w] || ""; }
    if (!said && UNSPACED.has(this.lang)) said = this.piecewise(w);
    if (!said.includes("|")) return said;
    const list = said.split(";").map((x) => x.split("|"));
    return ((verb && list.find((x) => x[1] === "v")) || list[0])[0];
  }

  piecewise(w) {
    const out = [];
    for (let i = 0; i < w.length;) {
      let j = Math.min(w.length, i + 8);
      while (j > i + 1 && !this.ipa[w.slice(i, j)]) j--;
      const said = this.ipa[w.slice(i, j)];
      if (!said) return "";
      out.push(said);
      i = j;
    }
    if (out.length < 2) return "";
    return out[0].startsWith("py:") ? "py:" + out.map((x) => x.replace(/^py:/, "")).join(" ") : out.map((x) => x.split("|")[0]).join(".");
  }

  /** key -> sentence numbers, made the first time it is needed. */
  byKey() {
    if (!this.index) {
      this.index = new Map();
      this.sentences.forEach(([text], i) => {
        for (const k of new Set(sentenceKeys(text, this.lang))) {
          const list = this.index.get(k);
          if (list) { if (list.length < 60) list.push(i); } else this.index.set(k, [i]);
        }
      });
    }
    return this.index;
  }

  /** Every sentence's words in order (wordsOf), made the first time a phrase is looked for. */
  sequences() {
    if (!this.seqs) this.seqs = this.sentences.map(([text]) => wordsOf(text, this.lang));
    return this.seqs;
  }

  /** The keys that count as `key` in a phrase: itself and, with the word tables (`lemmaOf`), the other forms
   * of the same word that the sentences have (tomando for tomar: "me estás tomando el pelo"). Words of fewer
   * than 3 letters (de, el, في) only as written. */
  formsOf(key, lemmaOf) {
    const out = new Set([key]);
    const lemma = lemmaOf && key.length >= 3 ? safe(lemmaOf, key) : null;
    if (!lemma) return out;
    const stem = key.slice(0, Math.max(2, Math.min(4, key.length - 2)));
    let tried = 0;
    for (const k of this.byKey().keys()) {
      if (k === key || !k.startsWith(stem)) continue;
      if (++tried > 3000) break;
      if (safe(lemmaOf, k) === lemma) out.add(k);
    }
    return out;
  }

  /**
   * Sentences that have phrase `text`'s words one after another, given to `add(i, cost)`: cost 0 as written,
   * 0.5 with و ف ب ل ك ال in front of a word (Arabic, Persian), 1 with another form of a word (`lemmaOf`, the
   * word tables, when they are on the device). At most `max` sentences.
   */
  phraseIn(text, { lemmaOf = null, add, max = 400 } = {}) {
    const want = wordsOf(text, this.lang).k;
    if (want.length < 2) return;
    const forms = want.map((k) => this.formsOf(k, lemmaOf));
    const seqs = this.sequences();
    let n = 0;
    for (let i = 0; i < seqs.length && n < max; i++) {
      const { k, b } = seqs[i];
      let best = Infinity;
      for (let s = 0; s + want.length <= k.length && best > 0; s++) {
        let cost = 0;
        for (let t = 0; t < want.length && cost < Infinity; t++) {
          const got = k[s + t];
          if (got === want[t]) continue;
          if (b && b[s + t] === want[t]) cost = Math.max(cost, 0.5);
          else if (forms[t].has(got)) cost = Math.max(cost, 1);
          else cost = Infinity;
        }
        best = Math.min(best, cost);
      }
      if (best < Infinity) { add(i, best); n++; }
    }
  }

  /** The file's English for `text` when `text` is one of its sentences (the same words, whatever the
   * capitals and punctuation: "¿cómo estás?" is Tatoeba's "¿Cómo estás?"), the shortest if several; else "". */
  translationOf(text) {
    const words = wordsOf(text, this.lang).k, want = words.join(" ");
    if (!want) return "";
    const seqs = this.sequences();
    let best = "";
    for (let i = 0; i < seqs.length; i++) {
      if (seqs[i].k.length !== words.length || seqs[i].k.join(" ") !== want) continue;
      const english = plainEnglish(this.sentences[i][1]);
      if (english && (!best || english.length < best.length)) best = english;
    }
    return best;
  }

  /**
   * Sentences that use `word`, best first: [{text, english, source}] (`source` "t<number>" for Tatoeba,
   * "w" for Wiktionary). `lemmaOf(form)` gives a word's dictionary form, when the word tables are here;
   * `dialect` prefers sentences of an Arabic dialect ("arz", "apc"...: Tatoeba's and Wiktionary's codes).
   * `core`: the part of a card's word that is the word itself, when there is more round it ("Teil" for "der Teil, -e",
   * review/wordcore.js soundCore): its sentences count too, for a little more (CORE_COST).
   */
  find(word, { lemmaOf = null, dialect = "", meaning = "", count = 3, newWords = null, core = "" } = {}) {
    const w = plainWord(word);
    if (!w) return [];
    const lang = this.lang;
    const picked = new Map();  // sentence number -> how well it fits (less is better)
    const adder = (extra) => (i, cost) => { cost += extra; if (!picked.has(i) || picked.get(i) > cost) picked.set(i, cost); };
    this.pick(w, picked, adder(0), { lemmaOf, count });
    const c = plainWord(core);
    if (c && matchKey(c, lang) !== matchKey(w, lang)) this.pick(c, picked, adder(CORE_COST), { lemmaOf, count });
    return this.rank(picked, { dialect, meaning, count, newWords });
  }

  /** The sentences that have word or phrase `w`, given to `add(i, cost)` (`picked` is what was found so far). */
  pick(w, picked, add, { lemmaOf = null, count = 3 } = {}) {
    const lang = this.lang;
    const key = matchKey(w, lang);
    // A phrase ("por favor", "إن شاء الله"): its own entry's examples, then sentences with its words one after another.
    const several = !UNSPACED.has(lang) && wordsOf(w, lang).k.length > 1;
    // 1. Wiktionary's examples in the word's own entry.
    // (Chinese entries also give Cantonese and classical examples: Tatoeba's Mandarin is as good a choice.)
    // (and the Basics course's sentence for its word: as good as one with the word as written, no better)
    for (const i of this.words[several ? matchKey(w.replace(EDGE, ""), lang) : key] || []) {
      add(i, String(this.sentences[i][2]).startsWith("b") ? 0 : lang === "zh" ? 1.5 : -1.2);
    }
    if (several) this.phraseIn(w, { lemmaOf, add });
    else if (UNSPACED.has(lang)) {
      // 2. Written without spaces: the word inside the sentence.
      // (without the punctuation round it: お願いします。 is found in 静かにお願いします。)
      const inner = w.replace(EDGE, "") || w;
      if (inner.length >= 1) {
        let n = 0;
        for (let i = 0; i < this.sentences.length && n < 400; i++) {
          if (this.sentences[i][0].includes(inner) && !picked.has(i)) { add(i, 0); n++; }  // (an entry's own example keeps its own cost)
        }
      }
    } else {
      // 2. The word as written.
      const index = this.byKey();
      for (const i of index.get(key) || []) add(i, 0);
      if (lang === "ar" || lang === "fa") for (const i of index.get(key.replace(AR_FRONT, "")) || []) add(i, 0.5);
      // 2b. Its other forms, from the file's own table (no word tables needed): مشاكل and مشكلتي for مشكلة.
      this.otherForms(key, add);
      const bare = lang === "ar" || lang === "fa" ? key.replace(AR_FRONT, "") : key;
      if (bare !== key && bare.length >= 2) this.otherForms(bare, add, 0.5);
      // (an Arabic card with a pronoun ending on, مشكلتي: the word without it)
      if (lang === "ar" && !index.has(key) && !this.lemmasOf(key).length) {
        const byLemma = this.formsByLemma();
        const v = arabicVariants(key).slice(1).find((x) => x !== key && x.length >= 2 && (index.has(x) || byLemma.has(x)));
        if (v) { for (const i of index.get(v) || []) add(i, 0.5); this.otherForms(v, add, 0.5); }
      }
      // Korean writes its little words and endings onto the word (정보를, 이용해서).
      if (lang === "ko") this.koreanForms(key, add);
      // 3. Other forms of it (by dictionary form), when the word tables are on the device.
      if (picked.size < count && lemmaOf) {
        const lemma = safe(lemmaOf, w);
        if (lemma) {
          const stem = key.slice(0, Math.max(2, Math.min(4, key.length - 2)));
          let tried = 0;
          for (const [k, list] of index) {
            if (k === key || !k.startsWith(stem) || ++tried > 3000) continue;
            if (safe(lemmaOf, k) === lemma) for (const i of list) add(i, 1);
          }
        }
      }
    }
  }

  /** `picked` (sentence number -> cost) in order, best first, as find() gives them. */
  rank(picked, { dialect = "", meaning = "", count = 3, newWords = null } = {}) {
    const lang = this.lang;
    const fit = (i) => {
      const [text, , source] = this.sentences[i];
      const n = UNSPACED.has(lang) ? text.length / 2.5 : (text.match(WORD) || []).length;
      const own = source.includes(":") ? source.split(":")[1] : "";
      // a whole sentence, not a phrase ("perro callejero"); a translation without long notes
      // (a dictionary's phrase or idiom: short or lower-case, with no full stop: "dar la vuelta a la manzana")
      const ended = /[.!?。！？؟।]["'»”)]*$/.test(text.trim());
      const phrase = UNSPACED.has(lang) ? text.length < 8 : n < 3 || (!ended && (n < 5 || /^\p{Ll}/u.test(text)));
      // (a title or a heading, with no full stop, after the sentences that have one)
      const untidy = !ended && !UNSPACED.has(lang) ? 1.5 : 0;
      // (Chinese, Japanese, Thai: Wiktionary's examples are often literary or phrases; Tatoeba's everyday sentences first)
      const literary = UNSPACED.has(lang) && source.startsWith("w") ? 0.6 : 0;
      // a sentence whose translation has the meaning is about this sense of the word (manzana: apple, not block)
      const sense = meaning ? (markTranslation(this.sentences[i][1], meaning).includes("⟦") ? -0.6 : 1.5) : 0;
      return picked.get(i) + Math.abs(n - 7) * 0.12 + (n > 12 ? 1 : 0) + (phrase ? 3 : 0) + untidy + literary + (this.sentences[i][1].length > 100 ? 1 : 0) + sense
        // the dialect being studied first (−0.8), Standard Arabic next (+0.4), another dialect last (+2.5)
        + (own && wanted.includes(own) ? -0.8 : own ? 2.5 : wanted.length ? 0.4 : 0)
        // A sentence the learner can read comes first (i+1): every other word one they have seen.
        + (unseen.has(i) ? (unseen.get(i) === 0 ? READABLE : Math.min(NEW_WORD_CAP, unseen.get(i) * NEW_WORD)) : 0);
    };
    const wanted = codesOf(dialect);
    const unseen = new Map();
    if (newWords) for (const i of picked.keys()) { const n = safe(newWords, this.sentences[i][0]); if (Number.isInteger(n)) unseen.set(i, n); }
    return [...picked.keys()].sort((a, b) => fit(a) - fit(b)).slice(0, count)
      .map((i) => ({ text: this.sentences[i][0], english: plainEnglish(this.sentences[i][1]), source: this.sentences[i][2],
        ...(unseen.has(i) ? { newWords: unseen.get(i) } : {}) }));
  }
}
/** A translation without Wiktionary's notes after it ("… (proverb)", "… [and other animals]"). */
const NOTE = /\s*(?:\([^()]*\)|\[[^\]]*\])(?=\s*[.!?]?\s*$)/;
const plainEnglish = (t) => String(t).replace(NOTE, "").replace(NOTE, "").trim() || String(t);
const safe = (f, x) => { try { return f(x); } catch { return null; } };

/** The English translation with ⟦ ⟧ round the word for the meaning, when it is there as a word (the
 * review card lights it up, as it does for the AI's translations). */
export function markTranslation(english, meaning) {
  const text = String(english || "");
  // (a phrase's meaning ends as a question may: "how are you?" is marked as "how are you", not just "how")
  const words = String(meaning || "").replace(/\([^)]*\)/g, " ").split(/[;,/]/)[0].replace(/^\s*(?:to|a|an|the)\s+/i, "").replace(/[\s?!.¿¡]+$/u, "").trim();
  if (!words || text.includes("⟦")) return text;
  const tries = [words, ...words.split(/\s+/).filter((x) => x.length >= 3).sort((a, b) => b.length - a.length)];
  for (const t of tries) {
    const esc = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // the word, or a regular form of it (dogs, wrote is not found: that is fine)
    const m = new RegExp(`\\b(${esc}(?:s|es|ed|d|ing)?)\\b`, "i").exec(text);
    if (m) return text.slice(0, m.index) + `⟦${m[1]}⟧` + text.slice(m.index + m[1].length);
  }
  return text;
}

/** Where a sentence comes from, for the learner: "Tatoeba" (with its address), "Wiktionary", one of Tamkeen's courses… */
export function sourceOf(source) {
  const s = String(source || "");
  if (s.startsWith("b")) return { name: "Tamkeen's Basics course", url: "" };
  if (s.startsWith("d")) return { name: "Wolff, A Dictionary of Cebuano Visayan", url: "https://www.gutenberg.org/ebooks/40074" };
  if (s.startsWith("c")) return { name: "Tamkeen's dialect course", url: "" };
  if (s.startsWith("t")) {
    const id = s.slice(1).split(":")[0];
    return { name: "Tatoeba", url: `https://tatoeba.org/en/sentences/show/${id}` };
  }
  return { name: "Wiktionary", url: "https://en.wiktionary.org/" };
}
