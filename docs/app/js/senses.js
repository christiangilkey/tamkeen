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

/** A meaning without its notes in brackets, brackets inside brackets too ("dog (the species Canis familiaris (sometimes
 * designated …)), domesticated …" -> "dog, domesticated …"); each note leaves `gap` in its place. */
function unbracketed(text, gap = "") {
  let s = String(text ?? ""), before;
  do { before = s; s = s.replace(/\s*\([^()]*\)|\s*\[[^[\]]*\]/g, gap); } while (s !== before);
  return s;
}

/** A meaning's own words, lower case, a plural or verb ending off: "pile, stack, heap" -> {pile, stack, heap}. */
export function senseWords(text) {
  const out = new Set();
  for (const w of unbracketed(text, " ").toLowerCase().match(/\p{L}[\p{L}'-]*/gu) || []) {
    if (STOP.has(w) || w.length < 2) continue;
    out.add(w.replace(/(?:ies)$/, "y").replace(/(?:ing|ed|es|s)$/, (m, i, s) => (s.length - m.length >= 3 ? "" : m)));
  }
  return out;
}

/** A meaning short enough to choose by: its notes in brackets off, its first few words (at most `max` letters). */
export function shortSense(text, max = 60) {
  const s = unbracketed(text).replace(/\s+/g, " ").replace(/[.;,:\s]+$/, "").trim();
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

/** The English words a meaning is made of, as the meanings files' "same" list keys them (meaningdata.js glossHeads):
 * "to take, catch (a ball)" -> ["take", "catch"]. */
function headsOf(text) {
  const out = [];
  for (const part of unbracketed(text, " ").split(/[;,/]/)) {
    const h = part.trim().toLowerCase().replace(/^(?:to|a|an|the)\s+/, "").replace(/[.!?]+$/, "").trim();
    if (h && h.split(/\s+/).length <= 3) out.push(h);
  }
  return out;
}

/**
 * The senses of a word that really differ, best first: [{text, full, pos}] (text shortened to choose by, full as given), at most `max` (four: more is a dictionary, not a choice). A meaning that
 * shares a word with one already kept is the same sense said again ("school" after "school, academy"; "a while, period
 * of time" after "time"), and meanings that only describe grammar or name a letter are left out. Fewer than two: the
 * word needs no question. `alike`: pairs of English words that are one sense ("enchantment|magic": the dictionary
 * answer's, meanings.js dictionaryDefine, from English Wiktionary's synonyms, tools/add_same_senses.py): two meanings
 * made of such words are one sense too (سحر "magic" and "enchantment" ask nothing).
 */
export function distinctSenses(list, { max = 4, alike = [] } = {}) {
  const same = new Set(Array.isArray(alike) ? alike : []);
  const synonyms = (a, b) => a.some((x) => b.some((y) => x !== y && same.has(x < y ? `${x}|${y}` : `${y}|${x}`)));
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
    const heads = same.size ? headsOf(plain) : [];
    if (kept.some((k) => [...words].some((w) => k.words.has(w)) || (heads.length && synonyms(heads, k.heads)))) continue;
    kept.push({ text: shortSense(plain), full: plain, pos, words, heads });
    if (kept.length >= max) break;
  }
  return kept.map(({ text, full, pos }) => ({ text, full, pos }));
}

/** A dictionary answer's (meanings.js dictionaryDefine) meanings to choose from: distinctSenses of its meaning and
 * other meanings, with its near-synonyms (`alike`) counted as one. */
export const answerSenses = (def) => (def ? distinctSenses(dictionarySenses(def.meaning, def.pos, def.other_meanings), { alike: def.alike }) : []);

/** Does saving `def` ask which meaning the card is for (components/dictpick.js, prototype dict_sense_pick)? Only for the
 * built-in dictionary's answer, with no AI (`ai`: an AI is set up and not turned off), for one word, not a phrase. */
export const asksForSense = (def, { ai = false, phrase = false, word = "" } = {}) =>
  !!def && def.provider === "dictionary" && !ai && !phrase && !!String(word || "").trim() && !!String(def.meaning || "").trim();

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
