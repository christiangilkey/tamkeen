// Misheard words: the pure parts (no page, no app imports), unit-tested in
// tests/js/correction.test.mjs. When a word lookup says the tapped word was misheard (the answer's
// `correction`, see definer.js), the transcript's words are changed in place: these work out the
// new words and the line's new text. app/corrections.py does the same on the computer's server.

import { EDGE_PUNCT } from "./wordlookup.js";

const LEAD = /^[\s\p{P}]+/u;
const TRAIL = /[\s\p{P}]+$/u;

/**
 * The words that replace `tokens` (the transcript's words first..last, as stored) when `correction`
 * is what was really said. Each word keeps its own punctuation ("؟", "," ...). Word for word when
 * the counts match; a single word may become a short phrase (kept as one word, spaces and all).
 * Null when it can't be done safely or changes nothing.
 */
export function planCorrection(tokens, correction) {
  const old = (tokens || []).map(String);
  const fix = String(correction ?? "").replace(EDGE_PUNCT, "").replace(/\s+/g, " ").trim();
  if (!old.length || !fix) return null;
  const parts = fix.split(" ");
  const wrap = (token, word) => {
    const lead = (token.match(LEAD) || [""])[0];
    const trail = token.length > lead.length ? (token.match(TRAIL) || [""])[0] : "";
    return `${lead}${word}${trail}`;
  };
  let next;
  if (parts.length === old.length) next = old.map((t, k) => wrap(t, parts[k]));
  else if (old.length === 1) next = [wrap(old[0], fix)];
  else return null;
  return next.some((t, k) => t !== old[k]) ? next : null;
}

/**
 * A line's text after some of its words changed. `oldWords` and `newWords` are the line's words
 * before and after (same count). Each word is found in the line in order and only the changed
 * ones are replaced, so the line's own spacing and punctuation stay; if the words can't all be
 * found, the line is rebuilt from the new words.
 */
export function replaceInText(text, oldWords, newWords) {
  const line = String(text ?? "");
  const spans = [];
  let at = 0;
  for (const word of oldWords) {
    const pos = line.indexOf(word, at);
    if (pos < 0) return newWords.join(" ");
    spans.push([pos, pos + word.length]);
    at = pos + word.length;
  }
  let out = line;
  for (let k = spans.length - 1; k >= 0; k--) {
    if (oldWords[k] !== newWords[k]) out = out.slice(0, spans[k][0]) + newWords[k] + out.slice(spans[k][1]);
  }
  return out;
}
