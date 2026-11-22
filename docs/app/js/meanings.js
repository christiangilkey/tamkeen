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
import { answerFrom, commonestFirst, commonness, findIn, germanLookUp, lookUp, matchKey, keyedTables, respellings, translatedForms, wolffSpelling, wordKeys, cardRepair, alikeIn } from "./lexicon/meaningdata.js";
import { dictionaries } from "./lexicon/seen.js";
import { LemmaTable } from "./lexicon/romance.js";
import { lexemeOf } from "./lexicon/words.js";
import { KoreanWords, koreanKeys } from "./lexicon/korean.js";
import { readFormOf } from "./lexicon/formof.js";

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
      return Promise.all(st.names.map((name) => api(`/lexicon/data/${name}`).then(keyedTables)));
    })().catch((e) => { console.warn("Meanings failed to load", e); return null; })
      .then((d) => { if (!d) loaded.delete(lang); return d; }));
  }
  return loaded.get(lang);
}

/** The language's meanings files when they are all downloaded, else null; never downloads anything.
 * Kept in memory only when a lookup has already loaded them (battles read them once: game/dictwords.js). */
export async function installedMeanings(lang) {
  if (loaded.has(lang)) return loaded.get(lang);
  const st = await meaningsStatus(lang);
  if (!st.installed) return null;
  return Promise.all(st.names.map((name) => api(`/lexicon/data/${name}`).then(keyedTables)));
}

/** Download a language's meanings (and its word tables, which find a word's dictionary form; `tables: false` leaves
 * them, for Ask by voice's own-language dictionary, which only reads the meanings: components/voiceask.js). */
