// The built-in dictionary's word meanings (No AI, see ../meanings.js): matching a word to an entry
// of a <lang>-meanings.json.gz file (tools/build_meanings.py) and turning the entry into the word
// popup's answer. No screen or network code here.

import { EDGE_PUNCT } from "../wordlookup.js";

const AR_MARKS = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g;

/** The form a word is matched in. Must agree with key() in tools/build_meanings.py. */
export function matchKey(word, lang) {
  let w = String(word || "").trim().normalize("NFC");
  if (lang === "ar") {
    w = w.replace(AR_MARKS, "").replace(/ٱ/g, "ا");
    return w.replace(/[آأإ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه");
  }
  if (lang === "ru") return w.normalize("NFD").replace(/[́̀]/g, "").normalize("NFC").toLowerCase().replace(/ё/g, "е");
  if (lang === "ja" || lang === "zh" || lang === "th") return w;
  // Bisaya: o/u and e/i are one sound each (kaayo, Wolff's kaáyu); stress marks left off (as build_meanings.py).
  if (lang === "ceb") return w.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/o/g, "u").replace(/e/g, "i");
  return w.toLowerCase();
}

// Arabic words carry their little words with them: and/so, with/for/like, the; and pronouns at the
// end ("and with the book", "her book"). These are tried off when the word itself isn't found.
const AR_FRONT = ["و", "ف"];
const AR_PREP = ["ب", "ل", "ك", "س"];
const AR_END = ["هما", "كما", "هم", "هن", "كم", "كن", "نا", "ها", "ني", "ه", "ك", "ي"];

export function arabicVariants(k) {
  const out = [];
  const fronts = [k];
  for (const a of AR_FRONT) if (k.startsWith(a) && k.length > 2) fronts.push(k.slice(1));
  for (const f of [...fronts]) for (const p of AR_PREP) if (f.startsWith(p) && f.length > 2) fronts.push(f.slice(1));
  for (const f of [...fronts]) {
    if (f.startsWith("ال") && f.length > 3) fronts.push(f.slice(2));
    else if (f.startsWith("لل") && f.length > 3) fronts.push(f.slice(2)); // لل = ل + ال
  }
  for (const f of fronts) {
    out.push(f);
    for (const e of AR_END) {
      if (!f.endsWith(e) || f.length - e.length < 2) continue;
      const stem = f.slice(0, -e.length);
      out.push(stem);
      if (stem.endsWith("ت")) out.push(`${stem.slice(0, -1)}ه`); // مدرستي -> مدرسة (ة is matched as ه)
    }
  }
  return out;
}

// Bisaya joins its linker onto the word before (akong = ako + -ng, laing = lain + -g) and the little
// word y onto words ending in a vowel (maoy = mao + y, naay = naa + y): tried off when the word isn't found.
export function cebuanoVariants(k) {
  const out = [];
  if (/[aiu]ng$/.test(k) && k.length > 3) out.push(k.slice(0, -2), k.slice(0, -1));
  if (/[aiu]y$/.test(k) && k.length > 3) out.push(k.slice(0, -1));
  return out;
}

/** The keys to try for a word, best first: as written, then the dictionary form `lemmaOf` (the
 * language's word tables) finds, then the little words it may carry joined on. */
export function wordKeys(word, lang, lemmaOf = null) {
  const raw = String(word || "").trim();
  const bare = raw.replace(EDGE_PUNCT, "").trim();
  // Italian po', mo', di': the apostrophe is part of the word (po' is poco, Po is a river), so the
  // word with it comes first and the word without it last.
  const kept = lang === "it" && /\p{L}['’]$/u.test(raw.replace(/[^\p{L}'’]+$/u, "")) ? `${bare}'` : "";
  const keys = [matchKey(kept || bare, lang)];
  if (lang !== "ja" && lang !== "zh" && bare.includes(" ")) return keys; // a phrase: as a whole only
  const lemma = lemmaOf && lemmaOf(kept || bare);
  if (lemma) keys.push(matchKey(lemma, lang));
  if (kept) keys.push(matchKey(bare, lang));
  if (lang === "ar") keys.push(...arabicVariants(keys[0]));
  if (lang === "ceb") keys.push(...cebuanoVariants(keys[0]));
  return [...new Set(keys.filter(Boolean))];
}

/** The short name of the dictionary a meanings file comes from (its `source`), for the popup. */
export function dictionaryName(source) {
  if (/Wolff/.test(source || "")) return "Wolff's Dictionary of Cebuano Visayan";
  if (/CAMeL/.test(source || "")) return "the CAMeL Arabic databases";
  return "Wiktionary";
}

