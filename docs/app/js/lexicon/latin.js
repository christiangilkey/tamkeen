// Latin: from a word as it is written to its dictionary form (puellārum -> puella, amāvisset -> amō, fuit -> sum).
//
//   1. the key    Latin is written with and without macrons (ā ē ī ō ū), sometimes with accents (Dóminus, in
//                 church books) or a diaeresis (poëta), with j or i (iam, jam), v or u (vir, uir), and æ œ or
//                 ae oe. All of these are one word: the key has no marks, i for j, u for v, ae oe, small letters
//                 (as Arabic matching ignores the vowel marks). latin_key in tools/build_latin.py is its twin.
//   2. look up    the word table (docs/lexicon/la-lemmas.json.gz, tools/build_latin.py): every form English
//                 Wiktionary lists, with the dictionary form it belongs to, written with its macrons; a form
//                 two words share goes to the commoner one (est: sum, not edō "eat").
//   3. -que -ne -ve  "and", the question mark and "or" are written onto the word before (senātusque, vidēsne,
//                 plūsve): a form the table doesn't know is tried without them.
//
// Without the table a word is known by its key. No screen or network code here: tests/js/latin.test.mjs.

import { EDGE_PUNCT } from "../wordlookup.js";

const MARKS = /[̀-ͯ]/g;

/** The form a Latin word is matched in (see 1 above). */
export function latinKey(word) {
  return String(word ?? "").trim().normalize("NFD").replace(MARKS, "").toLowerCase()
    .replace(/æ/g, "ae").replace(/œ/g, "oe").normalize("NFC").replace(/j/g, "i").replace(/v/g, "u");
}

// The little words written onto the end of another (in key form: v is u).
const ENCLITICS = ["que", "ne", "ue"];

/** The word without the -que, -ne or -ve on its end, when it has one: senatusque -> senatus. Keys in, keys out. */
export function withoutEnclitic(k) {
  for (const e of ENCLITICS) if (k.endsWith(e) && k.length - e.length >= 2) return k.slice(0, -e.length);
  return "";
}

/** The dictionary form (with its macrons) of a Latin word the table knows, or null. */
export function latinLemma(word, table) {
  if (!table) return null;
  const k = latinKey(String(word ?? "").replace(EDGE_PUNCT, ""));
  if (!k) return null;
  const found = table.lookup(k);
  if (found) return found;
  const bare = withoutEnclitic(k);
  return bare ? table.lookup(bare) : null;
}

/** The lexeme of one word: {key, lemma, pos, root}, or null for something that isn't a word.
 * `lemma` is the dictionary form as a dictionary writes it (amō); the key has no macrons (la|amo|x). */
export function latinLexeme(token, table = null) {
  const word = String(token ?? "").normalize("NFC").replace(EDGE_PUNCT, "");
  if (!/\p{L}/u.test(word)) return null;
  const lemma = latinLemma(word, table) || word.toLowerCase();
  return { key: `la|${latinKey(lemma)}|x`, lemma, pos: "", root: "" };
}
