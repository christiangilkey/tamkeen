// The review card's "Mnemonic maker": keywords in the learner's own language that SOUND like the word
// being learned, each with a picture that ties it to the word's MEANING (the keyword method's two
// steps). The owner found the old suggestions "really bad" ("now-ee-ah"; words that don't sound like
// the word at all) and asked for keywords that "BOTH sound like the word and also be as closely related
// to the meaning as possible". So:
//
// 1. Pronunciation first. The AI is told how the word is said when the app knows it (Arabic vowel marks,
//    Japanese kana, pinyin, Korean / Thai / Hindi romanization, Russian stress, the CMU dictionary for
//    English: review.js finds it), and in any case first writes the word's IPA, syllables and stress.
//    The learner sees those syllables ("NIY-ya"), so they see what is being matched.
// 2. More candidates than are shown (KEYWORD_ASK), each with its own IPA, are checked for sound IN CODE
//    (review/phonemes.js). For English speakers each keyword's sounds come from the CMU Pronouncing
//    Dictionary instead of the AI's guess, and a word it doesn't know is not a real word. Weak matches
//    are dropped: if fewer than MNEMONIC_COUNT pass, only those are shown.
// 3. Ranking (the owner, later: "I'd also ideally like the mnemonics to try to be related to the meaning
//    of the word"): sound must pass first; among those that pass, a keyword that itself points to the
//    meaning ("strong", shown "Fits the meaning") comes first, the rest follow by how close they sound
//    (a "loose" link counts a little). Where no keyword points to the meaning, the picture links them.
// 4. Long words (3+ syllables) also get split keywords: two or three short ones, each for a chunk.
// 5. A keyword the learner turns down is never suggested for that word again (kept on this device,
//    `turnDown`), and is sent as "avoid".
//
// The AI is the learner's own (its key, through `ask`, which review.js hands in: define-service.js
// askMnemonic), so this file stays free of the page and can be tested on its own (tests/js/mnemonic.test.mjs).

import { PASS, letterPhones, match, phones, soundLabel, wordSounds } from "./phonemes.js";
import { pronunciation as cmuPronunciation } from "../lexicon/english.js";
import { COUNTRIES } from "../youtube-home.js";
import { corePromptLine, soundCore } from "./wordcore.js";

export const MNEMONIC_COUNT = 5;   // keywords shown
export const KEYWORD_ASK = 15;     // keywords asked for, so that enough pass the sound check
export const SPLIT_FROM = 3;       // words of this many syllables or more also get split keywords
export const SPLIT_COUNT = 3;      // at most this many split keywords asked for and shown

const LINK = ["none", "loose", "strong"];
const LOOSE_BONUS = 0.05;  // how much a loose link to the meaning counts, in sound score
const str = { type: "string" };
const SYLLABLE = { type: "object", properties: { text: str, ipa: str }, required: ["text", "ipa"], additionalProperties: false };
const COVERS = { type: "array", items: { type: "integer" }, description: "The word's syllables it sounds like, 0 = the first." };
const MEANING_LINK = { type: "string", enum: LINK.slice().reverse(), description: '"strong", "loose" or "none".' };

/** The shape of the answer. */
export const MNEMONIC_SCHEMA = {
  type: "object",
  properties: {
    pronunciation: {
      type: "object",
      properties: {
        romanization: str,
        ipa: str,
        syllables: { type: "array", items: SYLLABLE },
        stress: { type: "integer", description: "The stressed syllable, 0 = the first." },
      },
      required: ["romanization", "ipa", "syllables", "stress"],
      additionalProperties: false,
    },
    keywords: {
      type: "array",
      description: `About ${KEYWORD_ASK} keywords.`,
      items: {
        type: "object",
        properties: { keyword: str, ipa: str, covers: COVERS, meaning_link: MEANING_LINK, link: str, scene: str },
        required: ["keyword", "ipa", "covers", "meaning_link", "link", "scene"],
        additionalProperties: false,
      },
    },
    parts: {
      type: "array",
      description: "Split keywords, only for a word of 3 or more syllables; otherwise empty.",
      items: {
        type: "object",
        properties: {
          pieces: { type: "array", items: { type: "object", properties: { keyword: str, ipa: str, covers: COVERS }, required: ["keyword", "ipa", "covers"], additionalProperties: false } },
          meaning_link: MEANING_LINK, link: str, scene: str,
        },
        required: ["pieces", "meaning_link", "link", "scene"],
        additionalProperties: false,
      },
    },
  },
  required: ["pronunciation", "keywords", "parts"],
  additionalProperties: false,
};

