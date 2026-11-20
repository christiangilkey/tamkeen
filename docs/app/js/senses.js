// Add words → "Which meaning?" (prototype sense_choice; components/sensechoice.js): a word with several meanings
// that really differ asks the learner which one the card is for, before it is saved. The owner, 2026-11-19: "If a
// student is inputting a word with multiple definitions, ask them what definition they'd like to use."
//
// This file is what needs no screen: telling real senses from near-synonyms of one sense, and what the card's
// meaning becomes for each choice. Shared by the desktop app, the phone and the web app (tests/js/senses.test.mjs).

// Meanings that say nothing a card can use: a letter's name, a pointer elsewhere, a grammar note.
const NOT_A_SENSE = /\bname of the\b.*\bletter\b|^(?:the )?letter\b|^(?:an? )?(?:alternative|obsolete|archaic|dated|rare|misspelling)\b.*\b(?:form|spelling) of\b|^(?:abbreviation|initialism|acronym|contraction) of\b|^used other than\b|^see\b|^only used in\b/i;
const GRAMMAR = /^(?:used|forms?|makes?|marks?|denotes?|indicates?|expresses|precedes|introduces)\b|\b(?:form|plural|singular|participle|tense|gerund|infinitive|imperative|feminine|masculine) of\b/i;
// Words that say nothing about which sense it is ("to be able to", "a kind of thing").
const STOP = new Set(("a an the to of in on at by for from with into onto out up down off over as and or but not no is are be "
  + "being been am was were it its this that these those which who whom what something someone somebody one ones thing things "
  + "kind sort type way part etc very much more most some any all each other such used use also oneself himself herself "
  + "itself themselves person people").split(" "));
const POS = new Set(["noun", "verb", "adj", "adv", "pron", "det", "prep", "conj", "intj", "particle", "phrase", "num", "name",
  "article", "postp", "prefix", "suffix", "affix", "counter", "classifier", "character", "contraction", "proverb"]);

/** A meaning's own words, lower case, a plural or verb ending off: "pile, stack, heap" -> {pile, stack, heap}. */
export function senseWords(text) {
  const out = new Set();
  for (const w of String(text ?? "").replace(/\([^)]*\)|\[[^\]]*\]/g, " ").toLowerCase().match(/\p{L}[\p{L}'-]*/gu) || []) {
    if (STOP.has(w) || w.length < 2) continue;
    out.add(w.replace(/(?:ies)$/, "y").replace(/(?:ing|ed|es|s)$/, (m, i, s) => (s.length - m.length >= 3 ? "" : m)));
  }
  return out;
}

/** A meaning short enough to choose by: its notes in brackets off, its first few words (at most `max` letters). */
export function shortSense(text, max = 60) {
  const s = String(text ?? "").replace(/\s*\([^)]*\)|\s*\[[^\]]*\]/g, "").replace(/\s+/g, " ").replace(/[.;,:\s]+$/, "").trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const at = Math.max(cut.lastIndexOf(";"), cut.lastIndexOf(","));
  return (at >= 15 ? cut.slice(0, at) : cut.replace(/\s+\S*$/, "")).trim() + "…";
}

/**
 * A dictionary answer's meanings as senses: [{text, pos}], the first meaning first. `meaning` and `pos` are the answer's
 * own (meanings.js dictionaryDefine), `others` its other_meanings, where a meaning of another part of speech ends in it
 * ("to marry (verb)").
 */
export function dictionarySenses(meaning, pos = "", others = []) {
  const out = [{ text: String(meaning ?? ""), pos: String(pos ?? "") }];
  for (const m of others || []) {
    const s = String(m ?? "");
    const tail = /\s*\(([a-z ]+)\)\s*$/.exec(s);
    if (tail && POS.has(tail[1].trim())) out.push({ text: s.slice(0, tail.index), pos: tail[1].trim() });
    else out.push({ text: s, pos: String(pos ?? "") });
  }
  return out.filter((x) => x.text.trim());
}

/**
 * The senses of a word that really differ, best first: [{text, full, pos}] (text shortened to choose by, full as given), at most `max` (four: more is a dictionary, not a choice). A meaning that
 * shares a word with one already kept is the same sense said again ("school" after "school, academy"; "a while, period
 * of time" after "time"), and meanings that only describe grammar or name a letter are left out. Fewer than two: the
 * word needs no question.
 */
export function distinctSenses(list, { max = 4 } = {}) {
  const kept = [];
  for (const item of list || []) {
    const text = typeof item === "string" ? item : String((item && item.text) || "");
    const pos = typeof item === "string" ? "" : String((item && item.pos) || "");
    const plain = text.replace(/^\s*\([^)]*\)\s*/, "").trim();
    if (!plain || NOT_A_SENSE.test(plain) || GRAMMAR.test(plain) || pos === "name") continue;  // (a name is no sense of the word)
    // (a meaning made only of little words, "of" or "from", is told apart by those words themselves)
    let words = senseWords(plain);
    if (!words.size) words = new Set(plain.toLowerCase().match(/\p{L}+/gu) || []);
    if (!words.size) continue;
    if (kept.some((k) => [...words].some((w) => k.words.has(w)))) continue;
    kept.push({ text: shortSense(plain), full: plain, pos, words });
    if (kept.length >= max) break;
  }
  return kept.map(({ text, full, pos }) => ({ text, full, pos }));
}

/** Show the part of speech beside each sense only when they differ ("bank (noun)" and "to bank (verb)"). */
export const showPos = (senses) => new Set((senses || []).map((s) => s.pos || "")).size > 1;

/** The card's meaning for a choice: one sense's text, "all" (every sense, ";"-joined, the first first), or the
 * learner's own words. */
export function meaningFor(senses, choice, own = "") {
  if (choice === "own") return String(own ?? "").trim();
  if (choice === "all") return (senses || []).map((s) => s.text).join("; ");
  const i = Number(choice);
  // (one sense: its whole wording, as the dictionary or the AI gave it; the list shows it shortened)
  return Number.isInteger(i) && senses && senses[i] ? senses[i].full || senses[i].text : "";
}

/** The senses the AI listed for a word (addwords.js readBatch `senses`), tidied: short, distinct, at most four. */
export function aiSenses(list) {
  return distinctSenses((Array.isArray(list) ? list : []).map((s) => {
    const str = String(s ?? "").trim();
    const tail = /\s*\(([a-z ]+)\)\s*$/.exec(str);
    return tail && POS.has(tail[1].trim()) ? { text: str.slice(0, tail.index), pos: tail[1].trim() } : { text: str, pos: "" };
  }));
}