export async function downloadMeanings(lang, { tables = true } = {}) {
  const st = await api("/lexicon/download", { method: "POST", body: { lang, kind: "meanings" } });
  loaded.delete(lang);
  if (!tables) return st;
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

// ---------- Bisaya: Wolff's spelling, for how a word sounds ----------
// The Mnemonic maker reads it to put a Bisaya word's stress where Wolff says (examples.js freePronunciation). His file
// is ~20 MB once read: kept a minute after its last use (the popup's own copy, when it has one, is used instead).
let wolffData = null, wolffDrop = 0;
const WOLFF_KEEP_MS = 60000;
const isWolff = (d) => !!d && /Wolff/.test(d.source || "");
function wolffFile() {
  clearTimeout(wolffDrop);
  wolffDrop = setTimeout(() => { wolffData = null; }, WOLFF_KEEP_MS);
  if (!wolffData) {
    wolffData = (async () => {
      if (loaded.has("ceb")) {
        const mine = ((await loaded.get("ceb")) || []).find(isWolff);
        if (mine) return mine;
      }
      const st = await meaningsStatus("ceb");
      const name = (st.names || []).find((n) => n === "mean-cebw" && st.files && st.files[n] && st.files[n].installed);
      const data = name ? keyedTables(await api(`/lexicon/data/${name}`)) : null;
      return isWolff(data) ? data : null;
    })().catch(() => null).then((d) => { if (!d) wolffData = null; return d; });
  }
  return wolffData;
}

/** Bisaya `text` as Wolff's dictionary writes it, with his marks (hátag, bàbà; meaningdata.js wolffSpelling), chosen
 * by the card's `meaning` where he has two spellings; "" when his file isn't on this device or lacks the word. Never
 * downloads anything. */
export async function wolffReading(text, meaning = "") {
  const data = await wolffFile();
  return data ? wolffSpelling(data, text, meaning) : "";
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

/** The popup's answer for ctx ({word, lang, ...}) from the built-in dictionary. (`seen`: given the entries found, as the
 * dictionary has them, before any meaning is moved or made: formMeaningRepair.) */
export async function dictionaryDefine(ctx, { quick = false, language = "English", seen = null } = {}) {
  const lang = ctx.lang || "ar";
  let files = await load(lang);
  if (!files) throw new DefinerError(NO_MEANINGS);
  // Bisaya: Wolff's dictionary, made from how Bisaya is spoken, is asked first; Wiktionary's Bisaya
  // entries are fewer and lean on English loans (baton "conduct an orchestra" before "have, possess"),
  // and it fills in the newer words Wolff lacks.
  if (lang === "ceb") files = [...files].reverse();
  // Wiktionary first; for Arabic the CAMeL glosses, for Bisaya Wolff's dictionary, when Wiktionary lacks
  // the word (or has it only as a name). (lookUp in ./lexicon/meaningdata.js)
  // German reads the sentence too (separable verbs: fängt … an is anfangen) and takes compounds apart.
  let found;
  if (ctx.phrase) {
    // Several words looked up together: only an entry for the whole phrase as it is ("por favor",
    // "give up"), never one of its words or a guess at a form of it (those would answer another question).
    const key = matchKey(ctx.word, lang);
    for (const data of files) {
      const hit = data && key && data.words[key] && data.words[key].length ? findIn(data, [key]) : null;
      if (hit && hit.groups.length) { found = { ...hit, source: data.source }; break; }
    }
  } else if (lang === "de") {
    let tables = null;
    try { tables = await dictionaries(lang); } catch { /* no table: the meanings file's own forms */ }
    const table = (tables || []).find((t) => t instanceof LemmaTable) || null;
    found = germanLookUp(files, ctx.word, ctx.marked || "", { table });
  } else {
    const { keys, rank } = await candidates(ctx.word, lang);
    found = lookUp(files, keys, ctx.word, lang, { rank });
  }
  // Typed without its accents ("vacio" for vacío): the dictionary's spelling, said in the answer (`spelled`).
  let spelled = "";
  if ((!found || !found.groups.length) && !ctx.phrase) {
    for (const alt of respellings(files, ctx.word, lang)) {
      const keys = lang === "de" ? null : (await candidates(alt, lang)).keys;
      const hit = lang === "de" ? germanLookUp(files, alt, ctx.marked || "", {}) : lookUp(files, keys, alt, lang, {});
      if (hit && hit.groups.length) { found = hit; spelled = alt; break; }
    }
  }
  if ((!found || !found.groups.length) && ctx.phrase) {
    throw new DefinerError("This phrase isn't in the built-in dictionary. Tap its words one at a time to look them up.");
  }
  if (!found || !found.groups.length) {
    throw new DefinerError("This word isn't in the built-in dictionary. It may be a name, slang, or a form it doesn't know.");
  }
  if (seen) seen(found);
  // The everyday meaning first, as Wiktionary's translation tables tell it (meaningdata.js commonestFirst).
  found = commonestFirst(found, files, lang, spelled || ctx.word);
  // A translation, not "active participle of …" or "plural of …" (meaningdata.js translatedForms).
  found = translatedForms(found, files, lang);
  const answer = answerFrom(found, spelled || ctx.word, lang, { quick, language, source: found.source });
  // (which of its meanings are one sense said with two English words: Add words' "Which meaning?" asks nothing for them)
  if (!quick) answer.alike = alikeIn(files, [answer.meaning, ...answer.other_meanings]);
  return spelled ? { ...answer, spelled } : answer;
}

/**
 * A card saved before the built-in dictionary gave translations (meaningdata.js translatedForms), whose meaning is still
 * "active participle of اِبْتَلَّ (ibtalla)": {meaning, notes?} to put it right with, or null to leave it as it is. The
 * owner, 2026-11-20: never a meaning the learner wrote or changed. So only when the card's meaning is, letter for letter,
 * one of the dictionary's own "form-of" lines for the card's word (no one types those, and a meaning changed in any way
 * no longer is one), and the dictionary now has a translation for it. What form it is goes at the end of the card's
 * Grammar notes, unless they say it already. Asks nothing of the network: a dictionary not on the device is no answer.
 * Run when the card is shown in the reviewer and when it is opened to edit (review/formrepair.js).
 */
export async function formMeaningRepair(card, lang) {
  const meaning = String((card && card.meaning) ?? "").trim();
  const word = String((card && card.text) ?? "").trim();
  if (!meaning || !word || !lang || meaning.length > 200 || !readFormOf(meaning, () => true)) return null;
  let raw = null;
  let answer;
  try {
    const st = loaded.has(lang) ? null : await meaningsStatus(lang);
    if (st && !st.installed) return null;
    answer = await dictionaryDefine({ word, lang }, { quick: true, seen: (found) => { raw = found; } });
  } catch { return null; }
  return cardRepair(card, raw, answer);
}
