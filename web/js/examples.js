// Card helpers that need no AI key: an example sentence for a word ("Add words") and the free Mnemonic
// maker's English keywords (the review card, and "Add words" too). Their files are downloaded the first
// time they are needed, like the other dictionaries (kind "examples": docs/lexicon/<lang>-examples.json.gz;
// kind "keywords": en-keywords.json.gz; tools/build_examples.py), and then work with no connection.
//
// Shared by the desktop app, the phone and the web app.

import { api } from "./app.js";
import { ExamplePack, markTranslation } from "./lexicon/exampledata.js";
import { dictionaries, newWordCounter } from "./lexicon/seen.js";
import { lexemeOf } from "./lexicon/words.js";
import { pronunciationOf } from "./review/soundout.js";
import { KeywordList, makeFreeMnemonics } from "./review/freemnemonic.js";

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

/** What the examples file needs downloading for `lang`: {needed, installed, bytes}. */
export const examplesStatus = (lang) => api(`/lexicon/status?lang=${lang}&kind=examples`);

// A word's dictionary form, when the language's word tables are on this device (never downloads them).
async function lemmaFinder(lang) {
  let tables = null;
  try { tables = await dictionaries(lang); } catch { /* none: words are matched as written */ }
  if (!tables) return null;
  return (form) => { const lex = lexemeOf(form, lang, tables); return lex && lex.lemma; };
}

/**
 * An example sentence for `word` with no AI: {sentence, translation, source} or null when the file has
 * none. `meaning` puts ⟦ ⟧ round the word in the translation; `dialect` prefers an Arabic dialect's.
 */
export async function freeExample(word, lang, { meaning = "", dialect = "", skip = [] } = {}) {
  const p = await examplesOf(lang);
  if (!p) return null;
  const [lemmaOf, newWords] = await Promise.all([lemmaFinder(lang), newWordCounter(lang, word).catch(() => null)]);
  const found = p.find(word, { lemmaOf, dialect, meaning, newWords, count: 1 + skip.length }).filter((x) => !skip.includes(x.text));
  if (!found.length) return null;
  const best = found[0];
  // readable: every other word of the sentence is one the learner has seen (only told when that is known)
  return { sentence: best.text, translation: markTranslation(best.english, meaning), source: best.source, readable: best.newWords === 0 };
}

/**
 * How `word` is said, with no AI (review/soundout.js), using Wiktionary's IPA from the examples file when
 * it has the word and `reading` (what the app's dictionaries know: kana, pinyin, vowel marks) otherwise.
 */
export async function freePronunciation(word, lang, reading = "", meaning = "") {
  const p = await examplesOf(lang).catch(() => null);
  return pronunciationOf({ word, lang, ipa: p ? p.ipaOf(word, { verb: /^\s*to\s/i.test(meaning) }) : "", reading });
}

/**
 * The free Mnemonic maker: keywords for card `v` ({text, meaning, pos}) the way mnemonic.js
 * makeMnemonics gives them (with `free: true`). Throws "NO_KEYWORDS" when the English keyword list can't
 * be had (no connection the first time).
 */
export async function freeMnemonics(v, lang, { reading = "", avoid = [], speaks = "en", prefs = null } = {}) {
  // The learner's own language when it has a list (and isn't the language being learned): its keywords first,
  // with English ones after them when it has fewer than three that sound close enough.
  const own = speaks !== "en" && speaks !== lang && OWN_KEYWORDS.has(speaks);
  const [ownList, pron] = await Promise.all([own ? keywordsList(undefined, speaks).catch(() => null) : null,
    freePronunciation(v.text, lang, reading, v.meaning)]);
  const mine = ownList ? makeFreeMnemonics(v, { pron, list: ownList, avoid, prefs }) : null;
  if (mine && mine.items.length + mine.parts.length >= 3) return { ...mine, keywordLangs: [speaks] };
  const list = await keywordsList();
  if (!list) { if (mine) return { ...mine, keywordLangs: [speaks] }; throw new Error("NO_KEYWORDS"); }
  // (an English meaning is still best for English keywords: the card's meaning is in the learner's language)
  const english = makeFreeMnemonics(v, { pron, list, avoid, prefs });
  if (!mine) return { ...english, keywordLangs: ["en"] };
  const items = [...mine.items, ...english.items].slice(0, 5), parts = [...mine.parts, ...english.parts].slice(0, 3);
  return { ...english, items, parts, asked: mine.asked + english.asked, keywordLangs: [speaks, "en"] };
}
