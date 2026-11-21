// Vocab → the microphone beside "Add words" (components/voiceask.js): the learner asks out loud, "How do I say
// colorful in Spanish?" or "What does bonito mean?", sees the answer, and adds it as a card with a press or by
// saying "add it". This file is what needs no screen: reading the question, finding the word in the built-in
// dictionary (no key needed), and the AI's question and answer when the learner has set up an AI.
//
// Shared by the desktop app, the phone and the web app (tested in tests/js/voiceask.test.mjs).

import { LANGUAGES } from "./languages.js";
import { matchKey, ordinary } from "./lexicon/meaningdata.js";

// ---------------------------------------------------------------- reading the question

// The languages a question can name, by the names people say (the table's own names first).
const ALIASES = {
  mandarin: "zh", "mandarin chinese": "zh", filipino: "tl", cebuano: "ceb", bisaya: "ceb", visayan: "ceb", binisaya: "ceb",
  farsi: "fa", portuguese: "pt", "brazilian portuguese": "pt", "egyptian arabic": "ar", "levantine arabic": "ar",
};
const NAMES = (() => {
  const out = { ...ALIASES };
  for (const [code, info] of Object.entries(LANGUAGES)) {
    const name = String(info.name || "").toLowerCase();
    if (name) out[name] = code;
    const bare = name.replace(/\s*\(.*\)$/, "");  // "bisaya (cebuano)" -> "bisaya"
    if (bare) out[bare] = code;
  }
  return out;
})();
// Longest names first, so "brazilian portuguese" wins over "portuguese".
const NAME_LIST = Object.keys(NAMES).sort((a, b) => b.length - a.length).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
const NAME_RE = NAME_LIST.join("|");

