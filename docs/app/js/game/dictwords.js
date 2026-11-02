// Battles' wrong answers from the built-in dictionary (the owner's choice): each question keeps two
// wrong answers from the learner's own saved words and adds one of the language's 1000 most common
// words with its Wiktionary meaning, when that language's dictionary is downloaded (Settings → Word
// definitions). No AI is asked and nothing is downloaded for it. No screen code: battle-ui.js loads
// the files, and pickQuestion (rules.js) uses the list this makes.

import { matchKey, ordinary } from "../lexicon/meaningdata.js";

// A meaning that only describes grammar ("plural of …", "used to form …") says nothing as a wrong answer.
const GRAMMAR = /\b(?:form|plural|singular|participle|tense|gerund|infinitive|imperative|feminine|masculine|diminutive|superlative|comparative|spelling|abbreviation|contraction|romanization|degree|conditional|name) of\b|\bmarker\b|\bparticle\b|^(?:used|indicates?|denotes?|expresses|marks?)\b|misspelling|:/i;

/** A dictionary meaning cut to the size of a saved word's: labels like "(informal)" off, a note after it
 * off ("law (particular piece of legislation)": "law"), and only the first of several ("tolerable;
 * bearable": "tolerable"). "" when it can't stand as a wrong answer. */
export function shortMeaning(gloss) {
  const s = String(gloss || "")
    .replace(/^(?:\s*(?:\([^)]*\)|\[[^\]]*\]))+\s*/, "")
    .split(";")[0]
    .replace(/\s*\([^)]*\)\s*$/, "")
    .replace(/\.$/, "")
    .trim();
  return s && s.length <= 40 && !GRAMMAR.test(s) ? s : "";
}

/** The wrong answers a dictionary offers: [{word, meaning}] for each of `words` (the language's common
 * words) that has an entry of its own, with its first ordinary meaning. `files` = the language's
 * meanings files (meanings.js), Wiktionary first. */
export function dictionaryChoices(words, files, lang) {
  const out = [];
  const taken = new Set();
  for (const item of words || []) {
    const word = String(item || "").trim();
    const key = word && matchKey(word, lang);
    if (!key || taken.has(key)) continue;
    for (const data of files || []) {
      const groups = ((data && data.words && data.words[key]) || []).filter(ordinary);
      const meaning = groups.flatMap((g) => g[2] || []).map(shortMeaning).find(Boolean);
      if (!meaning) continue;
      taken.add(key);
      out.push({ word, meaning });
      break;
    }
  }
  return out;
}