/**
 * The question for the AI. `study` and `speaks` are language names in English ("Arabic", "Spanish");
 * `reading` is how the app's dictionary says the word ("" when it has nothing), `variety` the variety
 * the learner chose ("Egyptian Arabic", "Spanish as spoken in Spain"; "" for none); `avoid` lists what
 * was suggested or turned down before, so asking again brings new ones; `examples` are a few mnemonics the
 * learner wrote themselves ([{word, meaning, note}], review/ownmnemonic.js ownExamples), to show their style.
 */
export function mnemonicPrompt({ word, meaning = "", study = "Arabic", speaks = "English", avoid = [], reading = "", variety = "", examples = [], coreLine = "", partLine = "" }) {
  const said = variety ? ` in ${variety}` : "";
  // (the learner's own notes, one line each: the word, its meaning, the note as they wrote it, in quotes)
  const mine = (Array.isArray(examples) ? examples : []).slice(0, 3)
    .map((e) => [text((e || {}).word, 60), text((e || {}).meaning, 120), text((e || {}).note, 240)])
    .filter(([w, , n]) => w && n)
    .map(([w, m, n]) => `- ${w}${m ? ` (${m})` : ""}: "${n.replace(/"/g, "'")}"`);
  const system =`You help language learners remember words with the keyword method. A keyword is a real ${speaks} word or short phrase that SOUNDS like the ${study} word; a scene is a vivid picture that joins the keyword to the word's meaning, so that hearing the word brings back the keyword, and the keyword brings back the meaning.
1. First work out exactly how the ${study} word is said${said}: a simple romanization, its IPA, its syllables (each with its own romanization and IPA, together making the whole word) and which syllable is stressed (0 = the first; in a language without word stress, the most prominent one). When the message gives the app's reading of the word, follow it.
2. Then find ${KEYWORD_ASK} keywords. Each is made only of real ${speaks} words that a ${speaks} speaker knows (dictionary words, everyday phrases, well-known names), at most four words, in the usual ${speaks} spelling and script. Say it aloud in your head and compare it sound by sound with the word's IPA; the first sound and the stressed syllable matter most. A keyword may sound like the whole word or like only some of its syllables. Never spell out the word's sounds (like "nah-wee-yah"), never invent a word, never translate the word, never repeat it.
For each keyword give: "ipa", how a ${speaks} speaker says the keyword; "covers", the numbers of the word's syllables it sounds like; "meaning_link": "strong" when the keyword itself already points to the word's meaning (for German "Ente", duck: a keyword about birds or ponds), "loose" when it is only distantly related, "none" when it isn't related; "link", a few words on how it connects to the meaning ("" for none); "scene", one sentence in ${speaks} of at most 18 words: a concrete, vivid, slightly absurd picture in which the keyword and the meaning meet.
Sound comes first: a keyword that doesn't sound like the word is useless, however well it fits the meaning. Among the keywords that sound right, prefer those that also point to the meaning.
3. If the word has 3 or more syllables, also give up to ${SPLIT_COUNT} split keywords in "parts": 2 or 3 short keywords said one after the other, each sounding like a chunk of the word and together covering all of it, each with its IPA and the syllables it covers, and one scene that uses them all. For a shorter word, "parts" is an empty list.
Before answering, check every keyword: is it real ${speaks}, does it really sound like the word, and does its scene make the meaning clear? Replace any that fail. Return only the JSON object.`;
  const user = [
    `${study} word: ${word}`,
    // (`coreLine`, wordcore.js corePromptLine: the card says الكتاب and `word` is كتاب, the part the keywords match)
    coreLine,
    meaning ? `Its meaning: ${meaning}` : "",
    partLine,
    reading ? `How it is said, from the app's dictionary: ${reading}` : "",
    avoid.length ? `Already suggested or turned down, so give different ones: ${avoid.join("; ")}` : "",
    mine.length ? `Mnemonics this learner wrote themselves (the keyword in capitals), to show the kind of scene they like. Write your scenes in a similar style, with new keywords that sound like this word:\n${mine.join("\n")}` : "",
    `Give ${KEYWORD_ASK} keywords in ${speaks}, each with its scene.`,
  ].filter(Boolean).join("\n");
  return { system, user, schema: MNEMONIC_SCHEMA };
}