const FILLERS = /^(?:(?:hey|hi|ok|okay|um+|uh+|so|and|well|please|tamkeen|can you tell me|could you tell me|tell me|i want to know|i wanna know|do you know|i'd like to know|i would like to know)\b[\s,]*)+/;
const ADD_RE = /\b(?:(?:please\s+)?(?:add|save|keep)\s+(?:it|that|this|them|those|these|the word|that word|both|all(?: of them)?)?(?:\s+(?:to|in|into)\s+(?:my\s+)?(?:cards?|words|deck|vocab(?:ulary)?|flashcards?))?|make\s+(?:it\s+|that\s+)?(?:a\s+|into\s+a\s+)?(?:flash)?card|put\s+(?:it|that)\s+in\s+my\s+(?:cards|deck|words))\b/;
const ALL_RE = /\b(?:both|all|them|those|these)\b/;

const tidy = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
/** The words asked about, without quotes, a leading "the word", or end punctuation. */
function bareWords(s) {
  return tidy(String(s ?? "")
    .replace(/^["“”'‘’«»„]+|["“”'‘’«»„]+$/g, "")
    .replace(/^(?:the\s+)?(?:word|phrase|expression|sentence)\s+(?=\S)/i, "")
    .replace(/[?!.,;:]+$/, "")
    .replace(/^["“”'‘’«»„]+|["“”'‘’«»„]+$/g, ""));
}

/**
 * What the learner asked, from what was heard or typed:
 *   {kind: "say" | "mean" | "add" | "none", phrase, lang, add, all}
 * "say" is how to say `phrase` (in their own language) in a language; "mean" what `phrase` (in the language
 * studied) means; "add" only "add it". `lang` is the language named in the question ("" when none: the one
 * being studied). `add` is true when the question also says to add it ("…and add it"); `all` when it says to
 * add them all. A bare word or phrase is "say" (the dictionary also tries it the other way round).
 */
export function readQuestion(text) {
  let s = tidy(String(text ?? "").toLowerCase().replace(/[’‘]/g, "'").replace(/[“”«»„]/g, '"'));
  s = s.replace(/[?!.]+$/, "").replace(FILLERS, "").trim();
  const out = { kind: "none", phrase: "", lang: "", add: false, all: false };
  if (!s) return out;
  // "…, and add it" / "add it": the adding is taken off whatever is left.
  const add = ADD_RE.exec(s);
  if (add) {
    out.add = true;
    out.all = ALL_RE.test(add[0]);
    s = tidy(s.slice(0, add.index) + " " + s.slice(add.index + add[0].length)).replace(/(?:^|\s)(?:and|then|also|please)\s*$/, "").replace(/^(?:and|then|also|please)\s+/, "").replace(/[,;]+$/, "").trim();
    if (!s || /^(?:yes|yeah|yep|sure|ok|okay|please|now|too|as well|as a card|a card)$/.test(s)) { out.kind = "add"; return out; }
  }
  // The language named: "in Spanish", "into French", "the Spanish word for", "Spanish for".
  const named = (m) => { if (m) out.lang = NAMES[m]; return m; };
  let m;
  if ((m = new RegExp(`\\s+(?:in|into|to)\\s+(${NAME_RE})(?:\\s+language)?$`).exec(s))) { named(m[1]); s = s.slice(0, m.index).trim(); }
  else if ((m = new RegExp(`^(?:what(?:'s| is| are)?\\s+)?(?:the\\s+)?(${NAME_RE})\\s+(?:word|words|way to say|for)\\s+(?:for\\s+|of\\s+)?`).exec(s))) {
    named(m[1]); out.kind = "say"; out.phrase = bareWords(s.slice(m[0].length)); return out;
  }
  // What it means: "what does X mean", "what's the meaning of X", "define X", "what is X in English".
  const mean = [
    /^what(?:'s| does| do| is)\s+(.+?)\s+mean$/,
    /^what(?:'s| is| are)?\s+the\s+meaning\s+of\s+(.+)$/,
    /^(?:define|meaning of|the meaning of|explain)\s+(.+)$/,
    /^what\s+is\s+the\s+english\s+(?:for|of)\s+(.+)$/,
  ];
  for (const re of mean) {
    if ((m = re.exec(s))) { out.kind = "mean"; out.phrase = bareWords(m[1]); return out; }
  }
  if (out.lang === "en") { out.kind = "mean"; out.lang = ""; out.phrase = bareWords(s.replace(/^(?:what(?:'s| is| are)|how do (?:i|you) say|translate)\s+/, "")); return out; }
  // How to say it: "how do I say X", "how is X said", "what's the word for X", "translate X", "say X".
  const say = [
    /^how\s+(?:do|would|can|could|should|does|did)\s+(?:i|you|we|one|someone|people|they)\s+(?:say|write|spell|express|ask|tell someone)\s+(.+)$/,
    /^how\s+(?:to)\s+(?:say|write|spell)\s+(.+)$/,
    /^how\s+(?:is|are)\s+(.+?)\s+(?:said|written|spelled|spelt)$/,
    /^what(?:'s| is| are)?\s+(?:the\s+)?(?:word|words|way to say|translation)\s+(?:for|of)\s+(.+)$/,
    /^(?:translate|say)\s+(.+)$/,
    /^what(?:'s| is| are)\s+(.+)$/,  // ("what's colorful" only reaches here after "in Spanish" was taken off)
  ];
  for (const re of say) {
    if ((m = re.exec(s))) {
      if (re === say[say.length - 1] && !out.lang) break;  // ("what is love" with no language: the whole of it)
      out.kind = "say"; out.phrase = bareWords(m[1]); return out;
    }
  }
  out.kind = "say";
  out.phrase = bareWords(s);
  if (!out.phrase) out.kind = out.add ? "add" : "none";
  return out;
}

// ---------------------------------------------------------------- what to say

// A common word of each language, asked about in the "what does it mean" example (all of them "pretty" or "beautiful",
// and all in the built-in dictionary: tests/js/voiceask.test.mjs).
const EXAMPLE_WORDS = { es: "bonito", ar: "جميل", fr: "joli", ja: "きれい", zh: "漂亮", ru: "красивый", it: "bello", tl: "maganda",
  pt: "bonito", ca: "bonic", ceb: "nindot", th: "สวย", de: "schön", fa: "زیبا", hi: "सुंदर", ko: "예쁘다", la: "pulcher", en: "gorgeous" };

/** The name a question says a language by: "Spanish", "Portuguese", "Bisaya" (readQuestion knows them all). */
export function spokenName(code) {
  const name = String((LANGUAGES[code] && LANGUAGES[code].name) || "").replace(/\s*\(.*\)$/, "");
  return code === "pt" ? "Portuguese" : name;
}

/**
 * The owner, 2026-11-20: "When the user presses the speak button on the vocab page, I want the window to show example
 * sentences so the user knows what to say." The box's examples, for the language studied (`study`): things
 * readQuestion understands, in English (it reads English): [{text, word?, after?}]. `word`: the language's own word in
 * it (shown in that language's letters and direction); `after`: said once there is an answer ("add it").
 */
export function askExamples(study) {
  const name = spokenName(study) || "Spanish";
  // (someone learning English asks what English words mean: "how do I say … in English" is read as that too)
  const out = study === "en" ? [] : [{ text: `How do I say colorful in ${name}?` }];
  const word = EXAMPLE_WORDS[study];
  if (word) out.push({ text: `What does ${word} mean?`, word });
  out.push({ text: "add it", after: true });
  return out;
}

// ---------------------------------------------------------------- the built-in dictionary, the other way round

/** The ways an English word may be spelled in the dictionary: colorful and colourful, realize and realise, center
 * and centre, gray and grey. Lower case. */
export function spellings(phrase) {
  const q = tidy(phrase).toLowerCase();
  // Each word's other spelling (only words of 5 letters or more: "for" and "door" stay as they are). A swap that
  // makes no real word does no harm: it simply matches no meaning.
  const other = (w) => {
    if (w.length < 5) return w;
    let m;
    if ((m = /^(.*[^aeiou])our(ful|ed|ing|s|ite|ites|less)?$/.exec(w))) return `${m[1]}or${m[2] || ""}`;      // colour -> color
    if ((m = /^(.*[^aeiou])or(ful|ed|ing|s|ite|ites|less)?$/.exec(w))) return `${m[1]}our${m[2] || ""}`;      // color -> colour
    if ((m = /^(.+)iz(e|ed|es|ing|ation)$/.exec(w))) return `${m[1]}is${m[2]}`;                                // realize -> realise
    if ((m = /^(.+)is(e|ed|es|ing|ation)$/.exec(w)) && !/(?:ra|wi|pr|ex|adv|rev|surpr|compr|superv|telev|prem)$/.test(m[1])) return `${m[1]}iz${m[2]}`;
    if ((m = /^(.*[^aeiou])re$/.exec(w))) return `${m[1]}er`;                                                  // centre -> center
    if ((m = /^(.*(?:nt|tr|ap|ib|it))er$/.exec(w))) return `${m[1]}re`;                                       // center -> centre
    return w;
  };
  const SWAPS = { gray: "grey", grey: "gray" };
  const words = q.split(" ");
  const out = new Set([q]);
  words.forEach((w, i) => {
    const o = SWAPS[w] || other(w);
    if (o !== w) for (const s of [...out]) { const ws = s.split(" "); ws[i] = o; out.add(ws.join(" ")); }
  });
  return [...out];
}

const ARTICLE = /^(?:a|an|the|some)\s+/;
const TO = /^to\s+/;
/** One meaning cut into the senses it lists: "vibrant, eye-catching (of colours); showy" -> ["vibrant",
 * "eye-catching", "showy"]. Notes in brackets and labels go; lower case. */
export function senses(gloss) {
  return String(gloss || "")
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
    .split(/[;,/]|\bor\b/)
    .map((x) => tidy(x).toLowerCase().replace(/[.!?:]+$/, "").replace(/^["'“]+|["'”]+$/g, ""))
    .filter(Boolean);
}

/**
 * The words of a language that mean `phrase` (English), best first: [{word, meaning, pos}], at most `max`.
 * `files` are the language's meanings files (meanings.js installedMeanings); `common` its most common words,
 * most common first (commonwords.js), which come before rarer words with the same meaning. A sense equal to
 * the phrase counts ("fork"); "to eat" finds verbs first. Proper names and borrowed meanings are left out.
 */
export function findTranslations(files, phrase, lang, { common = [], max = 4 } = {}) {
  const want = spellings(phrase).map((s) => s.replace(ARTICLE, ""));
  if (!want[0]) return [];
  const verb = TO.test(want[0]);
  const bare = want.map((s) => s.replace(TO, ""));
  const cores = [...new Set(bare)];
  const rank = new Map();
  (common || []).forEach((w, i) => { const k = matchKey(w, lang); if (!rank.has(k)) rank.set(k, i); });
  const oneWord = !/\s/.test(bare[0]);
  const best = new Map(); // key -> {score, word, meaning, pos}
  for (const data of files || []) {
    if (!data || !data.words) continue;
    for (const [key, groups] of Object.entries(data.words)) {
      if (!Array.isArray(groups)) continue;
      // A word Wiktionary says much about is a word much used (perro, four meanings, before tuso, one): with only
      // the 1000 most common words ranked, this is what puts the everyday word first.
      let rich = -1;
      groups.forEach((g, gi) => {
        if (!Array.isArray(g) || !ordinary(g)) return;
        const glosses = Array.isArray(g[2]) ? g[2] : [];
        glosses.forEach((gloss, li) => {
          const low = String(gloss || "").toLowerCase();
          if (!cores.some((c) => low.includes(c))) return;  // (quick: most meanings say nothing like it)
          const list = senses(gloss);
          const raw = String(gloss).replace(/\([^)]*\)|\[[^\]]*\]/g, " ").split(/[;,/]|\bor\b/).map(tidy).filter(Boolean);
          list.forEach((sense, si) => {
            const isVerb = TO.test(sense);
            const core = sense.replace(ARTICLE, "").replace(TO, "");
            if (!cores.includes(core)) return;
            const said = raw[si] || "";
            if (said.length > 1 && said === said.toUpperCase() && /\p{Lu}/u.test(said)) return;  // (an abbreviation: EAT)
            if (rich < 0) rich = groups.filter((x) => Array.isArray(x) && ordinary(x)).reduce((n, x) => n + (Array.isArray(x[2]) ? x[2].length : 0), 0);
            // (how common the word is counts in full when this is its main meaning, less for a side one: prendre
            // "to take" has "to eat" among its meanings, but manger is the word for it)
            const main = li === 0 && gi === 0 ? 1 : 0.4;
            let score = 100 - li * 8 - si * 4 - gi * 8 + Math.min(16, rich * 2) * main;
            if (/\?/.test(said)) score -= 15;  // ("hello?" on the phone)
            if (verb) score += isVerb || g[1] === "verb" ? 10 : -20;
            else if (isVerb && oneWord) score -= 4;
            if (rank.has(key)) score += (40 - rank.get(key) * 0.02) * main;
            if (oneWord && /\s/.test(key)) score -= 12;
            const was = best.get(key);
            if (!was || score > was.score) best.set(key, { score, word: String(g[0] || key), meaning: String(gloss || ""), pos: String(g[1] || "") });
          });
        });
      });
    }
  }
  return [...best.values()].sort((a, b) => b.score - a.score).slice(0, max).map(({ word, meaning, pos }) => ({ word, meaning: shortGloss(meaning), pos }));
}

/**
 * How to say `phrase` (English) from the dictionary, best first: [{word, meaning, sense, pos, reading}], at most
 * `max`. First Wiktionary's own translation tables (the meanings files' `english`, tools/build_meanings.py
 * --english: dog -> perro, fork -> tenedor), the words of the first sense listed first; then the backwards search
 * of the meanings (findTranslations), which finds what the tables lack (colorful: variopinto). `meaning` is the
 * card's front: the English asked for; `sense` which meaning of it the word is ("eating utensil").
 */
export function translationsFor(files, phrase, lang, { common = [], max = 4 } = {}) {
  const asked = tidy(phrase).toLowerCase().replace(ARTICLE, "");
  if (!asked) return [];
  const verb = TO.test(asked);
  const keys = [...new Set(spellings(asked).flatMap((s) => [s, s.replace(TO, "")]))];
  const out = [];
  const seen = new Set();
  const push = (item) => {
    const k = matchKey(item.word, lang);
    if (!item.word || seen.has(k) || out.length >= max) return;
    seen.add(k);
    out.push(item);
  };
  const front = asked.replace(TO, verb ? "to " : "");
  for (const data of files || []) {
    const table = data && data.english && typeof data.english === "object" ? data.english : null;
    if (!table) continue;
    let rows = [];
    for (const k of keys) if (Array.isArray(table[k])) { rows = table[k].filter((r) => Array.isArray(r) && typeof r[0] === "string"); break; }
    if (verb) rows = [...rows.filter((r) => r[1] === "verb"), ...rows.filter((r) => r[1] !== "verb")];
    if (!rows.length) continue;
    const first = String(rows[0][2] || "");
    // the words of the first sense (the main one), then the first word of each other sense
    const main = rows.filter((r) => String(r[2] || "") === first).slice(0, 3);
    const others = rows.filter((r) => String(r[2] || "") !== first && r === rows.find((x) => String(x[2] || "") === String(r[2] || "")));
    for (const r of [...main, ...others.slice(0, 1)]) {
      // (the sense without Wiktionary's cross-references, and not when it only repeats what was asked)
      let sense = tidy(String(r[2] || "").replace(/\s*[—–-]\s*see also\b.*$/i, "")).slice(0, 120);
      if (sense.toLowerCase() === front.toLowerCase() || sense.toLowerCase() === `to ${front}`.toLowerCase()) sense = "";
      push({ word: tidy(r[0]), meaning: front, sense, pos: String(r[1] || ""), reading: typeof r[3] === "string" ? tidy(r[3]) : "" });
    }
    break;
  }
  for (const f of findTranslations(files, phrase, lang, { common, max })) push({ word: f.word, meaning: f.meaning, sense: "", pos: f.pos, reading: "" });
  return out;
}

/** A dictionary meaning short enough for a card's front: its first few senses, at most about 80 letters. */
export function shortGloss(gloss) {
  const s = tidy(String(gloss || "").replace(/\s*\([^)]*\)\s*$/, ""));
  if (s.length <= 80) return s;
  const cut = s.slice(0, 80);
  const at = Math.max(cut.lastIndexOf(";"), cut.lastIndexOf(","));
  return (at > 20 ? cut.slice(0, at) : cut.replace(/\s+\S*$/, "")) + "…";
}

// ---------------------------------------------------------------- with an AI

export const ASK_SCHEMA = {
  type: "object",
  properties: {
    word: { type: "string", description: "How to say it in the language being studied, as it is written: the most natural, everyday way." },
    reading: { type: "string", description: "How it is read, in Latin letters, when the language isn't written in them; otherwise \"\"." },
    meaning: { type: "string", description: "What it means, in the learner's own language, in a few words: the front of a flashcard." },
    note: { type: "string", description: "One short sentence in the learner's own language: formality, gender, or when to use it. \"\" when there is nothing worth saying." },
    others: {
      type: "array",
      description: "Up to 3 other common ways to say it, best first ([] when there are none).",
      items: {
        type: "object",
        properties: { word: { type: "string" }, meaning: { type: "string" } },
        required: ["word", "meaning"],
        additionalProperties: false,
      },
    },
  },
  required: ["word", "reading", "meaning", "note", "others"],
  additionalProperties: false,
};

/** The request to the learner's AI for how to say `phrase` in `language` ("Spanish", "Egyptian Arabic"). `heard`
 * is the whole question as it was heard; `explain` the learner's own language; `vowels` asks for Arabic's marks. */
export function askPrompt({ phrase, heard = "", language = "Spanish", explain = "English", vowels = false, note = "" }) {
  const system = [
    `You are an expert ${language} teacher.${note ? ` ${note}` : ""} A learner asked out loud how to say something in ${language}. What they said was written down by speech recognition, so a word may be misheard: go by what they most likely meant.`,
    `Give the most natural, everyday way a native speaker would say it.${vowels ? " Write the Arabic with full vowel marks." : ""} When they asked about a ${language} word itself, give that word and what it means.`,
    `Write "meaning", "note" and the others' meanings in ${explain}. Keep "meaning" to a few words. Return only the JSON object.`,
  ].join("\n");
  const user = `What they asked: "${tidy(heard) || tidy(phrase)}"\nWhat to say in ${language}: "${tidy(phrase)}"`;
  return { system, user, schema: ASK_SCHEMA, maxTokens: 800 };
}

const text = (x, max = 300) => (typeof x === "string" ? tidy(x).slice(0, max) : "");
/** The AI's answer, tidied: {word, reading, meaning, note, others: [{word, meaning}]}, or null when it gave no word. */
export function cleanAsk(answer) {
  const a = answer && typeof answer === "object" ? answer : {};
  const word = text(a.word, 200);
  if (!word) return null;
  const others = (Array.isArray(a.others) ? a.others : [])
    .map((o) => ({ word: text(o && o.word, 200), meaning: text(o && o.meaning, 200) }))
    .filter((o) => o.word && o.word !== word)
    .slice(0, 3);
  return { word, reading: text(a.reading, 200), meaning: text(a.meaning, 300), note: text(a.note, 400), others };
}

// ---------------------------------------------------------------- hearing

/** The ways this device can hear a question, in the order they are tried. `device` is devicevoice.js deviceKind()
 * ("windows", "mac", "android", "ios", "web"); `browser` whether the page has the browser's own speech
 * recognition; `model` whether the computer's transcription can write it down; `service` whether an online
 * transcription service with the learner's key is set up. None of the first three needs a key:
 *   "model"   the computer's own transcription model (the voice stays on the computer)
 *   "native"  the phone's speech recognition (Android: Google's, as the keyboard's microphone uses)
 *   "browser" the browser's speech recognition (Chrome, Edge, Safari)
 *   "service" the online transcription service, with the learner's own key
 * With none, the question is typed (the phone keyboard's own microphone works there too). */
export function hearingWays({ device = "web", browser = false, model = false, service = false } = {}) {
  const ways = [];
  const computer = device === "windows" || device === "mac";
  if (computer && model) ways.push("model");
  if (device === "android") ways.push("native");
  if (browser) ways.push("browser");
  if (!computer && service) ways.push("service");
  return ways;
}

/** The language tag speech recognition is asked to hear: the learner's own language ("en" -> "en-US", or the
 * browser's own tag for it, "en-GB"). */
export function hearingTag(code, browserTag = "") {
  const c = String(code || "en").toLowerCase();
  const own = String(browserTag || "");
  if (own.toLowerCase().split("-")[0] === c && own.includes("-")) return own;
  const PLAIN = { en: "en-US", es: "es-ES", fr: "fr-FR", de: "de-DE", it: "it-IT", pt: "pt-BR", ar: "ar-SA", ja: "ja-JP", zh: "zh-CN",
    ko: "ko-KR", ru: "ru-RU", hi: "hi-IN", th: "th-TH", fa: "fa-IR", tl: "fil-PH", ceb: "fil-PH", ca: "ca-ES" };
  return PLAIN[c] || c;
}
