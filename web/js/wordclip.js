// How much audio to play for one tapped word (the word popup's "Word" button, and the sound on
// tapping a word in a reel). Transcript word times are often tight, a word's end cut early or its
// start late, so the owner found "Word" clipping words. So the clip gets a little room on each side,
// and it lasts at least as long as the word would take to say, estimated from its spelling, without
// running on into most of the next word. Pure, so it is unit-tested (tests/js/wordclip.test.mjs).

const BEFORE = 0.12;       // seconds played before the word's start
const AFTER = 0.15;        // and after its end
const PER_SYLLABLE = 0.19; // seconds per syllable, at an everyday speaking speed
const BASE = 0.1;
const MIN = 0.35;

const VOWELS = /[aeiouyàáâãäåæèéêëìíîïòóôõöøùúûüýÿœаеёиоуыэюяіїєαεηιουω]+/giu;

/** About how many syllables `word` has, from its letters (no dictionary needed). */
export function syllables(word, lang = "") {
  const w = String(word || "").normalize("NFC");
  const count = (re) => (w.match(re) || []).length;
  const hangul = count(/[가-힣]/g);
  if (hangul) return hangul;                                     // Korean: one block, one syllable
  const han = count(/\p{Script=Han}/gu);
  const kana = count(/[ぁ-ゖァ-ヺ]/g) - count(/[ゃゅょャュョっッ]/g);
  if (han || kana) return Math.max(1, han + kana);               // Chinese characters and kana: about one each
  const deva = count(/[ऄ-हक़-ॡ]/g);
  if (deva) return Math.max(1, deva - count(/्/g));         // Devanagari: each letter less those joined by virama
  const thai = count(/[ก-ฮ]/g);
  if (thai) return Math.max(1, Math.round(thai / 2));            // Thai: about two consonants a syllable
  const arabic = count(/[ء-يٱ-ۓۺ-ۿ]/g);
  if (arabic) {
    // Short vowels are mostly unwritten: about one syllable per two letters, more with long vowels.
    return Math.max(1, Math.round(arabic / 2));
  }
  return Math.max(1, count(VOWELS));                             // Latin and Cyrillic: vowel groups
}

/** Seconds `word` probably takes to say. */
export function estimateSeconds(word, lang = "") {
  return Math.max(MIN, BASE + syllables(word, lang) * PER_SYLLABLE);
}

/**
 * The stretch to play for words i..j: [from, to] in seconds.
 * `starts`, `ends`: every word's times; `texts`: the words; `lang`: their language.
 */
export function wordClip({ starts, ends, texts, i, j = i, lang = "" }) {
  const start = Number(starts[i]) || 0;
  const end = Math.max(start, Number(ends[j]) || start);
  const said = texts.slice(i, j + 1).join(" ");
  const from = Math.max(0, start - BEFORE);
  let to = Math.max(end + AFTER, start + estimateSeconds(said, lang));
  // Never most of the next word: at most a third of it.
  if (j + 1 < starts.length && Number.isFinite(Number(starts[j + 1]))) {
    const nextStart = Number(starts[j + 1]);
    const nextEnd = Math.max(nextStart, Number(ends[j + 1]) || nextStart);
    const cap = Math.max(end + AFTER, nextStart + (nextEnd - nextStart) / 3);
    to = Math.min(to, cap);
  }
  return [from, to];
}
