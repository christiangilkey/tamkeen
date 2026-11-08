// "Add words" (the Vocab page's card builder, components/wordbuilder.js): its pure part, kept apart
// from the screen so it can be tested on its own (tests/js/addwords.test.mjs). Every version has it.
//
// - Reading a pasted list: one card per line, "word", "word – meaning", "word = meaning", a row
//   pasted from a spreadsheet (word, meaning, sentence and its translation in columns, so tabs), or
//   "word; meaning; sentence".
// - "Typing always wins": each field of a card remembers whether the learner typed it or the app
//   filled it in; the app only ever fills a field that is empty or was filled by the app.
// - Words already saved, and the same word twice in one batch, compared the way the app compares
//   words (the Vocab page's search, app/arabic.py normalize): Arabic vowel marks, the forms of
//   alef, ya and ta marbuta, letter case and spaces don't count; nor do Russian stress marks or ё.
// - The question for the learner's AI: many words in one request, at most AI_CHUNK at a time, with
//   a strict JSON answer; and reading that answer, whatever came round it.
// - Phrases: a card can be several words ("por favor", "إن شاء الله", お願いします). What a card is (a word,
//   a phrase, or a phrase that is already a sentence), whether the Mnemonic maker suits it, and its
//   meaning word by word when no dictionary entry has the whole phrase.

import { joinWords, langInfo, wordRanges } from "./languages.js";
import { soundCore } from "./review/wordcore.js";

/** At most this many cards are added at a time. */
export const MAX_ROWS = 100;
/** Words asked of the AI in one request. */
export const AI_CHUNK = 20;

// ---------------------------------------------------------------- the choices for a batch

/** "For these cards": what the app does for each part. */
export const CHOICES = {
  meaning: ["auto", "type"],             // "Fill in for me" / "I'll type it"
  sentence: ["auto", "none", "type"],    // "Write one for me" / "No sentence" / "I'll type it"
  audio: ["auto", "none", "own"],        // "Make it for me" / "No audio" / "I'll add my own"
  mnemonic: ["auto", "none"],            // "Make one for me" / "No mnemonic" (Memorization notes: the free Mnemonic maker)
};
export const DEFAULT_CHOICES = { meaning: "auto", sentence: "auto", audio: "auto", mnemonic: "auto", folder: "" };

/** Choices kept on this device, made safe: anything unknown is the default. */
export function cleanChoices(saved) {
  const s = saved && typeof saved === "object" ? saved : {};
  const out = { ...DEFAULT_CHOICES };
  for (const [key, allowed] of Object.entries(CHOICES)) if (allowed.includes(s[key])) out[key] = s[key];
  out.folder = typeof s.folder === "string" ? s.folder.slice(0, 40) : "";
  return out;
}

// ---------------------------------------------------------------- a field: typing always wins

/** A field the learner typed (or pasted). */
export const typed = (value = "") => ({ value: String(value ?? ""), auto: false });
/** A field the app filled in. */
export const filled = (value = "") => ({ value: String(value ?? ""), auto: true });
/** Something is in it. */
export const hasValue = (field) => !!(field && String(field.value).trim());
/** The learner's own words are in it: the app leaves it alone. */
export const isOwn = (field) => !!field && !field.auto && hasValue(field);

/** `field` with the app's `value` put in, unless the learner's own words are there (typing wins).
 * An empty value never wipes out what is there. */
export function fillIn(field, value) {
  const v = String(value ?? "").trim();
  if (isOwn(field) || !v) return field || typed("");
  return filled(v);
}

/** `field` after the learner changed it: from now on it is theirs. */
export const edited = (value) => typed(value);

/** What still has to be filled in for a row, by the choices: {meaning, sentence, translation}. A
 * translation is wanted when a sentence is written for the learner, or theirs has none yet. */
export function needs(row, choices) {
  const meaning = choices.meaning === "auto" && !hasValue(row.meaning);
  const sentence = choices.sentence === "auto" && !hasValue(row.sentence);
  const translation = choices.sentence === "auto" && !hasValue(row.translation) && (sentence || hasValue(row.sentence));
  return { meaning, sentence, translation };
}

/** Does a row need anything filled in? */
export const needsAny = (row, choices) => Object.values(needs(row, choices)).some(Boolean);

