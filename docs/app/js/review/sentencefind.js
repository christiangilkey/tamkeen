// An example sentence for a saved word, found or written now: the Vocab list's open word ("Sentence"),
// done the way "Add words" does it for new cards (components/wordbuilder.js), with the same helpers:
//   - with the learner's AI set up: a sentence written the way a native speaker would say it, with its
//     translation (addwords.js batchPrompt / readBatch, one word in the request);
//   - with no AI: real sentences people wrote: first from the learner's own library (the book or episode the word
//     came from, then their other transcripts, books and pages: review/librarysentence.js, through `/search`), then
//     Tatoeba, Wiktionary and the courses, with an English translation (examples.js freeExamples, downloaded once).
//     A phrase found nowhere whole gives sentences with its main word. The learner steps through them all.
// Shared by the desktop app, the phone and the web app; the pure part (the one-word request and reading its
// answer) is review/vocabedit.js sentenceItem / readSentence, tested in tests/js/vocabedit.test.mjs.

import { batchPrompt } from "../addwords.js";
import { freeExamples } from "../examples.js";
import { api, state } from "../app.js";
import { askAi, definerConfig, noAi } from "../define-service.js";
import { aiMakes, chosenSource } from "../helpersource.js";
import { langInfo } from "../languages.js";
import { stripMarks } from "../cardtext.js";
import { readSentence, sentenceItem } from "./vocabedit.js";
import { librarySentences, mergeFinds, searchQueries } from "./librarysentence.js";

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
  const [first] = await findSentences(v, lang, { skip });
  return first || null;
}

/**
 * Every real sentence found for card `v` in `lang` with no AI, in the order the learner steps through them
 * (librarysentence.js mergeFinds): [{sentence, translation, source, title, own, main, readable, by: "free"}].
 * `source` "library" (`title` the book or episode, `own` when it is the card's own) or the examples file's
 * (exampledata.js sourceOf). Throws the examples file's NO_EXAMPLES only when nothing at all was found.
 */
export async function findSentences(v, lang, { skip = [] } = {}) {
  const word = String(v.text || "").trim();
  if (!word) return [];
  const [library, file] = await Promise.all([
    fromLibrary(v, lang, skip),
    freeExamples(word, lang, { meaning: stripMarks(v.meaning || ""), skip, count: 6 }).then((list) => ({ list }), (error) => ({ list: [], error })),
  ]);
  const all = mergeFinds(library, file.list, lang).map((x) => ({ ...x, by: "free" }));
  if (!all.length && file.error) throw file.error;
  return all;
}

/** One sentence with card `v`'s word or phrase (the whole of it) from the learner's own library, or null: "Add words"
 * takes it when the examples file has none for a word (components/wordbuilder.js). It has no translation. */
export async function librarySentence(v, lang) {
  const found = (await fromLibrary(v, lang, [])).filter((x) => !x.main);
  return found[0] || null;
}

/** Sentences with card `v`'s word or phrase in the learner's library (`/search`: the same route on the computer,
 * the phone and the web app); none when the search fails. */
async function fromLibrary(v, lang, skip) {
  const hits = [];
  for (const q of searchQueries(v.text, lang)) {
    try {
      const got = await api(`/search?q=${encodeURIComponent(q)}&limit=120`);
      hits.push(...((got && got.results) || []));
    } catch { /* no library search here: the examples file still has its say */ }
    // (the whole phrase found plenty: no need for the main word's many lines too)
    if (hits.length >= 20) break;
  }
  return librarySentences(hits, v, lang, { skip });
}