// The Arabic the learner hears, by the country chosen for Arabic (the same choice as YouTube's "Popular
// in" and the cards' Azure voice): the word is matched as it is said there.
const ARABIC_VARIETIES = { EG: "Egyptian Arabic", LB: "Levantine Arabic", JO: "Levantine Arabic", SY: "Levantine Arabic",
  PS: "Levantine Arabic", SA: "Saudi Arabic", AE: "Gulf Arabic", KW: "Gulf Arabic", QA: "Gulf Arabic", BH: "Gulf Arabic",
  OM: "Gulf Arabic", IQ: "Iraqi Arabic", MA: "Moroccan Arabic", DZ: "Algerian Arabic", TN: "Tunisian Arabic",
  LY: "Libyan Arabic", YE: "Yemeni Arabic" };

/** The variety to match the word in, from the country the learner picked for the language (`country`,
 * "" when none was picked): "Egyptian Arabic", "Spanish as spoken in Spain"; "" when there is no choice
 * to make (a language spoken in one country, or no country picked). */
export function varietyOf(lang, country, studyName) {
  if (!country) return "";
  if (lang === "ar") return ARABIC_VARIETIES[country] || "";
  const list = COUNTRIES[lang] || [];
  const found = list.find(([code]) => code === country);
  return found && list.length > 1 ? `${studyName} as spoken in ${found[1]}` : "";
}

/** Not a keyword but the word's sounds written out ("now-ee-ah", "nah-wee-yah") or a note about one
 * ("Nawiyah sounds like"): the model was asked for neither, and neither is a word the learner knows. */
export function spelledOut(text) {
  const s = String(text || "").trim();
  if (/\bsounds? (?:a bit |a little )?like\b/i.test(s)) return true;
  return /^\p{L}{1,4}(?:-\p{L}{1,4}){2,}$/u.test(s);  // three or more short syllables joined by hyphens
}

