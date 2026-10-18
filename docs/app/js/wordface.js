// How one word of a transcript, page or reel is drawn: the single place the players ask.
//
// Japanese and Chinese may carry readings over the word (furigana, pinyin: lexicon/readings.js),
// drawn without adding text to the element, so its text stays the word (and vowels.js's
// paintWords leaves it alone). Arabic with vowels arrives already vowelled (vowels.js
// displayWords). Lookups and seen words keep using the original words (the players' `texts`).
// Shared by the desktop app and the phone.

import { esc } from "./app.js";
import { readingHtml } from "./lexicon/readings.js";

/** HTML for the word `text` (as it is to be shown) of language `lang`. */
export function wordHtml(text, lang) {
  if (lang === "ja" || lang === "zh") return readingHtml(text, lang);
  return esc(text);
}