/** Does a row still want a mnemonic in its Memorization notes (made on the device, no AI)? */
export const needsMemo = (row, choices) => choices.mnemonic === "auto" && !hasValue(row.memo);

// ---------------------------------------------------------------- comparing words

const ARABIC_MARKS = /[ؐ-ًؚ-ٰٟۖ-ۜ۟-۪ۨ-ۭ࣓-़ࣿ]/g;
const LETTERS = { "آ": "ا", "أ": "ا", "إ": "ا", "ٱ": "ا", "ٲ": "ا", "ٳ": "ا", "ة": "ه", "ى": "ي", "ؤ": "و", "ئ": "ي", "ـ": "",
  "ی": "ي", "ک": "ك", "ۀ": "ه", "‌": "", "ँ": "ं", "ё": "е", "Ё": "Е" };
const EDGES = /^[\s"'“”‘’«»„‚()[\]{}¿¡.,;:!?،؛؟…⟦⟧-]+|[\s"'“”‘’«»„‚()[\]{}¿¡.,;:!?،؛؟…⟦⟧-]+$/gu;

/**
 * A word as the app compares it: the Vocab page's search (app/arabic.py normalize, the phone's
 * shared-logic.js normalize), and also without punctuation round it, Russian stress marks or ё.
 * Accents that make another word (Spanish "más" and "mas") are kept.
 */
export function wordKey(text) {
  return String(text ?? "").normalize("NFC")
    .replace(ARABIC_MARKS, "")
    .replace(/[̀́]/g, "")  // stress marks left over once letters are composed (Russian кни́га)
    .replace(/[آأإٱٲٳةىؤئـیکۀ‌ँёЁ]/g, (c) => LETTERS[c])
    .replace(EDGES, "")
    .replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Which rows repeat a word: for each row, {saved} when the word is already in `existing` (the saved
 * words, as texts), {sameAs: n} when an earlier row of the batch has it (n counts from 0), else {}.
 * A row with no word is {}.
 */
export function duplicates(words, existing) {
  const saved = new Set([...(existing || [])].map(wordKey).filter(Boolean));
  const first = new Map();
  return (words || []).map((w, i) => {
    const key = wordKey(w);
    if (!key) return {};
    if (saved.has(key)) return { saved: true };
    if (first.has(key)) return { sameAs: first.get(key) };
    first.set(key, i);
    return {};
  });
}

// ---------------------------------------------------------------- reading a pasted list

// Letters of the study languages that have a script of their own: a line whose "meaning" is in it
// and whose "word" is not was written the other way round ("book – كتاب"). (Also used by scanwords.js.)
export const SCRIPTS = {
  ar: /\p{Script=Arabic}/u, fa: /\p{Script=Arabic}/u, ru: /\p{Script=Cyrillic}/u, ko: /\p{Script=Hangul}/u,
  ja: /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u, zh: /\p{Script=Han}/u, th: /\p{Script=Thai}/u,
  hi: /\p{Script=Devanagari}/u,
};

const BULLET = /^\s*(?:[-*•·▪◦‣]|\(?\d{1,3}[.)])\s+/u;
/** A spreadsheet cell: quotes round it are the spreadsheet's, "" inside is one ". */
const cell = (s) => {
  const t = String(s ?? "").trim();
  return /^"[\s\S]*"$/.test(t) && t.length > 1 ? t.slice(1, -1).replace(/""/g, "\"").trim() : t;
};

/**
 * One line of a pasted list as [word, meaning, sentence, translation] (empty strings where not given):
 * - a tab anywhere: spreadsheet columns, in that order;
 * - otherwise the first separator in the line ends the word:
 *   ";" (or Arabic "؛"): the rest are separated by semicolons too (word; meaning; sentence; translation);
 *   "=": word = meaning;
 *   a dash: "–" or "—", or "-" with spaces round it (a hyphen inside a word, "well-known", is no separator):
 *   word – meaning.
 *   After "=" or a dash the rest of the line is the meaning, semicolons and all ("book; volume").
 * A list mark at the start (1. 2) - • …) is left off.
 */
export function splitLine(line) {
  const raw = String(line ?? "").replace(/\r/g, "");
  if (!raw.trim()) return ["", "", "", ""];
  let parts;
  if (raw.includes("\t")) parts = raw.split("\t").map(cell);
  else {
    const s = raw.replace(BULLET, "").trim();
    const seps = [/[;؛]/u.exec(s), /=/.exec(s), /\s*[–—]\s*|\s-\s/u.exec(s)].map((m, kind) => (m ? { m, kind } : null)).filter(Boolean);
    const first = seps.sort((a, b) => a.m.index - b.m.index)[0];
    if (!first) parts = [cell(s)];
    else {
      const word = s.slice(0, first.m.index), rest = s.slice(first.m.index + first.m[0].length);
      parts = first.kind === 0 ? [word, ...rest.split(/[;؛]/u)].map(cell) : [word, rest].map(cell);
    }
  }
  parts[0] = String(parts[0] || "").replace(BULLET, "").trim();
  const [word = "", meaning = "", sentence = "", translation = ""] = parts;
  return [word, meaning, sentence, translation];
}

/**
 * A pasted list as cards: {cards: [{text, meaning, sentence, translation}], total, cut}. `lang` is
 * the language being learned (a line written "meaning – word" is turned round when the word's script
 * says so). Blank lines are skipped; only the first `max` cards are kept (`cut` says some were left).
 */
export function parseList(text, { lang = "", max = MAX_ROWS } = {}) {
  const script = SCRIPTS[lang];
  const cards = [];
  for (const line of String(text ?? "").split("\n")) {
    let [word, meaning, sentence, translation] = splitLine(line);
    if (!word && meaning) [word, meaning] = [meaning, ""];
    if (!word) continue;
    if (script && meaning && !script.test(word) && script.test(meaning)) [word, meaning] = [meaning, word];
    cards.push({ text: word.slice(0, 200), meaning: meaning.slice(0, 500), sentence: sentence.slice(0, 1000), translation: translation.slice(0, 1000) });
  }
  return { cards: cards.slice(0, max), total: cards.length, cut: cards.length > max };
}

// ---------------------------------------------------------------- phrases

/** The words of `text` as the language splits them (languages.js wordRanges): at its spaces, or, in Japanese,
 * Chinese and Thai, by the word splitter (a dictionary's once loaded, else the device's), without the
 * punctuation round each word. */
export function wordsIn(text, lang) {
  const s = String(text ?? "");
  return wordRanges(s, lang).map(([a, b]) => s.slice(a, b));
}

/** The words that count in a card's text: those of its core (review/wordcore.js soundCore), so the little words a
 * learner writes round one word ("el perro", "der Hund, -e", "to go", ขอบคุณครับ, 勉強する) don't make it a phrase. */
export function coreWords(text, lang) {
  return wordsIn(coreText(text, lang), lang);
}

/** A card's core: the part that is the word itself ("der Hund, -e" -> "Hund"; "por favor" stays whole). */
export function coreText(text, lang) {
  const s = String(text ?? "").trim();
  try { return soundCore(s, lang).core || s; } catch { return s; }
}

/** Text without the punctuation and marks at either end ("¿cómo estás?" -> "cómo estás"). */
export const bareText = (text) => String(text ?? "").replace(/^[\s\p{P}\p{S}]+|[\s\p{P}\p{S}]+$/gu, "");

/** A phrase: a card of more than one word ("por favor", "إن شاء الله", "darse cuenta de"). */
export const isPhrase = (text, lang) => coreWords(text, lang).length > 1;

/** A phrase of this many words or more is a sentence already: its own example sentence. */
export const SENTENCE_WORDS = 5;
/** Japanese, Chinese and Thai: by letters instead (the device's word splitter cuts endings off a word:
 * 食べます is three pieces to it, おはようございます five). */
export const SENTENCE_LETTERS = { ja: 12, zh: 10, th: 24 };
// Ends as a sentence does (closing quotes and brackets after it are fine). Not "…": "a ver si…" is unfinished.
const SENTENCE_END = /[.!?。！？؟।॥]["'’”»)\]」』]*$/u;
const letters = (s) => [...String(s).replace(/[\s\p{P}\p{S}]/gu, "")].length;

/**
 * What a card's text is: "word" (one word), "phrase" (several), or "sentence": a phrase that is a sentence
 * already, so it is its own example (nothing is looked for or written for it). A sentence ends with . ? ! ؟ 。
 * (or starts with ¿ ¡), or is long: SENTENCE_WORDS words (SENTENCE_LETTERS letters in Japanese, Chinese, Thai).
 */
export function entryKind(text, lang) {
  const s = String(text ?? "").trim();
  if (!isPhrase(s, lang)) return "word";
  if (SENTENCE_END.test(s) || /^[¿¡]/u.test(s)) return "sentence";
  const long = langInfo(lang).unspaced ? letters(s) >= (SENTENCE_LETTERS[lang] || 12) : wordsIn(s, lang).length >= SENTENCE_WORDS;
  return long ? "sentence" : "phrase";
}

/** The keyword method (the Mnemonic maker) suits a word or a short phrase: at most this many words. Longer
 * ones get no mnemonic (sound-alikes for a whole sentence would be nonsense). */
export const MNEMONIC_WORDS = 3;
/** Japanese, Chinese, Thai: at most this many letters (about four or five syllables; 一路平安, ありがとうございます). */
export const MNEMONIC_LETTERS = { ja: 10, zh: 4, th: 12 };

/** Does the keyword method suit this card? (Counted on its core, the part the Mnemonic maker matches.) */
export function mnemonicFits(text, lang) {
  const words = coreWords(text, lang);
  if (langInfo(lang).unspaced) return letters(words.join("")) <= (MNEMONIC_LETTERS[lang] || 10);
  return words.length <= MNEMONIC_WORDS;
}

/** A dictionary meaning cut down to its first sense: "to notice, to realize" -> "to notice"; notes in
 * brackets left out ("(informal) mate" -> "mate"). */
export function firstSense(meaning) {
  const m = String(meaning ?? "").replace(/\([^)]*\)|\[[^\]]*\]/g, " ").split(/[;,/\n]/)[0].replace(/\s+/g, " ").trim();
  return m || String(meaning ?? "").trim();
}

// Dictionary senses that don't say what a word means in a phrase: a letter's name ("de": "The name of the Latin
// script letter D"), only that it is another spelling or an abbreviation of something, or a pointer elsewhere
// ("Used other than figuratively or idiomatically: see لِـ").
const NOT_A_SENSE = /\bname of the\b.*\bletter\b|^(?:the )?letter\b|^(?:an? )?(?:alternative|obsolete|archaic|dated|rare|misspelling)\b.*\b(?:form|spelling) of\b|^(?:abbreviation|initialism|acronym|contraction) of\b|^used other than\b|^see\b/i;

/** The first of a dictionary's meanings (its main one, then the others) that says what the word means, cut to its
 * first sense; "" when none does. */
export function usableSense(meanings) {
  const list = (meanings || []).map((m) => firstSense(m)).filter(Boolean);
  return list.find((m) => !NOT_A_SENSE.test(m)) || "";
}

/**
 * A phrase's meaning word by word, for when no dictionary entry has the whole phrase: the longest run of its
 * words that has an entry of its own first ("darse cuenta" + "de"), else each word alone. `lookup(text,
 * several)` resolves to a meaning, or "" or null when there is none (`several`: a run of words, looked up only
 * as an exact entry). `longest` words in a run at most (never the whole phrase: that was tried already).
 * Resolves to {parts: [{text, meaning}], found, literal: "to notice + of"} (a word with no meaning stands in
 * it as written), or null when under two thirds of the parts have a meaning (`all`: unless every part has one;
 * for Japanese, Chinese and Thai, whose word splitter can cut one word into pieces).
 */
export async function wordByWord(words, lookup, { lang = "", longest = 4, all = false } = {}) {
  const list = (words || []).map((w) => String(w ?? "").trim()).filter(Boolean);
  if (list.length < 2) return null;
  const join = (ws) => joinWords(ws, lang);
  const ask = async (text, several) => { try { return firstSense((await lookup(text, several)) || ""); } catch { return ""; } };
  const parts = [];
  for (let i = 0; i < list.length;) {
    let hit = null;
    for (let n = Math.min(longest, list.length - i, list.length - 1); n >= 2 && !hit; n--) {
      const text = join(list.slice(i, i + n));
      const meaning = await ask(text, true);
      if (meaning) hit = { text, meaning, n };
    }
    if (!hit) hit = { text: list[i], meaning: await ask(list[i], false), n: 1 };
    parts.push(hit);
    i += hit.n;
  }
  const found = parts.filter((p) => p.meaning).length;
  if (!found || (all ? found < parts.length : found * 3 < parts.length * 2)) return null;
  return { parts: parts.map(({ text, meaning }) => ({ text, meaning })), found, literal: parts.map((p) => p.meaning || p.text).join(" + ") };
}

// ---------------------------------------------------------------- the AI: many words per request

/** `list` in pieces of at most `size`. */
export function chunks(list, size = AI_CHUNK) {
  const out = [];
  const n = Math.max(1, Math.floor(size) || 1);
  for (let i = 0; i < (list || []).length; i += n) out.push(list.slice(i, i + n));
  return out;
}

export const BATCH_SCHEMA = {
  type: "object",
  properties: {
    cards: {
      type: "array",
      description: "One entry per word, in the order given.",
      items: {
        type: "object",
        properties: {
          word: { type: "string", description: "The word (or phrase) exactly as given." },
          meaning: { type: "string" },
          sentence: { type: "string" },
          translation: { type: "string" },
        },
        required: ["word", "meaning", "sentence", "translation"],
        additionalProperties: false,
      },
    },
  },
  required: ["cards"],
  additionalProperties: false,
};

/**
 * The question for one request. `items`: [{word, meaning, sentence, phrase, want: {meaning, sentence,
 * translation}}] (meaning and sentence: what the card already has, so the sentence uses that sense
 * and a translation translates that sentence; `phrase`: several words learned together, explained as
 * one unit). `study` and `speaks` are language names in English.
 */
export function batchPrompt(items, { study = "Arabic", speaks = "English" } = {}) {
  const phrases = (items || []).some((it) => it.phrase)
    ? `\nA "phrase:" line is several words learned together (a set phrase, idiom, greeting or collocation). Its "meaning" is what the whole phrase means as one unit, the way a native speaker understands it, never its words translated one by one. Its "sentence" uses the whole phrase, in a form natives use.`
    : "";
  const system = `You help a language learner make flashcards for ${study} words. For each word you get, fill in only the fields it asks for, and leave the others as "".${phrases}
"meaning": a short meaning in ${speaks}: a few words, the most common sense (if a meaning is given, keep to that sense).
"sentence": one ${study} sentence that uses the word exactly the way native speakers really use it. It must:
- sound like something a native speaker would actually say or write in everyday life: idiomatic and natural, never stiff textbook language, and never translated word for word from ${speaks};
- make complete sense on its own: one clear, ordinary, believable situation that shows what the word means (no odd or random mix of ideas);
- use the word in its most common sense (the one in "meaning", if given), in a form natives commonly use, with the words, prepositions and grammar it naturally goes with;
- keep the word's own register and variety: if it is everyday, slang or dialect, the sentence is too; if it is formal, the sentence is formal;
- be short and clear for a beginner to intermediate learner (about 5 to 12 words), written in ${study}'s usual everyday script, as natives write it.
Before answering, check each sentence: would a native speaker say it just like this, and does it make sense? If not, rewrite it until it does.
"translation": the sentence (the one given, or the one you wrote) in natural, everyday ${speaks} (the meaning, not word for word), with ⟦ ⟧ round the part that translates the word.
Answer with JSON only: {"cards": [...]}, one entry per word, in the same order, with "word" exactly as given.`;
  const lines = (items || []).map((it, i) => {
    const asks = ["meaning", "sentence", "translation"].filter((k) => it.want && it.want[k]);
    const parts = [`${i + 1}. ${it.phrase ? "phrase" : "word"}: ${it.word}`, `fill in: ${asks.join(", ") || "nothing"}`];
    if (it.meaning) parts.push(`meaning: ${it.meaning}`);
    if (it.sentence) parts.push(`sentence: ${it.sentence}`);
    return parts.join(" | ");
  });
  return { system, user: lines.join("\n"), schema: BATCH_SCHEMA };
}

/** The JSON in a model's answer, whatever came round it (a sentence before, ``` fences): the object or
 * list itself, or null. */
export function jsonIn(text) {
  const s = String(text ?? "");
  const tries = [];
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(s);
  if (fenced) tries.push(fenced[1]);
  // The object or the list, whichever opens first.
  const spans = [["{", "}"], ["[", "]"]].map(([open, close]) => [s.indexOf(open), s.lastIndexOf(close)])
    .filter(([a, b]) => a >= 0 && b > a).sort((x, y) => x[0] - y[0]);
  for (const [a, b] of spans) tries.push(s.slice(a, b + 1));
  tries.push(s);
  for (const t of tries) {
    try { return JSON.parse(t.trim()); } catch { /* the next way */ }
  }
  return null;
}

const MARKED = /^[^⟦⟧]*(?:⟦[^⟦⟧]+⟧[^⟦⟧]*)+$/u;
const tidy = (v, max) => String(v ?? "").replace(/\s+/g, " ").trim().replace(/^["“”«»]+|["“”«»]+$/g, "").trim().slice(0, max);

/**
 * The answer to one request, matched to `items` (as given to batchPrompt): for each item
 * {meaning, sentence, translation} (strings, "" where not given or not asked for), or null when the
 * answer has nothing for that word. `answer` is the parsed JSON or the model's text. Entries are
 * matched by their word; one without a word that can be matched takes its place in the order.
 * A translation keeps its ⟦ ⟧ marks only when they pair up.
 */
export function readBatch(answer, items) {
  let data = typeof answer === "string" ? jsonIn(answer) : answer;
  if (data && !Array.isArray(data) && typeof data === "object") {
    data = Array.isArray(data.cards) ? data.cards : Array.isArray(data.words) ? data.words : Array.isArray(data.items) ? data.items : null;
  }
  const list = Array.isArray(data) ? data.filter((x) => x && typeof x === "object") : [];
  const wanted = (items || []).map((it) => wordKey(it.word));
  const used = new Set();
  // First each word's own entry; then, for a word with none, the entry in its place in the order
  // when that one belongs to no other word (the model wrote the word differently).
  const found = wanted.map((key) => {
    const at = list.findIndex((e, j) => !used.has(j) && key && wordKey(e.word) === key);
    if (at >= 0) used.add(at);
    return at;
  });
  for (let i = 0; i < found.length; i++) {
    if (found[i] >= 0 || i >= list.length || used.has(i)) continue;
    const key = wordKey(list[i].word);
    if (!key || !wanted.includes(key)) { found[i] = i; used.add(i); }
  }
  return (items || []).map((it, i) => {
    const entry = found[i] >= 0 ? list[found[i]] : null;
    if (!entry) return null;
    const want = it.want || { meaning: true, sentence: true, translation: true };
    let translation = tidy(entry.translation, 1000);
    if (!MARKED.test(translation)) translation = translation.replace(/[⟦⟧]/g, "");
    const out = {
      meaning: want.meaning ? tidy(entry.meaning, 300).replace(/[⟦⟧]/g, "") : "",
      sentence: want.sentence ? tidy(entry.sentence, 600).replace(/[⟦⟧]/g, "") : "",
      translation: want.translation ? translation : "",
    };
    return out.meaning || out.sentence || out.translation ? out : null;
  });
}

// ---------------------------------------------------------------- what is saved

/** A row as the card the server saves: {text, meaning, sentence, translation, notes, folders}. */
export function cardOf(row, { choices = DEFAULT_CHOICES, folder = "" } = {}) {
  const v = (f) => (f && typeof f === "object" ? String(f.value ?? "") : String(f ?? "")).trim();
  const noSentence = choices.sentence === "none";
  return {
    text: v(row.text).slice(0, 200),
    meaning: v(row.meaning).slice(0, 500),
    sentence: noSentence ? "" : v(row.sentence).slice(0, 1000),
    translation: noSentence ? "" : v(row.translation).slice(0, 1000),
    notes: v(row.notes).slice(0, 2000),
    memo: v(row.memo).slice(0, 2000),
    folders: folder ? [folder] : [],
  };
}

/** The rows that will become cards: a word, and not a repeat unless "Add anyway" is ticked. `dups`
 * comes from duplicates(). */
export function addable(rows, dups) {
  return (rows || []).filter((r, i) => wordKey(r.text && typeof r.text === "object" ? r.text.value : r.text)
    && (r.anyway || !(dups[i] && (dups[i].saved || dups[i].sameAs !== undefined))));
}

/** Run `work(item, i)` over `items`, at most `limit` at a time; resolves to each one's result or
 * {error} in order (one failing doesn't stop the others). */
export async function pool(items, limit, work) {
  const out = new Array((items || []).length);
  let next = 0;
  const lane = async () => {
    while (next < out.length) {
      const i = next++;
      try { out[i] = { value: await work(items[i], i) }; } catch (error) { out[i] = { error }; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), out.length) }, lane));
  return out;
}