/** A keyword as written: numbering and quote marks off, one space between words. */
export function cleanKeyword(raw) {
  return String(raw ?? "").trim()
    .replace(/^(?:\d+[.)]|[-•*])\s*/u, "")
    .replace(/^["'“”‘’«»]+|["'“”‘’«»]+$/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}
const sameKeyword = (a, b) => cleanKeyword(a).toLocaleLowerCase() === cleanKeyword(b).toLocaleLowerCase();

/** The word's pronunciation from the answer: {romanization, ipa, syllables: [{text, ipa}], stress}, or
 * null when it has none. A stress outside the syllables becomes -1 (none marked). */
export function readPronunciation(answer) {
  const p = answer && answer.pronunciation;
  if (!p || typeof p !== "object") return null;
  const syllables = (Array.isArray(p.syllables) ? p.syllables : [])
    .map((x) => (typeof x === "string" ? { text: x, ipa: "" } : { text: String((x && x.text) ?? "").trim(), ipa: String((x && x.ipa) ?? "").trim() }))
    .filter((x) => x.text || x.ipa)
    .slice(0, 12);
  const romanization = String(p.romanization ?? "").trim().slice(0, 80);
  const ipa = String(p.ipa ?? "").trim().slice(0, 80);
  if (!syllables.length && !ipa && !romanization) return null;
  const stress = Number.isInteger(p.stress) && p.stress >= 0 && p.stress < syllables.length ? p.stress : -1;
  return { romanization, ipa, syllables, stress };
}

/** The word's syllables for the learner, the stressed one in capitals: [{text, stressed}]. ("ni", "YYA"
 * shown as ni-YYA.) Without syllables, the romanization as one piece. */
export function syllablePieces(pron) {
  if (!pron) return [];
  if (!pron.syllables.length) return pron.romanization ? [{ text: pron.romanization, stressed: false }] : [];
  return pron.syllables.map((s, i) => {
    const text = s.text || s.ipa;
    const stressed = i === pron.stress && pron.syllables.length > 1;
    return { text: stressed ? text.toLocaleUpperCase() : text, stressed };
  });
}
/** The same as one line of text: "ni-YYA". */
export const syllableLine = (pron) => syllablePieces(pron).map((p) => p.text).join("-");

const linkOf = (v) => {
  const s = String(v ?? "").toLowerCase();
  return s.includes("strong") ? 2 : s.includes("loose") || s.includes("weak") || s.includes("some") ? 1 : 0;
};
const coversOf = (v) => (Array.isArray(v) ? v.map(Number).filter((n) => Number.isInteger(n) && n >= 0).slice(0, 12) : []);
const text = (v, max = 220) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/** The answer's keywords, tidied: [{keyword, ipa, covers, link 0..2, linkNote, scene}]. Never the word
 * itself, nothing spelled out, no repeats. */
export function readKeywords(answer, word = "") {
  const list = Array.isArray(answer && answer.keywords) ? answer.keywords : Array.isArray(answer && answer.items) ? answer.items : [];
  const out = [];
  for (const raw of list) {
    const k = typeof raw === "string" ? { keyword: raw } : raw || {};
    const keyword = cleanKeyword(k.keyword);
    if (!keyword || sameKeyword(keyword, word) || spelledOut(keyword) || out.some((x) => sameKeyword(x.keyword, keyword))) continue;
    out.push({ keyword, ipa: text(k.ipa, 80), covers: coversOf(k.covers), link: linkOf(k.meaning_link), linkNote: text(k.link, 120), scene: text(k.scene) });
  }
  return out;
}

/** The answer's split keywords: [{keyword ("shatter + ling"), pieces: [{keyword, ipa, covers}], link, linkNote, scene}]. */
export function readParts(answer, word = "") {
  const list = Array.isArray(answer && answer.parts) ? answer.parts : [];
  const out = [];
  for (const raw of list) {
    const pieces = (Array.isArray(raw && raw.pieces) ? raw.pieces : [])
      .map((p) => ({ keyword: cleanKeyword(p && p.keyword), ipa: text(p && p.ipa, 60), covers: coversOf(p && p.covers) }))
      .filter((p) => p.keyword && !spelledOut(p.keyword));
    if (pieces.length < 2 || pieces.length > 3) continue;
    const keyword = pieces.map((p) => p.keyword).join(" + ");
    if (sameKeyword(keyword, word) || out.some((x) => sameKeyword(x.keyword, keyword))) continue;
    out.push({ keyword, pieces, link: linkOf(raw.meaning_link), linkNote: text(raw.link, 120), scene: text(raw.scene) });
  }
  return out;
}

/** The sounds of a keyword: from `ownSounds` (the learner's own dictionary: IPA, or null for a word it
 * doesn't know, or undefined when there is no dictionary), else the AI's IPA, else its spelling.
 * {phones, from: "dictionary" | "ai" | "spelling"} or null (not a real word). */
function keywordSounds(keyword, ipa, ownSounds) {
  const own = ownSounds ? ownSounds(keyword) : undefined;
  if (own === null) return null;
  if (own) return { phones: phones(own), from: "dictionary" };
  if (ipa) { const ps = phones(ipa); if (ps.length) return { phones: ps, from: "ai" }; }
  const ps = letterPhones(keyword);
  return ps.length ? { phones: ps, from: "spelling" } : null;
}

/** Each piece of a split keyword gets the run of syllables it sounds like best, left to right, leaving
 * at least one syllable for each piece after it. [{keyword, from, to}] */
function chunk(pieces, word) {
  const n = word.syllables.length;
  const out = [];
  let at = 0;
  pieces.forEach((p, i) => {
    const left = pieces.length - i - 1;
    let best = { from: Math.min(at, n - 1), to: Math.min(at, n - 1), score: -1 };
    for (let b = at; b <= n - 1 - left; b++) {
      const part = { syllables: word.syllables.slice(at, b + 1), stress: word.stress >= at && word.stress <= b ? word.stress - at : -1 };
      const m = p.sounds ? match(p.sounds.phones, part) : { score: 0 };
      // (the whole run must be matched: a piece covering only part of its run is not what it claims)
      const score = m.score * (m.from === 0 && m.to === b - at ? 1 : 0.8);
      if (score > best.score) best = { from: at, to: b, score };
    }
    out.push({ keyword: p.keyword, from: best.from, to: best.to });
    at = Math.min(n - 1, best.to + 1);
  });
  return out;
}

/**
 * The suggestions to show, checked and ranked. `pron` is readPronunciation's; `keywords` and `parts`
 * readKeywords' and readParts'; `ownSounds(keyword)` the learner's dictionary (see keywordSounds);
 * `avoid` keywords never to show again. Returns {items, parts, checked} where each item is
 * {keyword, scene, link, linkNote, sound ("close" / "partial", or "" when the word's sounds aren't
 * known), score, from, to, heard ("dictionary" / "ai" / "spelling"), pieces?}, best first, at most
 * MNEMONIC_COUNT items (or `count`: the free maker orders them itself) and SPLIT_COUNT parts; `checked` is
 * false when nothing could be measured.
 */
export function rankSuggestions({ pron, keywords = [], parts = [], ownSounds = null, avoid = [], count = MNEMONIC_COUNT }) {
  const word = pron ? wordSounds(pron.syllables.length ? pron.syllables : [{ text: pron.romanization, ipa: pron.ipa }], pron.stress) : null;
  const avoided = (k) => avoid.some((a) => sameKeyword(a, k));
  // A keyword that points to the meaning ("strong") first; then by sound, a loose link counting a little.
  const rank = (s) => (s.score ?? 0) + (s.link === 1 ? LOOSE_BONUS : 0);
  const order = (a, b) => (b.link === 2) - (a.link === 2) || rank(b) - rank(a);
  const judge = (sounds) => {
    if (!word) return { score: null, sound: "", from: 0, to: 0 };
    const m = match(sounds.phones, word);
    return { score: m.score, sound: soundLabel(m.score, m.coverage), from: m.from, to: m.to };
  };
  const items = [];
  for (const k of keywords) {
    if (avoided(k.keyword)) continue;
    const sounds = keywordSounds(k.keyword, k.ipa, ownSounds);
    if (!sounds) continue;  // not a real word of the learner's language
    const j = judge(sounds);
    if (word && j.score < PASS) continue;  // doesn't sound like the word
    items.push({ keyword: k.keyword, scene: k.scene, link: k.link, linkNote: k.linkNote, heard: sounds.from, ...j });
  }
  const split = [];
  if (word && word.syllables.length >= SPLIT_FROM) {
    for (const p of parts) {
      if (avoided(p.keyword)) continue;
      const pieces = p.pieces.map((x) => ({ ...x, sounds: keywordSounds(x.keyword, x.ipa, ownSounds) }));
      if (pieces.some((x) => !x.sounds)) continue;
      const all = pieces.flatMap((x) => x.sounds.phones);
      const m = match(all, word);
      if (m.score < PASS) continue;
      split.push({ keyword: p.keyword, scene: p.scene, link: p.link, linkNote: p.linkNote, heard: pieces.every((x) => x.sounds.from === "dictionary") ? "dictionary" : "ai",
        score: m.score, sound: soundLabel(m.score, m.coverage), from: m.from, to: m.to, pieces: chunk(pieces, word) });
    }
  }
  return { items: items.sort(order).slice(0, count), parts: split.sort(order).slice(0, Math.max(SPLIT_COUNT, count === MNEMONIC_COUNT ? SPLIT_COUNT : count)), checked: !!word };
}

/** English speakers: each keyword's sounds from the CMU Pronouncing Dictionary (the English word table,
 * docs/lexicon/en-lemmas.json.gz), word by word; null when any word of it isn't there (then it isn't a
 * real English word, or not a common one); undefined without the table. */
export function englishSounds(table) {
  if (!table || !table.ipa) return () => undefined;
  return (keyword) => {
    const words = String(keyword || "").split(/[\s\-–—+]+/).map((w) => w.replace(/^[^\p{L}']+|[^\p{L}']+$/gu, "")).filter(Boolean);
    if (!words.length) return null;
    const said = [];
    for (const w of words) {
      const ipa = cmuPronunciation(w, table);
      if (!ipa) return null;
      said.push(ipa.replace(/^\/|\/$/g, ""));
    }
    return said.join(" ");
  };
}

/**
 * Keywords for word `v` ({text, meaning}). `ask(prompt)` sends the question to the AI and resolves to
 * its JSON answer; `study` and `speaks` name the two languages; `reading` and `variety` as in
 * mnemonicPrompt; `ownSounds` as in rankSuggestions, or a promise of it (it may still be loading while
 * the AI thinks; if it fails, the AI's IPA is used); `avoid` what was shown or turned down before;
 * `examples` the learner's own mnemonics, as in mnemonicPrompt.
 * Only the word's own part is matched (review/wordcore.js): `core` is soundCore's answer for `v.text` (or `lang`, the
 * language's code, to work it out here); the AI is given the core (كتاب for الكتاب) and told what was left out, and
 * `reading` should be the core's (core.reading).
 * Resolves to {pron, core, items, parts, checked, asked} (`asked`: how many keywords came back). An answer
 * with no keywords at all is an error; one whose keywords all fail the sound check is not (it is said
 * honestly on the card).
 */
export async function makeMnemonics(v, { ask, study, speaks, avoid = [], reading = "", variety = "", ownSounds = null, examples = [], core = null, lang = "",
  partText = "" }) {
  if (!core && lang) {
    core = soundCore(v.text, lang, { reading });
    reading = core.reading;
  }
  // `partText`: the letters the learner highlighted on the card (review/partbar.js). The AI is asked about that
  // part alone: it says how the part is said, and its keywords are checked against that.
  const part = String(partText || "").trim();
  const word = part || (core && core.core) || v.text;
  if (part) reading = "";  // (the app's reading is of the whole word)
  const [answer, own] = await Promise.all([
    ask(mnemonicPrompt({ word, meaning: v.meaning, study, speaks, avoid, reading, variety, examples,
      coreLine: part ? "" : corePromptLine(v.text, core),
      partLine: part ? `This is only a part of the card's word, "${String(v.text).trim()}", which the learner chose: give the pronunciation of this part as it is said inside the whole word, and keywords that sound like this part. The meaning given is the whole word's, and each scene still links its keyword to that meaning.` : "" })),
    Promise.resolve(ownSounds).catch(() => null),
  ]);
  // (neither the card's word nor its core is a keyword: el taco is no "taco")
  const keywords = readKeywords(answer, v.text).filter((k) => !sameKeyword(k.keyword, word));
  const parts = readParts(answer, v.text).filter((k) => !sameKeyword(k.keyword, word));
  if (!keywords.length && !parts.length) throw new Error("No sound-alikes came back. Try again.");
  const pron = readPronunciation(answer);
  return { pron, core, asked: keywords.length + parts.length, ...rankSuggestions({ pron, keywords, parts, ownSounds: own, avoid }) };
}

/** What "Use" puts in Memorization notes: the keyword and its scene. */
export const noteText = (s) => (s.scene ? `${s.keyword} — ${s.scene}` : s.keyword);

/** Memorization notes with `text` added: nothing the learner typed is lost, and a blank line keeps
 * it apart from what was there. Text that is already in the notes isn't added twice. */
export function addToNotes(notes, text) {
  const now = String(notes || "");
  if (!text || now.includes(text)) return now;
  const had = now.replace(/\s+$/, "");
  return had ? `${had}\n\n${text}` : text;
}

// ---------- keywords the learner turned down, kept on this device ----------
const AVOID_KEY = "mnemonicAvoid";
const AVOID_WORDS = 400;  // the words remembered (the oldest forgotten first)
const AVOID_EACH = 40;    // keywords remembered per word

function readAvoid(store) {
  try {
    const all = JSON.parse((store && store.getItem(AVOID_KEY)) || "{}");
    return all && typeof all === "object" && !Array.isArray(all) ? all : {};
  } catch { return {}; }
}

/** The keywords turned down for word `uid` on this device. (`store` is localStorage, or a stand-in.) */
export function turnedDown(store, uid) {
  const list = readAvoid(store)[uid];
  return Array.isArray(list) ? list.filter((x) => typeof x === "string") : [];
}

/** Never suggest `keyword` for word `uid` again (on this device). */
export function turnDown(store, uid, keyword) {
  const k = cleanKeyword(keyword);
  if (!store || !uid || !k) return;
  const all = readAvoid(store);
  const list = turnedDown(store, uid).filter((x) => !sameKeyword(x, k));
  list.push(k);
  delete all[uid];
  all[uid] = list.slice(-AVOID_EACH);  // (put last: the most recently used word)
  const uids = Object.keys(all);
  for (const old of uids.slice(0, Math.max(0, uids.length - AVOID_WORDS))) delete all[old];
  try { store.setItem(AVOID_KEY, JSON.stringify(all)); } catch { /* storage full or unavailable */ }
}
