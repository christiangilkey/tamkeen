// "Is this word Standard Arabic?" for the dialect courses: the rules of tools/course/dialect/README.md that
// code can check. Used by candidates.mjs (to sort words out early) and tests/js/dialect-course.test.mjs
// (to prove the published lists keep the rules).
import { matchForm } from "../../../web/js/lexicon/arabic.js";

/** A word compared with the MSA list: no vowel marks, one alef/ya/ta marbuta, no tatweel or ⟦ ⟧. */
export const bare = (w) => matchForm(String(w || "").replace(/[⟦⟧ـ]/g, "")).trim();

// The regular sound changes between Standard Arabic and the dialects, written as the dialects spell them
// (rule 2): a dialect letter -> the Standard letters it can stand for.
const SHIFTS = {
  "ت": ["ث"], "س": ["ث"], "د": ["ذ"], "ز": ["ذ", "ظ"], "ض": ["ظ"], "ظ": ["ض"],
  "ا": ["ق", "ء", "ا"], "ء": ["ق"], "ي": ["ء", "ج"], "ك": ["ق"], "ج": ["ق"], "و": ["ء"], "ه": ["ء"],
  // Iraqi: گ is said g, mostly where Standard Arabic has ق (گال = قال); چ is ch, mostly for ك (چان = كان).
  "گ": ["ق", "ك"], "چ": ["ك"],
};

/**
 * The Standard spellings a dialect word could be the same word as, said the dialect's way: each one
 * letter changed back (كتير -> كثير, دايما -> دائما, ورا -> وراء, ويه -> وجه), plus a lost final hamza or ta
 * marbuta put back. Matching forms.
 */
export function msaSpellings(word) {
  const w = bare(word);
  const out = new Set([w, `${w}ء`, `${w}ه`, w.replace(/ه$/, "")]);
  for (let i = 0; i < w.length; i++) {
    for (const to of SHIFTS[w[i]] || []) {
      out.add(w.slice(0, i) + to + w.slice(i + 1));
      if (to === "ء") out.add(matchForm(w.slice(0, i) + "ئ" + w.slice(i + 1)));
    }
  }
  out.delete("");
  return [...out].map((s) => matchForm(s));
}

/** The MSA basics word(s) a dialect word is, without vowel marks: [{n, word}] (rule 1: must be empty). */
export function basicsClash(word, basics) {
  const k = bare(word);
  return basics.filter((b) => b.key === k);
}

/** The MSA basics word(s) a dialect word is once its regular sound changes are undone (rule 2). */
export function shiftClash(word, basics) {
  const k = bare(word);
  const forms = new Set(msaSpellings(word).filter((s) => s !== k));
  return basics.filter((b) => forms.has(b.key));
}
