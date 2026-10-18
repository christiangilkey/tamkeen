// "No AI": word meanings from the built-in dictionary instead of an AI provider (Settings → Word
// definitions). One downloaded file per language (docs/lexicon/<lang>-meanings.json.gz, made by
// tools/build_meanings.py from the English Wiktionary), kept with the other dictionaries
// (/api/lexicon/... with kind=meanings). The answer has the same shape as an AI one (definer.js),
// so the word popup, saving to vocab and the review cards work unchanged; what a dictionary can't
// know (which meaning fits this sentence, a translation of the sentence, a misheard word) stays empty.
//
// Shared by the desktop app, the phone and the web app.

import { api } from "./app.js";
import { DefinerError } from "./definer.js";
import { EDGE_PUNCT } from "./wordlookup.js";
import { answerFrom, arabicVariants, findIn, matchKey } from "./lexicon/meaningdata.js";
import { dictionaries } from "./lexicon/seen.js";
import { lexemeOf } from "./lexicon/words.js";

export const NO_MEANINGS = "NO_MEANINGS";
export { matchKey };

// ---------- the files ----------
const loaded = new Map(); // lang -> Promise<data|null>

export const meaningsStatus = (lang) => api(`/lexicon/status?lang=${lang}&kind=meanings`);

function load(lang) {
  if (!loaded.has(lang)) {
    loaded.set(lang, (async () => {
      const st = await meaningsStatus(lang);
      if (!st.installed) return null;
      return api(`/lexicon/data/mean-${lang}`);
    })().catch((e) => { console.warn("Meanings failed to load", e); return null; })
      .then((d) => { if (!d) loaded.delete(lang); return d; }));
  }
  return loaded.get(lang);
}

/** Download a language's meanings (and its word tables, which find a word's dictionary form). */
export async function downloadMeanings(lang) {
  const st = await api("/lexicon/download", { method: "POST", body: { lang, kind: "meanings" } });
  loaded.delete(lang);
  try {
    const { downloadDictionaries, lexiconStatus } = await import("./lexicon/seen.js");
    const words = await lexiconStatus(lang);
    if (words.needed && !words.installed) await downloadDictionaries(lang);
  } catch { /* the meanings still work, matched by spelling */ }
  return st;
}

export async function removeMeanings(lang) {
  loaded.delete(lang);
  return api("/lexicon/remove", { method: "POST", body: { lang, kind: "meanings" } });
}

// ---------- finding a word ----------
/** Keys to try for a word, best first. */
async function candidates(word, lang) {
  const bare = String(word || "").replace(EDGE_PUNCT, "").trim();
  const keys = [matchKey(bare, lang)];
  if (lang !== "ja" && lang !== "zh" && bare.includes(" ")) return keys; // a phrase: as a whole only
  try { // the dictionary form found by the language's own word tables
    const lex = lexemeOf(bare, lang, await dictionaries(lang));
    if (lex && lex.lemma) keys.push(matchKey(lex.lemma, lang));
  } catch { /* no tables: spelling only */ }
  if (lang === "ar") keys.push(...arabicVariants(keys[0]));
  return [...new Set(keys.filter(Boolean))];
}

/** The popup's answer for ctx ({word, lang, ...}) from the built-in dictionary. */
export async function dictionaryDefine(ctx, { quick = false, language = "English" } = {}) {
  const lang = ctx.lang || "ar";
  const data = await load(lang);
  if (!data) throw new DefinerError(NO_MEANINGS);
  const found = findIn(data, await candidates(ctx.word, lang));
  if (!found || !found.groups.length) {
    throw new DefinerError("This word isn't in the built-in dictionary. It may be a name, slang, or a form it doesn't know.");
  }
  return answerFrom(found, ctx.word, lang, { quick, language });
}
