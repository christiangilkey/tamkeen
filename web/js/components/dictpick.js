// Saving a word with no AI (prototype dict_sense_pick): the built-in dictionary's answer is its everyday meaning, not
// the one that fits the sentence, so a word whose meanings really differ asks which one the card is for, before the card
// is made (the same "Which meaning?" box as Add words: components/sensechoice.js). The owner, 2026-11-21: "When saving
// words that have multiple definitions without an AI key, allow the user to select what definition the word uses".
//
// Every place a looked-up word is saved goes through here: the word popup's Save (transcripts and captions, reels,
// books, web pages, course words, Conversation: components/wordbubble.js) and Ask by voice's "add it"
// (components/voiceask.js). Add words asks on its own screen already. Shared by the desktop app, the phone and the web
// app (the phone's own define-service.js has definerConfig and noAi too).

import { feature } from "../prototype.js";
import { definerConfig, noAi } from "../define-service.js";
import { dictionaryDefine } from "../meanings.js";
import { answerSenses, asksForSense } from "../senses.js";
import { chooseSenses } from "./sensechoice.js";

/**
 * `def` (the popup's answer) as the card is to be saved: the same answer, or with the meaning the learner chose, or null
 * when they closed the box (nothing is saved). `ctx` is what was looked up ({word, lang, marked, phrase}). Only with no
 * AI (No AI chosen, or no key), for a dictionary answer of one word with two or more meanings that really differ.
 */
export async function pickDictionaryMeaning(def, ctx) {
  if (!feature("dict_sense_pick")) return def;
  let ai = false;
  try { ai = !noAi() && !!definerConfig().key; } catch { /* no settings yet: no AI */ }
  if (!asksForSense(def, { ai, phrase: !!(ctx && ctx.phrase), word: ctx && ctx.word })) return def;
  // (the quick popup's answer has its first meaning only: the whole of it, from the dictionary already here)
  let full = def;
  if (def.quick || !Array.isArray(def.other_meanings) || !Array.isArray(def.alike)) {
    try { full = await dictionaryDefine({ ...ctx, word: def.spelled || ctx.word }, { quick: false }); } catch { full = def; }
  }
  const senses = answerSenses(full);
  if (senses.length < 2) return def;
  const chosen = await chooseSenses([{ word: def.vocalized || def.spelled || ctx.word, senses }], { lang: ctx.lang || "" });
  if (!chosen) return null;
  const meaning = String(chosen[0] || "").trim();
  return meaning && meaning !== def.meaning ? { ...def, meaning } : def;
}
