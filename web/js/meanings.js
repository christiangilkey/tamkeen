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
import { answerFrom, commonness, lookUp, matchKey, wordKeys } from "./lexicon/meaningdata.js";
import { dictionaries } from "./lexicon/seen.js";
import { lexemeOf } from "./lexicon/words.js";
import { KoreanWords, koreanKeys } from "./lexicon/korean.js";

export const NO_MEANINGS = "NO_MEANINGS";
export { matchKey };

// ---------- the files ----------
const loaded = new Map(); // lang -> Promise<[data, ...]|null>: the language's files, the one asked first first

export const meaningsStatus = (lang) => api(`/lexicon/status?lang=${lang}&kind=meanings`);

function load(lang) {
  if (!loaded.has(lang)) {
    loaded.set(lang, (async () => {
      let st = await meaningsStatus(lang);
      // Some of the language's files here but not all (a file added in a later version, like Arabic's
      // CAMeL glosses): the rest come without asking again.
      if (!st.installed && Object.values(st.files || {}).some((f) => f.installed)) {
        st = await api("/lexicon/download", { method: "POST", body: { lang, kind: "meanings" } });
      }
      if (!st.installed) return null;
      return Promise.all(st.names.map((name) => api(`/lexicon/data/${name}`)));
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
/** Keys to try for a word, best first, and how common each word of the language's word list is (Bisaya). */
async function candidates(word, lang) {
  let tables = null;
  try { tables = await dictionaries(lang); } catch { /* no tables: spelling only */ }
  // the dictionary form found by the language's own word tables
  const lemmaOf = (form) => { try { const lex = lexemeOf(form, lang, tables); return lex && lex.lemma; } catch { return null; } };
  const list = lang === "ceb" && (tables || []).find((t) => Array.isArray(t && t.lemmas));
  // Korean: the dictionary forms the word can be read as, likeliest first, before the word as written
  // (가요 is first 가다 "go", then 가요 "song"); Wiktionary seldom has a form of a verb as an entry.
  if (lang === "ko") {
    const table = (tables || []).find((t) => t instanceof KoreanWords) || null;
    return { keys: [...new Set(koreanKeys(word, table).map((k) => matchKey(k, lang)))], rank: () => Infinity };
  }
  return { keys: wordKeys(word, lang, lemmaOf), rank: commonness(list ? list.lemmas : null) };
}

/** The popup's answer for ctx ({word, lang, ...}) from the built-in dictionary. */
export async function dictionaryDefine(ctx, { quick = false, language = "English" } = {}) {
  const lang = ctx.lang || "ar";
  let files = await load(lang);
  if (!files) throw new DefinerError(NO_MEANINGS);
  // Bisaya: Wolff's dictionary, made from how Bisaya is spoken, is asked first; Wiktionary's Bisaya
  // entries are fewer and lean on English loans (baton "conduct an orchestra" before "have, possess"),
  // and it fills in the newer words Wolff lacks.
  if (lang === "ceb") files = [...files].reverse();
  // Wiktionary first; for Arabic the CAMeL glosses, for Bisaya Wolff's dictionary, when Wiktionary lacks
  // the word (or has it only as a name). (lookUp in ./lexicon/meaningdata.js)
  const { keys, rank } = await candidates(ctx.word, lang);
  const found = lookUp(files, keys, ctx.word, lang, { rank });
  if (!found || !found.groups.length) {
    throw new DefinerError("This word isn't in the built-in dictionary. It may be a name, slang, or a form it doesn't know.");
  }
  return answerFrom(found, ctx.word, lang, { quick, language, source: found.source });
}
