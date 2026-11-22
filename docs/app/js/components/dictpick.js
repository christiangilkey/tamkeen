// Saving a looked-up word (prototype dict_sense_pick, released): a word whose meanings really differ asks which one the
// card is for, before the card is made (the dictionary's answer is its everyday meaning, not the one that fits the
// sentence; an AI's answer fits the sentence and is chosen to start with). The same "Which meaning?" box as Add words
// (components/sensechoice.js). The owner, 2026-11-21: "When saving words that have multiple definitions without an AI
// key, allow the user to select what definition the word uses", and later the same with an AI key.
//
// Every place a looked-up word is saved goes through here: the word popup's Save (transcripts and captions, reels,
// books, web pages, course words, Conversation: components/wordbubble.js) and Ask by voice's "add it"
// (components/voiceask.js). Add words asks on its own screen already. Shared by the desktop app, the phone and the web
// app.

import { feature } from "../prototype.js";
import { dictionaryDefine } from "../meanings.js";
import { answerSenses, asksForSense, dictionarySenses, distinctSenses, glossFor, plainMeaning } from "../senses.js";
import { chooseSenses } from "./sensechoice.js";

/**
 * `def` (the popup's answer) as the card is to be saved: the same answer, or with the meaning the learner chose, or null
 * when they closed the box (nothing is saved). `ctx` is what was looked up ({word, lang, marked, phrase}). For one word
 * (not a phrase) whose meanings really differ, AI or not, as Add words asks (the owner, 2026-11-21: "from the pop-up,
 * it doesn't seem like it's asking me"; until then it asked only with no AI).
 */
export async function pickDictionaryMeaning(def, ctx) {
  const senses = await meaningSenses(def, ctx);
  if (senses.length < 2) return def;
  const chosen = await chooseSenses([{ word: def.vocalized || def.spelled || ctx.word, senses }], { lang: ctx.lang || "" });
  if (!chosen) return null;
  const meaning = String(chosen[0] || "").trim();
  const gloss = chosen.glosses ? chosen.glosses[0] : "";
  return meaning && meaning !== def.meaning ? { ...def, meaning, ...(gloss ? { save_gloss: gloss } : {}) } : def;
}

/**
 * The meanings of `def`'s word that really differ (senses.js distinctSenses, as Add words lists them), the one shown
 * first: the word popup's bubbles (components/wordbubble.js) and "Which meaning?" above. A dictionary answer: its own
 * meanings (the quick answer's whole list, from the dictionary already here). An AI's answer: its meaning for this
 * sentence first, then its other meanings and the built-in dictionary's (when it is on this device). [] for a phrase.
 */
export async function meaningSenses(def, ctx) {
  if (!feature("dict_sense_pick")) return [];
  if (!asksForSense(def, { phrase: !!(ctx && ctx.phrase), word: ctx && ctx.word })) return [];
  const look = () => dictionaryDefine({ ...ctx, word: def.spelled || ctx.word }, { quick: false });
  let senses;
  if (def.provider === "dictionary") {
    // (the quick popup's answer has its first meaning only: the whole of it, from the dictionary already here)
    let full = def;
    if (def.quick || !Array.isArray(def.other_meanings) || !Array.isArray(def.alike)) {
      try { full = await look(); } catch { full = def; }
    }
    senses = answerSenses(full);
  } else {
    // An AI's answer: its meaning is the one that fits the sentence, so it is first (chosen to start with); its other
    // meanings and the built-in dictionary's (when it is on this device) follow, near-synonyms counted as one.
    let dict = null;
    try { dict = await look(); } catch { dict = null; }
    const more = dict && typeof dict.meaning === "string" ? [dict.meaning, ...(dict.other_meanings || [])] : [];
    senses = distinctSenses(dictionarySenses(def.meaning, def.pos, [...(def.other_meanings || []), ...more]), { alike: dict && dict.alike });
  }
  return senses;
}

/** `def` with sense `s` (one of meaningSenses) as the card's meaning: short (plainMeaning), its fuller wording kept for
 * the card's notes (save_gloss, languages.js vocabFromDefinition). With no sense, a dictionary answer's own meaning is
 * made short the same way. */
export function withSense(def, s) {
  if (!def) return def;
  const list = s ? [s] : def.provider === "dictionary" ? [{ text: def.meaning, full: def.meaning }] : [];
  if (!list.length) return def;
  const meaning = plainMeaning(list[0].full || list[0].text), gloss = glossFor(list, 0);
  return meaning === def.meaning && !gloss ? def : { ...def, meaning, ...(gloss ? { save_gloss: gloss } : {}) };
}
