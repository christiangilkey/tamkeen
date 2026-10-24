// Looking up several words together: the words a drag covers (components/phrasepick.js does the
// dragging). Pure, so it is unit-tested (tests/js/phrase.test.mjs).
//
// A phrase is always counted in the words' order in the text, never by where they are on screen,
// so right-to-left text (Arabic, Persian) works the same as left-to-right.

import { joinWords } from "./languages.js";
import { EDGE_PUNCT } from "./wordlookup.js";

/** The most words one phrase can have. */
export const PHRASE_MAX = 12;

/**
 * The words from `start` (where the drag began) to `to` (the word under the finger or pointer),
 * either way round, as [first, last] in text order. The phrase stops at the edge of the block
 * `start` is in (`blockOf(i)`: its line or paragraph) and at `max` words, counted from `start`.
 */
export function phraseRange(start, to, { blockOf = null, max = PHRASE_MAX } = {}) {
  start = Math.trunc(Number(start));
  to = Math.trunc(Number(to));
  if (!Number.isFinite(start) || start < 0) return [-1, -1];
  if (!Number.isFinite(to) || to < 0 || to === start) return [start, start];
  const step = to > start ? 1 : -1;
  const limit = Math.max(1, Math.trunc(max) || 1);
  const block = blockOf ? blockOf(start) : null;
  let end = start;
  while (end !== to && Math.abs(end + step - start) < limit) {
    const next = end + step;
    if (blockOf && blockOf(next) !== block) break;
    end = next;
  }
  return step > 0 ? [start, end] : [end, start];
}

/** True when words i..j are more than one word. */
export const isPhrase = (i, j) => Number(j) > Number(i);

/**
 * The text of words i..j as it is looked up and saved: joined the way the language writes it
 * (no spaces in Japanese, Chinese and Thai), without the punctuation at either end.
 */
export function phraseText(texts, i, j, lang) {
  const words = texts.slice(i, j + 1);
  return joinWords(words, lang).replace(EDGE_PUNCT, "") || texts[i] || "";
}
