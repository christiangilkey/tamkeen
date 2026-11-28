// Pure timing helpers for the transcript player. No DOM access, so they're unit-testable
// (tests/js/wordlookup.test.mjs).

/**
 * Index of the last word whose start <= t, or -1 if t is before the first word.
 * O(log n) binary search over a sorted Float64Array of word start times.
 * @param {Float64Array|number[]} starts
 * @param {number} t
 */
export function findWordIndex(starts, t) {
  let lo = 0;
  let hi = starts.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (starts[mid] <= t) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}

/**
 * The word to highlight at time t: the last started word, as long as we haven't moved
 * past its end by more than `gap` seconds (so long silences clear the highlight).
 */
export function activeWordIndex(starts, ends, t, gap = 1.0) {
  const i = findWordIndex(starts, t);
  if (i < 0) return -1;
  return t <= ends[i] + gap ? i : -1;
}

const TERMINAL = /[.!?؟؛…。！？．।॥]["'»”’)\]」』）】]*$/u; // (। ॥: Hindi's full stops)

/** Punctuation and spaces at either edge of a word ("«hola," → "hola"), in any script. */
export const EDGE_PUNCT = /^[\s\p{P}]+|[\s\p{P}]+$/gu;

/** True if a word ends a sentence (Latin, Arabic, Japanese or Chinese punctuation). */
export function endsSentence(text) {
  return TERMINAL.test(text);
}

/**
 * Word index range [first, last] of the sentence containing words i..j.
 * A sentence ends at terminal punctuation or a Whisper segment boundary.
 * @param {string[]} texts word texts
 * @param {Int32Array|number[]} segs segment index of each word
 */
export function sentenceBounds(texts, segs, i, j = i) {
  const n = texts.length;
  if (n === 0) return [-1, -1];
  i = Math.max(0, Math.min(i, n - 1));
  j = Math.max(i, Math.min(j, n - 1));
  let first = i;
  while (first > 0 && segs[first - 1] === segs[first] && !endsSentence(texts[first - 1])) first--;
  let last = j;
  while (last < n - 1 && segs[last + 1] === segs[last] && !endsSentence(texts[last])) last++;
  return [first, last];
}

// ---------- the sentence a word was heard in (transcripts and captions) ----------
// The owner, 2026-11-27: a word saved from YouTube or a podcast got "only what was currently being displayed", so a
// sentence split over two caption lines was cut short ("incluso puedes tú superar para alcanzar"). A transcript's
// lines (Whisper's segments, a video's caption lines) are not sentences, so a heard word's sentence is looked for
// across them: from the punctuation that ends the sentence before it to the punctuation that ends its own. Captions
// with no punctuation at all (YouTube's automatic ones) are split at the speaker's pauses instead. Either way a
// sentence is at most SENTENCE_MAX words, kept around the word. Books and pages keep sentenceBounds: their lines are
// paragraphs and headings, which a sentence never crosses.

/** The most words a heard sentence has: past this, the words nearest the looked-up word are kept. */
export const SENTENCE_MAX = 30;
/** A pause this long (seconds) between two words of unpunctuated captions ends a sentence. */
export const PAUSE_S = 0.7;
/** A silence this long ends a sentence even where there is punctuation (a new speaker, a new scene). */
export const LONG_PAUSE_S = 2.5;

const OPENS = /^["'«“‘(\[「『（【]*[¿¡]/u;
/** True if a word starts a sentence of its own (Spanish ¿ and ¡). */
export function startsSentence(text) {
  return OPENS.test(text);
}

/** True when the words have sentence punctuation to go by: on average at least one sentence end in 40 words. Captions
 *  written by YouTube's speech recognition usually have none. */
export function isPunctuated(texts) {
  const n = texts.length;
  if (!n) return false;
  let ends = 0;
  for (const t of texts) if (endsSentence(t)) ends++;
  return ends * 40 >= n;
}

/**
 * Word index range [first, last] of the sentence words i..j were heard in, across the transcript's lines.
 * @param {string[]} texts word texts
 * @param {Int32Array|number[]} segs line (segment) of each word: a boundary only for unpunctuated text with no times
 * @param {{starts?: ArrayLike<number>, ends?: ArrayLike<number>, punctuated?: boolean, max?: number, pause?: number}} [opts]
 *   starts/ends: each word's times (for pauses); punctuated: isPunctuated(texts), worked out once by the caller.
 */
export function spokenSentence(texts, segs, i, j = i, opts = {}) {
  const n = texts.length;
  if (n === 0) return [-1, -1];
  const { starts = null, ends = null, max = SENTENCE_MAX, pause = PAUSE_S } = opts;
  const punctuated = opts.punctuated ?? isPunctuated(texts);
  i = Math.max(0, Math.min(i, n - 1));
  j = Math.max(i, Math.min(j, n - 1));
  const timed = !!(starts && ends && starts.length === n && ends.length === n);
  /** Whether a sentence begins at word k (k > 0). */
  const breakBefore = (k) => {
    if (endsSentence(texts[k - 1]) || startsSentence(texts[k])) return true;
    const gap = timed ? Number(starts[k]) - Number(ends[k - 1]) : 0;
    if (gap >= LONG_PAUSE_S) return true;
    if (punctuated) return false;
    return timed ? gap >= pause : segs[k] !== segs[k - 1];
  };
  // (Each way, no further than `max` words: a sentence longer than that is cut down below anyway.)
  let first = i;
  while (first > 0 && i - first < max && !breakBefore(first)) first--;
  let last = j;
  while (last < n - 1 && last - j < max && !breakBefore(last + 1)) last++;
  // Too long: the words nearest the looked-up ones, as many before as after where there are.
  const room = max - (j - i + 1);
  if (last - first + 1 > max) {
    if (room <= 0) return [i, j];
    let before = Math.min(i - first, Math.floor(room / 2));
    const after = Math.min(last - j, room - before);
    before = Math.min(i - first, room - after);
    first = i - before;
    last = j + after;
  }
  return [first, last];
}

/** Format seconds as m:ss or h:mm:ss. */
export function formatTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const s = Math.floor(sec % 60);
  const m = Math.floor((sec / 60) % 60);
  const h = Math.floor(sec / 3600);
  const pad = (x) => String(x).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
