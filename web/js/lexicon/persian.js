// Persian: from a word as it is written to its dictionary form (lemma).
//
// می‌خواهم, میخواهم, نمی‌خواهم, خواستم, بخواهید -> خواستن "to want"; کتاب‌هایم, کتابهایم -> کتاب "book";
// بزرگ‌ترین -> بزرگ "big"; دانشجویان -> دانشجو "student"; خانه‌ای -> خانه "house".
//
//   1. clean     punctuation off the ends; Persian letters (ک ی for ك ي), no short-vowel marks, and no half
//                space (ZWNJ): Persian joins a word's pieces with one (می‌خواهم) or writes them together
//                (میخواهم), and both are the same word (persianKey: tools/build_persian.py `key` agrees);
//   2. look up   the word table (docs/lexicon/fa-lemmas.json.gz, made by tools/build_persian.py from
//                Wiktionary's Persian headwords and verb tables; downloaded only by someone learning Persian);
//   3. verbs     a form the table doesn't list is taken apart: not (ن), the present می or the subjunctive ب,
//                the stem, the person ending (or the perfect's ه + ام / ای / است…), and the stem looked up
//                among every verb's two stems (خواه, خواست: خواستن);
//   4. endings   a noun or adjective with its endings joined on: the plural (ها, ان, یان, گان), ezafe and
//                "a" (ی), the pronoun endings (م ت ش مان تان شان, ام ات اش after ه), the comparative (تر, ترین):
//                taken off when what is left is a word the table knows.
//
// Without the table a word is known by its cleaned spelling. No screen or network code here:
// tests/js/persian.test.mjs.

import { EDGE_PUNCT } from "../wordlookup.js";

const MARKS = /[ً-ٰٟـ]/g; // short vowels, tanween, shadda, sukun, superscript alef, tatweel
const INVISIBLE = /[​-‏­⁠﻿]/g; // the half space (ZWNJ) and its look-alikes
const LETTERS = { "ي": "ی", "ى": "ی", "ك": "ک", "ۀ": "ه", "ة": "ه" };

/** A Persian word as it is matched: Persian letters, no vowel marks, no half space. */
export function persianKey(word) {
  return String(word ?? "").trim().normalize("NFC").replace(/[يىكۀة]/g, (c) => LETTERS[c]).replace(MARKS, "").replace(INVISIBLE, "");
}

const isVerb = (lemma) => /(?:تن|دن|ستن|یدن)$/.test(lemma);

// ---------- 3: verbs ----------
// Person endings, longest first: written (م ی د یم ید ند) and spoken (ه "he", ن "they", ین "you all").
const ENDINGS = ["یم", "ید", "ند", "ین", "م", "ی", "د", "ن", "ه", ""];
// The perfect: the past participle (stem + ه) and a form of "to be": رفته‌ام, رفته‌اند, رفته است.
const PERFECT = ["ام", "ای", "است", "ایم", "اید", "اند", "ان", "این", ""];

function verbOf(w, table) {
  if (!table.stems) return null;
  const stem = (s) => (s.length >= 2 && Object.prototype.hasOwnProperty.call(table.stems, s) ? table.lemmas[table.stems[s]] : null);
  const fronts = [w];
  if (w.startsWith("ن") && w.length > 3) fronts.push(w.slice(1)); // not: نمی‌خواهم, نخواستم
  for (const f of [...fronts]) {
    if (f.startsWith("می") && f.length > 3) fronts.push(f.slice(2)); // the present / past continuous
    else if (f.startsWith("همی") && f.length > 4) fronts.push(f.slice(3)); // (old and poetic)
    else if (f.startsWith("ب") && f.length > 2) fronts.push(f.slice(1)); // the subjunctive and the imperative
  }
  for (const f of fronts.slice(1)) {
    // (a stem beginning with a vowel takes ی after ب: بیندازد -> انداز, بیاورد -> آور)
    if (f.startsWith("ی") && f.length > 2) fronts.push(f.slice(1), `ا${f.slice(1)}`, `آ${f.slice(1)}`);
  }
  for (const f of fronts) {
    // Without می, ب or ن in front, only the past and the perfect (رفتم, نوشتیم, رفته‌ام): a present stem with an
    // ending and nothing in front is most often a noun with one (کارم "my work", not "I plant"); the present forms
    // of the verbs that have them (دارم, هستم, خواهم) are in the table.
    const affixed = f !== w;
    for (const p of PERFECT) {
      if (!p || !f.endsWith(p)) continue;
      const part = f.slice(0, -p.length);
      if (!part.endsWith("ه")) continue;
      const v = stem(part.slice(0, -1));
      if (v && pastStem(part.slice(0, -1), v)) return v;
    }
    for (const e of ENDINGS) {
      if (!f.endsWith(e)) continue;
      const s = e ? f.slice(0, -e.length) : f;
      const v = stem(s);
      if (v && (affixed || pastStem(s, v))) return v;
    }
  }
  return null;
}

// Is s the past stem of verb v (the infinitive less its ن: رفت of رفتن)?
const pastStem = (s, v) => `${s}ن` === v;

// ---------- 4: endings on nouns and adjectives ----------
// Longest first; each is tried off the word, then off what is left once more (کتاب‌هایمان: ها + یمان).
const NOUN_ENDINGS = ["هایشان", "هایتان", "هایمان", "هایش", "هایت", "هایم", "هایی", "های", "ها",
  "یشان", "یتان", "یمان", "شان", "تان", "مان", "ترین", "تر", "یان", "گان", "ان", "ات", "ام", "اش", "ای", "یی", "ی", "م", "ت", "ش"];

function stemOf(w, table, depth = 0) {
  for (const e of NOUN_ENDINGS) {
    if (!w.endsWith(e) || w.length - e.length < 2) continue;
    let s = w.slice(0, -e.length);
    if (e === "گان") s = `${s}ه`; // پرندگان -> پرنده
    if (e === "یی" || e === "ای" || e === "ام" || e === "اش" || e === "ات") { // after a vowel: دانشجویی، خانه‌ام
      if (!/[اوه]$/.test(s)) continue;
    }
    if (table.isLemma.has(s)) return s;
    const via = Object.prototype.hasOwnProperty.call(table.forms, s) ? table.lemmas[table.forms[s]] : null;
    if (via && !isVerb(via)) return via;
    if (depth === 0 && s.length >= 3) { const deeper = stemOf(s, table, 1); if (deeper) return deeper; }
  }
  return null;
}

/** The dictionary form of a cleaned Persian word (persianKey) that `table` finds, or null. */
export function persianLemma(word, table) {
  if (!table || !word) return null;
  const found = table.lookup(word);
  if (found) return found;
  return verbOf(word, table) || stemOf(word, table);
}

/** The lexeme of one Persian word: {key, lemma, pos, root}, or null for something that isn't a word. */
export function persianLexeme(token, table = null) {
  const word = persianKey(String(token ?? "").replace(EDGE_PUNCT, ""));
  if (!/\p{L}/u.test(word)) return null;
  const lemma = persianLemma(word, table) || word;
  const shown = (table && table.shown && table.shown[lemma]) || lemma;
  return { key: `fa|${lemma}|x`, lemma: shown, pos: "", root: "" };
}
