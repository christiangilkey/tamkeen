// Card helpers that need no AI key: an example sentence for a word ("Add words") and the free Mnemonic
// maker's English keywords (the review card, and "Add words" too). Their files are downloaded the first
// time they are needed, like the other dictionaries (kind "examples": docs/lexicon/<lang>-examples.json.gz;
// kind "keywords": en-keywords.json.gz; tools/build_examples.py), and then work with no connection.
//
// Shared by the desktop app, the phone and the web app.

import { api } from "./app.js";
import { t } from "./i18n.js";
import { ExamplePack, markTranslation, plainWord } from "./lexicon/exampledata.js";
import { dictionaries, newWordCounter } from "./lexicon/seen.js";
import { lexemeOf } from "./lexicon/words.js";
import { pronunciationOf } from "./review/soundout.js";
import { soundCore } from "./review/wordcore.js";
import { matchKey } from "./lexicon/meaningdata.js";
import { wolffReading } from "./meanings.js";
import { KeywordList, makeFreeMnemonics } from "./review/freemnemonic.js";
import { judgeOwn } from "./review/ownmnemonic.js";
import { englishSounds } from "./review/mnemonic.js";

const loaded = new Map(); // "examples|es", "keywords|en" -> Promise of the file's data, or null

/** A file of `kind` for `lang`: downloaded when it isn't here yet (unless `download` is false), then read.
 * Resolves to its data, or null (no connection, not published). */
function pack(kind, lang, { download = true } = {}) {
  const id = `${kind}|${lang}`;
  if (!loaded.has(id)) {
    loaded.set(id, (async () => {
      let st = await api(`/lexicon/status?lang=${lang}&kind=${kind}`);
      if (!st.needed) return null;
      if (!st.installed) {
        if (!download) return null;
        st = await api("/lexicon/download", { method: "POST", body: { lang, kind } });
      }
      if (!st.installed) return null;
      return api(`/lexicon/data/${st.names[0]}`);
    })().catch((e) => { console.warn(`The ${kind} file for ${lang} couldn't be had`, e); return null; })
      .then((d) => { if (!d) loaded.delete(id); return d; }));
  }
  return loaded.get(id);
}

const packs = new Map(); // lang -> ExamplePack
/** The language's examples, read once: an ExamplePack, or null. */
export async function examplesOf(lang, opts) {
  if (packs.has(lang)) return packs.get(lang);
  const data = await pack("examples", lang, opts);
  if (!data) return null;
  const p = new ExamplePack(data, lang);
  packs.set(lang, p);
  return p;
}

// App languages with keyword lists of their own (tools/build_examples.py OWN_KEYWORDS).
export const OWN_KEYWORDS = new Set(["es", "fr", "de", "it", "pt", "ru", "ca"]);
const keywordLists = new Map(); // lang -> KeywordList
/** The free Mnemonic maker's words in `lang` (English by default): a KeywordList, or null. An app language's
 * list gets the English one attached, for its ties to the meaning (without it, it works without ties). */
export async function keywordsList(opts, lang = "en") {
  if (keywordLists.has(lang)) return keywordLists.get(lang);
  const [data, english] = await Promise.all([pack("keywords", lang, opts), lang === "en" ? null : keywordsList(opts).catch(() => null)]);
  if (!data) return null;
  const list = new KeywordList(data, english);
  keywordLists.set(lang, list);
  return list;
}

/** Arabic: the dialect course chosen in Library → Courses on this device (coursedata.js, localStorage
 * `courseVariety:ar`: "egy", "lev", "glf", "mor", "irq"), "" for Standard Arabic or another language. */
export function courseDialect(lang) {
  if (lang !== "ar") return "";
  try { return localStorage.getItem("courseVariety:ar") || ""; } catch { return ""; }
}

/** What the examples file needs downloading for `lang`: {needed, installed, bytes}. */
export const examplesStatus = (lang) => api(`/lexicon/status?lang=${lang}&kind=examples`);

// A word's dictionary form, when the language's word tables are on this device (never downloads them).
async function lemmaFinder(lang) {
  let tables = null;
  try { tables = await dictionaries(lang); } catch { /* none: words are matched as written */ }
  if (!tables) return null;
  return (form) => { const lex = lexemeOf(form, lang, tables); return lex && lex.lemma; };
}

