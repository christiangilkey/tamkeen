// Russian: from a word as it is written to its dictionary form, and where its stress falls.
//
// говорю, говорила, скажи, сказала -> говорить (an aspect pair counts as one word, under its
// imperfective); книги, книгой -> книга; новая, новых -> новый. Е and ё count as the same letter,
// and stress marks in the text (ла́дно) are ignored when matching.
//
// The table (docs/lexicon/ru-lemmas.json.gz, made by tools/build_russian.py from the OpenRussian.org
// dictionary) also says where each form's stress falls, so the screens can show ла́дно, сказа́ла,
// and write ё where the text has е (ещё). Without the table a word is known by its spelling, with
// е/ё and stress marks evened out. No screen or network code here: tests/js/russian.test.mjs.
//
// Besides the usual word table (lemmas, forms) the file holds
//   stress   {form: n}   n >= 0: index of the stressed vowel; n < 0: the е at index -n-1 is ё
//   shown    {lemma: how it is written}   for dictionary forms spelled with ё

import { EDGE_PUNCT } from "../wordlookup.js";

const ACUTE = "́";

/** The form Russian words are matched in: lower case, no stress marks, ё as е. */
export const ruMatch = (word) => String(word || "").normalize("NFD").replace(/́/g, "").normalize("NFC")
  .toLowerCase().replace(/ё/g, "е");

/** The lexeme of one Russian word: {key, lemma, pos, root}, or null for something that isn't a word. */
export function russianLexeme(token, table = null) {
  const form = ruMatch(String(token || "").replace(EDGE_PUNCT, ""));
  if (!/\p{L}/u.test(form)) return null;
  const lemma = (table && table.lookup(form)) || form;
  const shown = (table && table.shown && table.shown[lemma]) || lemma;
  return { key: `ru|${lemma}|x`, lemma: shown, pos: "", root: "" };
}

/** A token with its stress shown (говори́ла, ещё), keeping its case and punctuation. The token
 * as it was when the table doesn't know it, it has one vowel, or it already shows its stress. */
export function stressed(token, table) {
  const text = String(token || "");
  if (!table || !table.stress || text.includes(ACUTE) || /ё/i.test(text)) return text;
  const m = text.match(/[\p{L}-]+/u);
  if (!m) return text;
  const core = m[0];
  const n = table.stress[ruMatch(core)];
  if (n === undefined) return text;
  let marked;
  if (n >= 0) {
    if (n >= core.length) return text;
    marked = core.slice(0, n + 1) + ACUTE + core.slice(n + 1);
  } else {
    const i = -n - 1;
    if (!/[еЕ]/.test(core[i] || "")) return text;
    marked = core.slice(0, i) + (core[i] === "Е" ? "Ё" : "ё") + core.slice(i + 1);
  }
  return text.slice(0, m.index) + marked + text.slice(m.index + core.length);
}
