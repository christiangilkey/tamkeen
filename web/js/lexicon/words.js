// The lexeme behind each word of a text: what "have I seen this word before?" is asked about.
//
// A lexeme is a dictionary entry, not a spelling. Arabic gets real analysis (./arabic.js), so
// one known form covers every form of the word. The other languages have no analyzer yet: for
// them a word is known by its spelling, lower-cased. No screen or network code here.

import { analyzeArabic } from "./arabic.js";
import { EDGE_PUNCT } from "../wordlookup.js";

/** Languages whose words can only be told apart with downloaded dictionaries. */
export const needsDictionaries = (lang) => lang === "ar";

/** A word identified by how it is written (languages without an analyzer). */
export function surfaceLexeme(token, lang) {
  const core = String(token || "").normalize("NFC").replace(EDGE_PUNCT, "").toLowerCase();
  if (!/\p{L}/u.test(core)) return null; // numbers, punctuation
  return { key: `${lang}|${core}|x`, lemma: core, pos: "", root: "" };
}

/**
 * One entry per token: {key, lemma, pos, root}, or null for something that isn't a word.
 * Returns null altogether when the language needs dictionaries and none are loaded.
 */
export function lexemesFor(tokens, lang, dicts = null) {
  if (needsDictionaries(lang)) return dicts && dicts.length ? analyzeArabic(tokens, dicts) : null;
  return tokens.map((t) => surfaceLexeme(t, lang));
}

/** The lexeme of one word on its own (a word in a list, not in a sentence). Arabic reads running
 * text with an eye on the neighbouring words, so list words must come through here one at a time. */
export function lexemeOf(word, lang, dicts = null) {
  const found = lexemesFor([word], lang, dicts);
  return found ? found[0] : null;
}

/** The words of a sentence carrying ⟦ ⟧ marks (as stored with a looked-up definition), and
 * which of them are inside the marks: {tokens, marked: [indexes]}. */
export function markedTokens(sentence) {
  const tokens = [];
  const marked = [];
  let inside = false;
  for (const piece of String(sentence || "").split(/(⟦|⟧)/)) {
    if (piece === "⟦") { inside = true; continue; }
    if (piece === "⟧") { inside = false; continue; }
    for (const t of piece.split(/\s+/).filter(Boolean)) {
      if (inside) marked.push(tokens.length);
      tokens.push(t);
    }
  }
  return { tokens, marked };
}