/** Thrown by freeExample when the language has sentences but they couldn't be had (no connection the first time):
 * not the same as none found. */
export const NO_EXAMPLES = "NO_EXAMPLES";

/**
 * An example sentence for `word` with no AI: {sentence, translation, source} or null when the file has
 * none. `meaning` puts ⟦ ⟧ round the word in the translation; `dialect` prefers an Arabic dialect's.
 * Throws an Error with `code` NO_EXAMPLES (and a message for the learner) when the file couldn't be downloaded.
 */
export async function freeExample(word, lang, { meaning = "", dialect = courseDialect(lang), skip = [] } = {}) {
  const p = await examplesOf(lang);
  if (!p) {
    // (a language with no sentences file, English: none found; one with a file that couldn't be had: say so)
    const st = await examplesStatus(lang).catch(() => null);
    if (st && !st.needed) return null;
    const e = new Error(t("The example sentences couldn't be downloaded. Check your connection and try again."));
    e.code = NO_EXAMPLES;
    throw e;
  }
  word = plainWord(word);
  const [lemmaOf, counter] = await Promise.all([lemmaFinder(lang), newWordCounter(lang, word).catch(() => null)]);
  // (a phrase's own words aren't new words of its sentence: "por favor" in "Pásame la sal, por favor.")
  const own = counter ? counter(word) : 0;
  const newWords = counter && ((s) => Math.max(0, counter(s) - own));
  // The word without what is typed round it counts too: "der Teil, -e" finds sentences with Teil, "مشكلة ج مشاكل" with مشكلة.
  const core = soundCore(word, lang, { isWord: knowsWord(p, lang) }).core;
  const found = p.find(word, { lemmaOf, dialect, meaning, newWords, core, count: 1 + skip.length }).filter((x) => !skip.includes(x.text));
  if (!found.length) return null;
  const best = found[0];
  // readable: every other word of the sentence is one the learner has seen (only told when that is known)
  return { sentence: best.text, translation: markTranslation(best.english, meaning), source: best.source, readable: best.newWords === 0 };
}

/**
 * How `word` is said, with no AI (review/soundout.js), using Wiktionary's IPA from the examples file when
 * it has the word and `reading` (what the app's dictionaries know: kana, pinyin, vowel marks) otherwise; for Bisaya
 * that is Wolff's spelling, looked up here (meanings.js wolffReading, never downloaded).
 * `download` false: the examples file only when it is here already (else the spelling rules).
 */
export async function freePronunciation(word, lang, reading = "", meaning = "", dialect = courseDialect(lang), { download = true, core = null } = {}) {
  const p = await examplesOf(lang, { download }).catch(() => null);
  // Only the word's own part is matched: الكتاب is said kitaab here, "der Hund, -e" Hund (review/wordcore.js). The
  // result says what was left out (`core`); `core` given = worked out already (wordCoreOf).
  const c = core || soundCore(word, lang, { isWord: knowsWord(p, lang), reading });
  const ipa = p ? p.ipaOf(c.core, { verb: /^\s*to\s/i.test(meaning), dialect }) : "";
  // Bisaya with no IPA from Wiktionary: Wolff's spelling (his dictionary, when it is on this device) is the reading, and
  // says where the stress goes (palit is palít, hatag hátag: review/soundout.js reads a Bisaya reading as his).
  let said = c.reading;
  if (lang === "ceb" && !ipa && !said) said = await wolffReading(c.core, meaning).catch(() => "");
  const pron = pronunciationOf({ word: c.core, lang, ipa, reading: said });
  return pron && { ...pron, core: c };
}

/** wordcore.js's `isWord` from the language's examples file: is `form` one of Wiktionary's words there? (Its plain
 * entries: not the Arabic analyser, which takes و and ال off any word and so says yes to all.) */
function knowsWord(p, lang) {
  if (!p) return null;
  return (form) => {
    const k = matchKey(form, lang);
    return !!(k && (p.ipa[k] || (p.words[k] && p.words[k].length)));
  };
}

