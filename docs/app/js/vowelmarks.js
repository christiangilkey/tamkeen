// Arabic vowel marks: which form of each word to draw (see vowels.js). No app state here, so the
// tests can run it. Shared by the desktop app and the phone.

const MARKS = /[ً-ْٰ]/g;

/** A word without its vowel marks. */
export const bare = (s) => String(s || "").replace(MARKS, "");

/**
 * The words to draw. `texts` are the words, `vowels` the transcript's vowels ({ words, dialect,
 * guess } or null), `segOf(i)` the line word i is in. `show`: "Show vowels" is on; `dialect`: also
 * on dialect speech. Returns `texts` itself when nothing changes.
 */
export function chooseWords(texts, vowels, segOf, { show = false, dialect = false } = {}) {
  if (!show || !vowels || !Array.isArray(vowels.words) || vowels.words.length !== texts.length) return texts;
  // The model learned Standard Arabic: a dialect transcript, or a line with a dialect word in it,
  // gets vowels that are only a guess.
  if (!dialect && vowels.dialect) return texts;
  const guesses = dialect ? null : new Set(vowels.guess || []);
  return texts.map((t, i) => {
    const v = vowels.words[i];
    // A word changed since (a correction) keeps its own spelling.
    if (!v || bare(v) !== bare(t)) return t;
    return guesses && guesses.has(segOf(i)) ? t : v;
  });
}
