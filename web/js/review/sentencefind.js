// An example sentence for a saved word, found or written now: the Vocab list's open word ("Sentence"),
// done the way "Add words" does it for new cards (components/wordbuilder.js), with the same helpers:
//   - with the learner's AI set up: a sentence written the way a native speaker would say it, with its
//     translation (addwords.js batchPrompt / readBatch, one word in the request);
//   - with no AI: a real sentence people wrote (Tatoeba, Wiktionary), with its English translation
//     (examples.js freeExample, downloaded once).
// Shared by the desktop app, the phone and the web app; the pure part (the one-word request and reading its
// answer) is review/vocabedit.js sentenceItem / readSentence, tested in tests/js/vocabedit.test.mjs.

import { batchPrompt } from "../addwords.js";
import { freeExample } from "../examples.js";
import { state } from "../app.js";
import { askAi, definerConfig, noAi } from "../define-service.js";
import { aiMakes, chosenSource } from "../helpersource.js";
import { langInfo } from "../languages.js";
import { stripMarks } from "../cardtext.js";
import { readSentence, sentenceItem } from "./vocabedit.js";

const settings = () => (state.status && state.status.settings) || {};
/** Can the AI be used here at all (a key, and AI not switched off)? */
const aiUsable = () => !noAi() && !!definerConfig().key;

/** Does the AI write example sentences here: it can be used, and the learner hasn't chosen Free in
 * Settings → Word definitions (helpersource.js aiMakes)? */
export const aiWrites = () => aiMakes(settings(), "sentence", aiUsable());

/** Did the learner choose Free sentences although the AI could write them? (The Sentence tool then says
 * the AI can write them instead, with the way to that choice.) */
export const freeChosen = () => aiUsable() && chosenSource(settings(), "sentence") === "free";

/** Where in Settings the choice of who makes sentences is. */
export const SENTENCE_SOURCE = "#/settings?s=words&show=sentencesource";

/**
 * A sentence for card `v` in `lang`: {sentence, translation, source, readable, by} or null when none was
 * found. `by` "ai" (written now) or "free" (a real one: `source` is where it is from; `readable` when every
 * other word of it is one the learner has seen). `way`: "ai" or "free" (by default the AI when it is set up,
 * as in "Add words"); `skip`: sentences already shown, for "Another one". Throws the AI's errors as they are.
 */
export async function findSentence(v, lang, { way = aiWrites() ? "ai" : "free", skip = [] } = {}) {
  if (way === "ai") {
    const item = sentenceItem(v);
    const cfg = definerConfig();
    const study = (langInfo(lang) || {}).name || "the language being learned";
    const answer = await askAi(batchPrompt([item], { study, speaks: cfg.language || "English" }));
    const got = readSentence(answer, item, skip);
    return got ? { ...got, source: "", readable: false, by: "ai" } : null;
  }
  const found = await freeExample(String(v.text || "").trim(), lang, { meaning: stripMarks(v.meaning || ""), skip });
  return found ? { ...found, by: "free" } : null;
}