/**
 * The part of card word `word` the Mnemonic maker matches, and what is left out (review/wordcore.js soundCore:
 * الكتاب -> كتاب "al- left out"), with the examples file as its word list when it is on this device (or `download`).
 */
export async function wordCoreOf(word, lang, reading = "", { download = false } = {}) {
  const p = await examplesOf(lang, { download }).catch(() => null);
  return soundCore(word, lang, { isWord: knowsWord(p, lang), reading });
}

/**
 * The sound check for the learner's own mnemonics (review/ownmnemonic.js): which of `keywords` (newCapitals')
 * really sound like card `v`'s word. Only with what is on this device already: nothing is downloaded, and
 * without a connection it works the same. Resolves to judgeOwn's answer, or null (the word's sounds unknown).
 */
export async function checkOwnKeywords(v, lang, keywords, { reading = "", speaks = "en" } = {}) {
  const here = { download: false };
  const own = speaks !== "en" && speaks !== lang && OWN_KEYWORDS.has(speaks);
  const [pron, ownList, englishList, table] = await Promise.all([
    freePronunciation(v.text, lang, reading, v.meaning, courseDialect(lang), here).catch(() => null),
    own ? keywordsList(here, speaks).catch(() => null) : null,
    keywordsList(here).catch(() => null),
    // (the English word table, its CMU pronunciations, when this device has it: the AI's maker downloads it)
    dictionaries("en").then((ds) => (ds || []).find((d) => d && d.ipa) || null, () => null),
  ]);
  return judgeOwn(v, pron, keywords, { lists: [ownList, englishList].filter(Boolean), english: table ? englishSounds(table) : null });
}

/**
 * The free Mnemonic maker: keywords for card `v` ({text, meaning, pos, memo}) the way mnemonic.js
 * makeMnemonics gives them (with `free: true`). Throws "NO_KEYWORDS" when the English keyword list can't
 * be had (no connection the first time). `prefs` is what it learned (the setting `mnemonic_prefs`); `ownWords`
 * false leaves out the sound-alikes the learner wrote themselves ("Learn from my own mnemonics" off).
 */
export async function freeMnemonics(v, lang, { reading = "", avoid = [], speaks = "en", prefs = null, ownWords = true, core = null } = {}) {
  // The learner's own language when it has a list (and isn't the language being learned): its keywords first,
  // with English ones after them when it has fewer than three that sound close enough.
  const own = speaks !== "en" && speaks !== lang && OWN_KEYWORDS.has(speaks);
  const [ownList, pron] = await Promise.all([own ? keywordsList(undefined, speaks).catch(() => null) : null,
    freePronunciation(v.text, lang, reading, v.meaning, courseDialect(lang), { core })]);
  // (the sounds are the core's, `pron.core`: the result carries it for the line under "How it sounds", and the core
  // itself is no keyword, "taco" for el taco)
  core = (pron && pron.core) || core;
  if (core && core.core && core.core !== String(v.text || "").trim()) avoid = [...avoid, core.core];
  return { ...(await keywordsFor(v, { pron, ownList, avoid, speaks, prefs, ownWords })), core };
}

// (freeMnemonics, once the sounds are known)
async function keywordsFor(v, { pron, ownList, avoid, speaks, prefs, ownWords }) {
  const mine = ownList ? makeFreeMnemonics(v, { pron, list: ownList, avoid, prefs, own: ownWords }) : null;
  if (mine && mine.items.length + mine.parts.length >= 3) return { ...mine, keywordLangs: [speaks] };
  const list = await keywordsList();
  if (!list) { if (mine) return { ...mine, keywordLangs: [speaks] }; throw new Error("NO_KEYWORDS"); }
  // (an English meaning is still best for English keywords: the card's meaning is in the learner's language)
  const english = makeFreeMnemonics(v, { pron, list, avoid, prefs, own: ownWords });
  if (!mine) return { ...english, keywordLangs: ["en"] };
  const items = [...mine.items, ...english.items].slice(0, 5), parts = [...mine.parts, ...english.parts].slice(0, 3);
  return { ...english, items, parts, asked: mine.asked + english.asked, keywordLangs: [speaks, "en"] };
}