// Meanings a Tagalog or Bisaya file took from another language for a word it has no entry of
// (tools/build_meanings.py: "school", Bisaya "impormasyon"): shown only when the word's own language
// has nothing, like a proper name.
const BORROWED = new Set(["English word", "Tagalog word"]);
const borrowed = (g) => BORROWED.has(String(g[3] || "").split("|")[2]);
/** An ordinary meaning: not a proper name, not borrowed from another language. */
export const ordinary = (g) => g[1] !== "name" && !borrowed(g);
// A word whose own entries are only of these kinds gives way to the word it is a form of, when the
// language's word table says that is what it is: pongo is "I put" (poner) before "orangutan", Catalan
// faig "I do" (fer) before "beech", sóc "I am" (ser) before "stump". (como, a little word, and gracias, an exclamation, keep their own.)
const RARE_OWN = new Set(["noun", "adj", "name"]);
// Little words: a Tagalog or Bisaya root reached by taking affixes off (nakita -> kita) is the verb or
// noun, not the pronoun or particle spelled the same ("to see" before "we").
const LITTLE = new Set(["pron", "det", "article", "conj", "prep", "particle", "postp", "contraction"]);

/** Every entry for a word: {groups: [[shown, pos, glosses, extra], ...], formOf: "what form it is"}.
 * `keys` is the word as written first, then the dictionary form the language's word table found. */
export function findIn(data, keys) {
  // A spelling found only as a proper name ("الكتاب", the Quran) gives way to the next way of
  // reading the word that finds an ordinary one ("كتاب", book); the name is the last resort.
  let names = null;
  for (const k of keys) {
    const own = data.words[k] || [];
    const forms = data.forms[k] || [];
    if (!own.length && !forms.length) continue;
    // The word's own entries, then the words it is a form of; proper names last ("went": go, not the river Went).
    // (The form may point to the word table's dictionary form through another spelling: sóc -> soc -> ser.)
    const agreeing = ([lemmaKey]) => lemmaKey !== k && keys.includes(lemmaKey) && data.words[lemmaKey];
    let agreed = forms.find(agreeing);
    let between = []; // the meanings of that other spelling (soc: "stump")
    if (!agreed) {
      for (const f of forms) {
        const next = (data.forms[f[0]] || []).find(agreeing);
        if (next) { agreed = [next[0], f[1]]; between = data.words[f[0]] || []; break; }
      }
    }
    const rival = [...own, ...between];
    const formFirst = agreed && rival.length && rival.every((g) => RARE_OWN.has(g[1]));
    const formRows = formFirst ? [agreed, ...forms.filter((f) => f[0] !== agreed[0])] : forms;
    const lemmas = formRows.flatMap(([lemmaKey]) => data.words[lemmaKey] || []);
    let all = formFirst ? [...lemmas, ...own] : [...own, ...lemmas];
    // (Not for a word that is the root with the linker or y joined on: nilang is nila, "their", not indigo.)
    const linked = [`${k}ng`, `${k}g`, `${k}y`].includes(keys[0]);
    if (k !== keys[0] && !linked && (data.lang === "tl" || data.lang === "ceb")) {
      all = [...all.filter((g) => !LITTLE.has(g[1])), ...all.filter((g) => LITTLE.has(g[1]))];
    }
    const groups = [...all.filter(ordinary), ...all.filter((g) => !ordinary(g) && g[1] !== "name"), ...all.filter((g) => g[1] === "name")];
    // "What form it is" only when the meanings shown first are those of the word it is a form of.
    const ownFirst = !formFirst && own.some(ordinary);
    const found = { key: k, groups, formOf: forms.length && !ownFirst ? formRows[0][1] : "" };
    if (groups.some(ordinary)) return found;
    // Nothing ordinary: a borrowed meaning beats a name, the first one found beats later ones.
    if (!names || (!names.groups.some((g) => g[1] !== "name") && groups.some((g) => g[1] !== "name"))) names = found;
  }
  return names;
}

/** The popup's answer (the shape definer.js gives) for what findIn found for `word`. */
export function answerFrom(found, word, lang, { quick = false, language = "English", source = "" } = {}) {
  const dict = dictionaryName(source);
  const first = found.groups[0];
  const [root = "", reading = "", dialect = ""] = String(first[3] || "").split("|");
  const glosses = [];
  for (const [, pos, list] of found.groups) for (const g of list) if (!glosses.some((x) => x.g === g)) glosses.push({ pos, g });
  const meaning = glosses[0].g;
  const same = matchKey(first[0], lang) === matchKey(String(word).replace(EDGE_PUNCT, ""), lang);
  const answer = {
    word: word,
    // Arabic with its vowels and Russian with its stress replace the word as shown, only when it is that very word.
    vocalized: lang === "ja" || lang === "zh" ? reading : same && first[0] !== word ? first[0] : "",
    lemma: same ? "" : first[0],
    root,
    pos: first[1] || "",
    morphology: found.formOf || "",
    meaning,
    explanation: quick ? "" : `From the built-in dictionary (${dict}${/^english$/i.test(language) ? "" : ", in English"}): the word's usual meanings. It can't tell which one fits this sentence.`,
    other_meanings: quick ? [] : glosses.slice(1, 10).map((x) => (x.pos && x.pos !== first[1] ? `${x.g} (${x.pos})` : x.g)),
    dialect, dialect_note: "", msa_equivalent: "",
    sentence_translation: "", translation_marked: "", correction: "",
    provider: "dictionary", model: dict,
  };
  if (quick) answer.quick = true;
  return answer;
}
