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
  if (lang === "ja" || lang === "zh") return w;
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

/** Every entry for a word: {groups: [[shown, pos, glosses, extra], ...], formOf: "what form it is"}. */
export function findIn(data, keys) {
  // A spelling found only as a proper name ("الكتاب", the Quran) gives way to the next way of
  // reading the word that finds an ordinary one ("كتاب", book); the name is the last resort.
  let names = null;
  for (const k of keys) {
    const own = data.words[k];
    const forms = data.forms[k] || [];
    if (!own && !forms.length) continue;
    // The word's own entries, then the words it is a form of; proper names last ("went": go, not the river Went).
    const lemmas = forms.flatMap(([lemmaKey]) => data.words[lemmaKey] || []);
    const all = [...(own || []), ...lemmas];
    const groups = [...all.filter((g) => g[1] !== "name"), ...all.filter((g) => g[1] === "name")];
    // "What form it is" only when the meanings shown first are those of the word it is a form of.
    const ownFirst = (own || []).some((g) => g[1] !== "name");
    const found = { key: k, groups, formOf: forms.length && !ownFirst ? forms[0][1] : "" };
    if (groups.some((g) => g[1] !== "name")) return found;
    names = names || found;
  }
  return names;
}

/** The popup's answer (the shape definer.js gives) for what findIn found for `word`. */
export function answerFrom(found, word, lang, { quick = false, language = "English" } = {}) {
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
    explanation: quick ? "" : `From the built-in dictionary (Wiktionary${/^english$/i.test(language) ? "" : ", in English"}): the word's usual meanings. It can't tell which one fits this sentence.`,
    other_meanings: quick ? [] : glosses.slice(1, 10).map((x) => (x.pos && x.pos !== first[1] ? `${x.g} (${x.pos})` : x.g)),
    dialect, dialect_note: "", msa_equivalent: "",
    sentence_translation: "", translation_marked: "", correction: "",
    provider: "dictionary", model: "Wiktionary",
  };
  if (quick) answer.quick = true;
  return answer;
}
