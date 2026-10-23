// The built-in dictionary's word meanings (No AI, see ../meanings.js): matching a word to an entry
// of a <lang>-meanings.json.gz file (tools/build_meanings.py) and turning the entry into the word
// popup's answer. No screen or network code here.

import { EDGE_PUNCT } from "../wordlookup.js";
import { compoundLemma, compoundParts, germanLemma, rankOf, separableAt, startsSentence, tableVerb } from "./german.js";
import { markedTokens } from "./words.js";
import { persianKey } from "./persian.js";
import { hindiCandidates, hindiKey } from "./hindi.js";

const AR_MARKS = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g;

/** The form a word is matched in. Must agree with key() in tools/build_meanings.py. */
export function matchKey(word, lang) {
  if (lang === "fa") return persianKey(word); // (Persian letters, no vowel marks, no half space)
  let w = String(word || "").trim().normalize("NFC");
  if (lang === "ar") {
    w = w.replace(AR_MARKS, "").replace(/ٱ/g, "ا");
    return w.replace(/[آأإ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه");
  }
  if (lang === "ru") return w.normalize("NFD").replace(/[́̀]/g, "").normalize("NFC").toLowerCase().replace(/ё/g, "е");
  if (lang === "ja" || lang === "zh" || lang === "th") return w;
  // Bisaya: o/u and e/i are one sound each (kaayo, Wolff's kaáyu); stress marks left off (as build_meanings.py).
  if (lang === "ceb") return w.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/o/g, "u").replace(/e/g, "i");
  // German: ß as ss, so today's spelling, the one from before 1996 and Switzerland's are one key (dass, daß;
  // Straße, Strasse). The entries keep their own spelling and capitals (lookUp puts the matching ones first).
  if (lang === "de") return w.toLowerCase().replace(/ß/g, "ss");
  // Hindi: with or without nukta, chandrabindu or anusvara, गये or गए (as build_meanings.py hindi_key)
  if (lang === "hi") return hindiKey(w);
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

// ---------- Bisaya: a word the dictionaries have only under its root ----------
// The app's root finder (./cebuano.js) checks a root against the Bisaya word list and wants it 4 letters or
// more, so moagi (agi), naila (ila), nauna (una), halayo (layo), nasayran (sayod) or gipugngan (pugong) find
// nothing. When no dictionary has the word itself, its affixes are taken off here in every way Bisaya puts
// them on (at most one prefix, one suffix and one infix or repeated syllable), and a root counts only when
// the dictionary has it and looks like a Bisaya root: 4 letters or more, or 3 beginning with a vowel (agi,
// ila, una; not bay, tun). The longest such root wins (makapaikag: paikag before ikag). Works on matching
// keys (matchKey: o is u, e is i).
const CEB_PREFIXES = ["nagpaka", "magpaka", "nakapa", "makapa", "nakig", "makig", "pakig", "nagka", "magka", "pagka", "nagpa",
  "magpa", "nahi", "mahi", "pahi", "gipa", "mupa", "mipa", "nipa", "ipa", "naka", "maka", "naki", "maki", "paki",
  "naga", "maga", "paga", "gina", "kina", "taga", "nag", "mag", "pag", "tig", "mu", "mi", "ni", "gi", "na", "ma", "ka", "pa",
  "ga", "hi", "ha", "i"];
// paN- and its forms swallow the root's first consonant: pangita = paN- + kita, mamalit = maN- + palit, nanukad = naN- + sukad.
const CEB_NASAL = [["gipang", "ng"], ["gipam", "m"], ["gipan", "n"], ["nagpang", "ng"], ["pang", "ng"], ["nang", "ng"],
  ["mang", "ng"], ["ning", "ng"], ["ming", "ng"], ["pam", "m"], ["nam", "m"], ["mam", "m"], ["pan", "n"], ["nan", "n"], ["man", "n"]];
const CEB_SUFFIXES = ["anan", "unun", "han", "hun", "an", "un", "ay", "a", "i"];
const VOWELS = ["u", "a", "i"]; // (u first: a dropped vowel is most often o: huptan is hupot, masayran sayod)

/** The root as it was before a suffix came off: sudl(an) -> sulud, imn(un) -> inum, hibal-(an) -> hibalu,
 * bayr(an) -> bayad, hangtur(an) -> hangtud, basah(un) -> basa. */
function beforeSuffix(stem) {
  const out = [stem];
  if (stem.endsWith("-")) return VOWELS.map((v) => stem.slice(0, -1) + v);
  // (not after y or w, which follow a consonant in Spanish words: lokasyon, kategorya are no Bisaya root + suffix)
  const m = stem.match(/^(.*?)([^aiu'-])(ng|[^aiu'yw-])$/); // (ng is one sound: pugng(an) -> pugung)
  if (m) {
    const [, base, c1, c2] = m;
    for (const v of VOWELS) {
      out.push(base + c1 + v + c2);
      if (c2 === "r") out.push(`${base}${c1}${v}d`);
      if (c1 + c2 === "mn" || c1 + c2 === "dl") out.push(base + c2 + v + c1);
    }
  }
  if (/[aiu]r$/.test(stem)) out.push(`${stem.slice(0, -1)}d`);
  if (/[aiu]h$/.test(stem)) out.push(stem.slice(0, -1));
  return out;
}

// One affix off s: [what is left, "pre" | "suf" | "mid"].
function stripOnce(s) {
  const out = [];
  const add = (c, kind) => { if (c.length >= 3) out.push([c.replace(/^-/, ""), kind]); };
  for (const p of CEB_PREFIXES) if (s.startsWith(p)) add(s.slice(p.length), "pre");
  for (const [p, n] of CEB_NASAL) {
    if (!s.startsWith(p)) continue;
    const rest = s.slice(p.length);
    if (n === "ng") { add(rest, "pre"); if (/^[aiu]/.test(rest)) add(`k${rest}`, "pre"); }
    if (n === "m" && /^[aiu]/.test(rest)) { add(`p${rest}`, "pre"); add(`b${rest}`, "pre"); }
    if (n === "n") { add(rest, "pre"); if (/^[aiu]/.test(rest)) for (const c of "tds") add(c + rest, "pre"); }
  }
  for (const x of CEB_SUFFIXES) {
    if (s.endsWith(x) && s.length - x.length >= 2) for (const c of beforeSuffix(s.slice(0, -x.length))) add(c, "suf");
  }
  const inf = s.match(/^([^aiu])(?:in|um)([aiu].+)$/); // sinulat -> sulat
  if (inf) add(inf[1] + inf[2], "mid");
  if (/^in[aiu]/.test(s)) add(s.slice(2), "mid");
  const redup = s.match(/^([^aiu]?[aiu])(\1.+)$/); // tutudlu -> tudlu
  if (redup) add(redup[2], "mid");
  const twice = s.match(/^([a-z]+)-\1$/); // lain-lain -> lain
  if (twice) add(twice[1], "mid");
  return out;
}

// A short root only one affix away (pagsumite is no pag- + -um- + siti, "seven").
const rootShape = (c, depth) => c.length >= 5 || (depth === 1 && (c.length === 4 || /^[aiu][^aiu][aiu]$/.test(c)));

/** The roots of Bisaya word key `k` that `has` knows, best first: [{key, steps}]. Of two roots as long,
 * the commoner in Bisaya text (`rank`, lower is commoner) wins: bayran is bayad "pay", not bayod "bruised";
 * mamalit palit "buy", not malit "mallet". */
export function cebuanoStems(k, has, rank = () => Infinity) {
  const found = new Map();
  k = k.replace(/([a-z]{3,})-\1$/, "$1"); // a word said twice is the word once: nagkalain-lain -> nagkalain
  let frontier = [[k, ""]]; // (what is left, the kinds of affix taken off so far)
  const seen = new Set([k]);
  for (let depth = 1; depth <= 3 && frontier.length; depth++) {
    const next = [];
    for (const [s, used] of frontier) {
      for (const [c, kind] of stripOnce(s)) {
        if (used.includes(kind) || seen.has(c)) continue;
        seen.add(c);
        next.push([c, used + kind]);
        if (rootShape(c, depth) && has(c)) found.set(c, depth);
      }
    }
    frontier = next;
  }
  return [...found].map(([key, steps]) => ({ key, steps, rank: rank(key) }))
    .sort((a, b) => b.key.length - a.key.length || a.rank - b.rank || a.steps - b.steps);
}

const ranks = new WeakMap();
/** How common each Bisaya word key is, from the word list (docs/lexicon/ceb-roots: commonest first). */
export function commonness(lemmas) {
  if (!lemmas) return () => Infinity;
  let r = ranks.get(lemmas);
  if (!r) {
    r = new Map();
    lemmas.forEach((w, i) => { const k = matchKey(w, "ceb"); if (!r.has(k)) r.set(k, i); });
    ranks.set(lemmas, r);
  }
  return (k) => (r.has(k) ? r.get(k) : Infinity);
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
  const sure = [...new Set(keys.filter(Boolean))];
  if (lang !== "hi") return sure;
  // Hindi: a form the files don't list, with its ending taken off (समझाते: समझाना), after everything else.
  // These are guesses (`guessed`: where they start): findIn never takes one as the word this is a form of
  // (पानी is "water", whatever पाना's forms say).
  const out = [...new Set([...sure, ...hindiCandidates(bare).map((c) => matchKey(c, lang)).filter(Boolean)])];
  out.guessed = sure.length;
  return out;
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
const SAID = new Set(["intj", "particle", "phrase"]);
const ROMANCE_LANGS = new Set(["es", "fr", "it", "pt", "ca"]);
// Little words: a Tagalog or Bisaya root reached by taking affixes off (nakita -> kita) is the verb or
// noun, not the pronoun or particle spelled the same ("to see" before "we").
const LITTLE = new Set(["pron", "det", "article", "conj", "prep", "particle", "postp", "contraction"]);

/** Every entry for a word: {groups: [[shown, pos, glosses, extra], ...], formOf: "what form it is"}.
 * `keys` is the word as written first, then the dictionary form the language's word table found. */
export function findIn(data, keys) {
  // A spelling found only as a proper name ("الكتاب", the Quran) gives way to the next way of
  // reading the word that finds an ordinary one ("كتاب", book); the name is the last resort.
  let names = null;
  const sure = keys.guessed == null ? keys : keys.slice(0, keys.guessed); // (wordKeys: not the Hindi guesses)
  for (const k of keys) {
    const own = data.words[k] || [];
    const forms = data.forms[k] || [];
    if (!own.length && !forms.length) continue;
    // The word's own entries, then the words it is a form of; proper names last ("went": go, not the river Went).
    // (The form may point to the word table's dictionary form through another spelling: sóc -> soc -> ser.)
    const agreeing = ([lemmaKey]) => lemmaKey !== k && sure.includes(lemmaKey) && data.words[lemmaKey];
    let agreed = forms.find(agreeing);
    let between = []; // the meanings of that other spelling (soc: "stump")
    if (!agreed) {
      for (const f of forms) {
        const next = (data.forms[f[0]] || []).find(agreeing);
        if (next) { agreed = [next[0], f[1]]; between = data.words[f[0]] || []; break; }
      }
    }
    const rival = [...own, ...between];
    // Spanish: an exclamation that is a verb's form gives way to the verb too (digo "I mean" is decir's
    // "I say", vaya "wow!" is ir's "may go", sepa "dunno"); it stays among the meanings.
    // (Not one with pronouns on it: cállate "shut up!" says more than callar's "to be quiet".)
    const verbForm = agreed && data.lang === "es" && !/combined with/.test(agreed[1])
      && (data.words[agreed[0]] || []).some((g) => g[1] === "verb");
    const rare = (g) => RARE_OWN.has(g[1]) || (verbForm && SAID.has(g[1]));
    // (A Spanish, French, Italian, Portuguese, Catalan or Hindi word with no entry of its own shows first the
    // word the word table counts it as: podés is poder, not podar; idos is ir, not idus; लगा is लगना "it
    // stuck", not the stem of लगाना.)
    const formFirst = agreed && (rival.length ? rival.every(rare) : ROMANCE_LANGS.has(data.lang) || data.lang === "de" || data.lang === "hi");
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
    let formOf = forms.length && !ownFirst ? formRows[0][1] : "";
    // A word whose own meanings come first but which the word table counts as another word's form says
    // so: fuera "outside", also ser's "were"; dicho "said, saying", also decir's past participle.
    if (ownFirst && agreed && ROMANCE_LANGS.has(data.lang)) formOf = `also ${agreed[1]}${/ of /.test(agreed[1]) ? "" : ` of ${agreed[0]}`}`;
    const found = { key: k, groups, formOf };
    if (groups.some(ordinary)) return found;
    // Nothing ordinary: a borrowed meaning beats a name, the first one found beats later ones.
    if (!names || (!names.groups.some((g) => g[1] !== "name") && groups.some((g) => g[1] !== "name"))) names = found;
  }
  return names;
}

// The prefixes and infixes that make a Tagalog or Bisaya verb (mo-/mi-/nag-/mag-/gi-/ni-/naka-…, -um-/-in-).
const VERB_AFFIX = /^(?:mo|mu|mi|ni|gi|nag|mag|naga|maga|naka|maka|nagpa|magpa|gipa|gina|ipa|pinag|ipinag|nakipag|makipag)[a-z]{3,}|^[^aeiou](?:um|in)[aeiou]/i;
const BORROWED_FROM_TAGALOG = (g) => String(g[3] || "").split("|")[2] === "Tagalog word";
// (not i-, mi-, ni-: imac, milan, nephi are no Bisaya verbs)
const TAGLISH = /^(mo|mu|gi|nag|mag|naga|maga|ga|gina|maka|naka)-?([a-z]{4,})$/;

/** German: the entries that match how the word is written first. Capitals tell a noun (das Essen "food",
 * der Weg "way") from another word (essen "to eat", weg "away"), except at the start of a sentence
 * (`initial`); and ß from ss where both are words (Maße "measures", Masse "mass"). Proper names stay last. */
export function germanOrder(groups, word, initial = true) {
  const w = String(word || "").replace(EDGE_PUNCT, "");
  const capital = /^\p{Lu}/u.test(w);
  const cls = (g) => (ordinary(g) ? 0 : g[1] === "name" ? 2 : 1);
  const caseOff = (g) => (initial ? 0 : /^\p{Lu}/u.test(g[0]) === capital ? 0 : 1);
  // (only when the word is written with ß: Strasse is Switzerland's Straße, not Strass "rhinestone")
  const sharpOff = (g) => (w.includes("ß") && !String(g[0]).includes("ß") ? 1 : 0);
  return groups.map((g, i) => [g, i]).sort(([a, i], [b, j]) => cls(a) - cls(b) || caseOff(a) - caseOff(b)
    || sharpOff(a) - sharpOff(b) || i - j).map(([g]) => g);
}

// ---------- German compounds the dictionary has no entry for ----------

const upper1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);
/** The entries a meanings file has for one way of writing a piece of a word (capitalised or not), or the
 * entries of the word it is a form of: [shown spelling, groups] or null. */
function entriesFor(files, piece, capital) {
  const k = matchKey(piece, "de");
  const fits = (g) => ordinary(g) && /^\p{Lu}/u.test(g[0]) === capital;
  for (const data of files) {
    if (!data) continue;
    const own = (data.words[k] || []).filter(fits);
    if (own.length) return [own[0][0], own];
    for (const [lemmaKey] of data.forms[k] || []) {
      const lemma = (data.words[lemmaKey] || []).filter(fits);
      if (lemma.length) return [lemma[0][0], lemma];
    }
  }
  return null;
}

/**
 * A German compound the meanings files have no entry for, taken apart (Handschuhfabriken: Handschuh +
 * Fabrik): {key, groups: the last part's, formOf, parts: [{text, lemma, groups}], source}, or null.
 * `split(word, known)` is compoundParts from ./german.js; `lemmaOf(piece, capital)` the word table's
 * dictionary form of a piece written that way, when the table is here.
 */
export function germanCompound(files, word, split, { lemmaOf = null, rank, join = null } = {}) {
  const found = new Map(); // dictionary form -> groups
  const known = (piece, capital) => {
    const written = capital ? upper1(piece.toLowerCase()) : piece.toLowerCase();
    const viaTable = lemmaOf && lemmaOf(written, capital);
    const hit = (viaTable && entriesFor(files, viaTable, /^\p{Lu}/u.test(viaTable))) || entriesFor(files, written, capital);
    if (!hit) return null;
    found.set(hit[0], hit[1]);
    return hit[0];
  };
  const bare = String(word || "").replace(EDGE_PUNCT, "");
  const parts = split(bare, known, rank);
  if (!parts) return null;
  const withMeanings = parts.map((p) => ({ ...p, groups: found.get(p.lemma) || entriesFor(files, p.lemma, /^\p{Lu}/u.test(p.lemma))?.[1] || [] }));
  if (withMeanings.some((p) => !p.groups.length)) return null;
  const head = withMeanings[withMeanings.length - 1];
  const source = (files.find((d) => d && d.words[matchKey(head.lemma, "de")]) || files.find(Boolean) || {}).source || "";
  return { key: matchKey(bare, "de"), groups: head.groups, formOf: "compound word", parts: withMeanings, source,
    lemma: join ? join(withMeanings, bare) : "" };
}

/**
 * The German word popup's lookup (../meanings.js): what the meanings files have for `word` in the sentence
 * `marked` (the word in ⟦ ⟧), with the word table `table` when it is here: {...findIn's answer, source} or null.
 *   - a separable verb whose prefix stands later in the sentence is that verb (fängt in "Der Film fängt um acht
 *     an": anfangen, "third-person singular present of anfangen"); tapping the prefix gives it too;
 *   - capitals: a noun's entries first in the middle of a sentence (germanOrder);
 *   - a compound with no entry of its own is shown by its parts (germanCompound).
 */
export function germanLookUp(files, word, marked = "", { table = null } = {}) {
  const bare = String(word || "").replace(EDGE_PUNCT, "").trim();
  const { tokens, marked: at } = markedTokens(marked);
  const index = at.length === 1 ? at[0] : -1;
  const initial = index < 0 || startsSentence(tokens, index);
  const has = (k) => files.some((d) => d && (d.words[k] || []).some(ordinary));
  // A form's dictionary form: from the word table, or else the meanings file's own list of forms.
  const lemmaOf = (form, first) => {
    if (table) return germanLemma(form, table, first);
    const k = matchKey(form, "de");
    if (has(k)) return form.toLowerCase();
    for (const d of files) { const row = d && (d.forms[k] || [])[0]; if (row) return row[0]; }
    return null;
  };
  const keys = wordKeys(bare, "de", (f) => lemmaOf(f, initial));
  if (!bare.includes(" ") && bare) {
    // (the word table knows which verbs are common; without it, any verb the dictionary has)
    const isVerb = table ? tableVerb(table) : (v) => files.some((d) => d && (d.words[matchKey(v, "de")] || []).some((g) => g[1] === "verb"));
    const sep = index >= 0 ? separableAt(tokens, index, lemmaOf, isVerb) : null;
    if (sep) {
      const k = matchKey(sep.lemma, "de");
      const hit = lookUp(files, [k], sep.lemma, "de", { initial: false });
      if (hit && hit.key === k) {
        const base = matchKey(sep.lemma.slice(sep.particle.length), "de"); // fangen
        const row = files.flatMap((d) => (d && d.forms[matchKey(sep.verb, "de")]) || []).find(([lk]) => lk === base);
        const what = row && row[1] ? `: ${row[1].replace(/ of \S+$/, "")} of ${sep.lemma}` : " (separable verb)";
        const verbsFirst = [...hit.groups.filter((g) => g[1] === "verb"), ...hit.groups.filter((g) => g[1] !== "verb")];
        return { ...hit, groups: verbsFirst, formOf: `${sep.verb} … ${sep.particle}${what}`, separable: sep };
      }
    }
  }
  const found = lookUp(files, keys, bare, "de", { initial });
  if (found) return found;
  return germanCompound(files, bare, compoundParts, { lemmaOf: table ? (p) => table.lookup(p) : null,
    rank: table ? rankOf(table) : () => 0, join: compoundLemma });
}

/** What a language's meanings files (`files`, the one to ask first first) have for `word`, tried by `keys`
 * (wordKeys): {...findIn's answer, source} or null. The word popup's lookup (../meanings.js).
 * German: `initial` says the word starts its sentence (see germanOrder). */
export function lookUp(files, keys, word, lang, { rank, initial = true } = {}) {
  if (lang === "de") {
    for (const data of files) {
      const hit = data && findIn(data, keys);
      if (hit) return { ...hit, groups: germanOrder(hit.groups, word, initial), source: data.source };
    }
    return null;
  }
  // A Tagalog or Bisaya word with a verb's affixes on it (nagbaton, kumain) is a verb: a dictionary
  // that knows its root as a verb wins over one that has only a noun of the same spelling (Wiktionary's
  // loanword "baton", where Wolff has báton "have, possess").
  const bare = String(word || "").replace(EDGE_PUNCT, "").toLowerCase();
  if ((lang === "ceb" || lang === "tl") && keys.length > 1 && VERB_AFFIX.test(bare)) {
    for (const data of files) {
      const hit = data && findIn(data, keys.slice(1));
      if (hit && hit.groups.some((g) => g[1] === "verb" && ordinary(g))) {
        const verbsFirst = [...hit.groups.filter((g) => g[1] === "verb"), ...hit.groups.filter((g) => g[1] !== "verb")];
        return { ...hit, groups: verbsFirst, source: data.source };
      }
    }
  }
  let found = null;
  for (const data of files) {
    const hit = data && findIn(data, keys);
    if (hit && hit.groups.some(ordinary)) return { ...hit, source: data.source };
    if (!found && hit) found = { ...hit, source: data.source };
  }
  // Bisaya: nothing of its own, only a name or the Tagalog word of that spelling (nahabilin, pagbantay), or an
  // English word reached only through the root finder's guess (mapalong -> along): the root the dictionaries
  // have, with its affixes taken off (cebuanoStems).
  const weak = (g) => g[1] === "name" || BORROWED_FROM_TAGALOG(g) || (found.key !== keys[0] && !ordinary(g));
  if (lang === "ceb" && keys[0] && (!found || found.groups.every(weak))) {
    // (a root is no little word, inila is ila "know", not nila "their"; a 3-letter one a verb or adjective)
    const rootish = (k) => (g) => ordinary(g) && !LITTLE.has(g[1]) && (k.length > 3 || g[1] === "verb" || g[1] === "adj");
    const has = (k) => files.some((data) => data && (data.words[k] || []).some(rootish(k)));
    // (the word, then the word without the linker it may carry: nagkalain-laing)
    const stem = [keys[0], ...cebuanoVariants(keys[0])].map((k) => cebuanoStems(k, has, rank)[0]).filter(Boolean)
      .sort((a, b) => b.key.length - a.key.length || a.rank - b.rank)[0];
    if (stem) {
      // Which dictionary's entry: for a verb form (moagi), the one with the root as a verb (agi "pass", not
      // Wolff's first agi, "oh my!"), verbs first; else Wiktionary's if it has the root as more than a little
      // word (Wolff lists a root's rare senses first as often as not: halayo is layo "far", not layo "broil
      // corn"; naila is ila "know", not ila "theirs"), else Wolff's. Little words last.
      // (nagka-/magka- make "becoming, various" of any word: nagkalain-laing is lain "different")
      const verb = VERB_AFFIX.test(keys[0]) && !/^[nm]agka/.test(keys[0]); // (keys[0]: without stress marks, miabút)
      const entries = files.filter(Boolean).map((data) => ({ data, groups: (data.words[stem.key] || []).filter(ordinary) }))
        .filter((e) => e.groups.length);
      const big = (e) => e.groups.some((g) => !LITTLE.has(g[1]));
      const pick = (verb && entries.find((e) => e.groups.some((g) => g[1] === "verb")))
        || entries.find((e) => !/Wolff/.test(e.data.source || "") && big(e)) || entries.find(big) || entries[0];
      // (a meaning Wolff gives only with another affix, "(pa-) change the subject", after the plain ones)
      const order = (g) => (verb && g[1] === "verb" ? 0 : LITTLE.has(g[1]) ? 2 : 1) + (/^\(/.test(g[2][0]) ? 0.5 : 0);
      const groups = [...pick.groups].sort((a, b) => order(a) - order(b));
      return { key: stem.key, groups, formOf: `form of ${groups[0][0]}`, source: pick.data.source, stripped: true };
    }
    // A Bisaya verb prefix on an English word, as people talk (mopost, gireply, mag-try): the English word.
    const taglish = !found && bare.match(TAGLISH);
    if (taglish) {
      const k = matchKey(taglish[2], lang);
      for (const data of files) {
        const groups = data && (data.words[k] || []).filter((g) => String(g[3] || "").split("|")[2] === "English word"
          && g[0].toLowerCase() === taglish[2]);
        if (groups && groups.length) {
          const verbsFirst = [...groups.filter((g) => g[1] === "verb"), ...groups.filter((g) => g[1] !== "verb")];
          return { key: k, groups: verbsFirst, formOf: `${taglish[1]}- + ${taglish[2]}`, source: data.source, stripped: true };
        }
      }
    }
  }
  return found;
}

/** The popup's answer (the shape definer.js gives) for what findIn found for `word`. */
export function answerFrom(found, word, lang, { quick = false, language = "English", source = "" } = {}) {
  if (found.parts) return compoundAnswer(found, word, { quick, language, source });
  const dict = dictionaryName(source);
  const first = found.groups[0];
  const [root = "", reading = "", dialect = ""] = String(first[3] || "").split("|");
  const glosses = [];
  for (const [, pos, list] of found.groups) for (const g of list) if (!glosses.some((x) => x.g === g)) glosses.push({ pos, g });
  const meaning = glosses[0].g;
  const same = matchKey(first[0], lang) === matchKey(String(word).replace(EDGE_PUNCT, ""), lang);
  // (Worked out here, not inside the sentence below: a pattern in the middle of it kept the
  // translation scanner, tools/i18n/extract.mjs, from reading the sentence whole, so it was never translated.)
  const inEnglish = /^english$/i.test(language) ? "" : ", in English";
  // German: the dictionary's spelling is shown when it differs from the word's other than by a capital
  // (Strasse: Straße, Häuser: Haus), and never replaces the word.
  const germanLemma = lang === "de" && first[0].toLowerCase() !== String(word).replace(EDGE_PUNCT, "").toLowerCase() ? first[0] : "";
  const answer = {
    word: word,
    // Arabic with its vowels and Russian with its stress replace the word as shown, only when it is that very word.
    // (Persian: how it is said, in Latin letters: ketâb.)
    vocalized: lang === "ja" || lang === "zh" || lang === "fa" ? reading : same && first[0] !== word && lang !== "de" ? first[0] : "",
    lemma: lang === "de" ? germanLemma : same ? "" : first[0],
    root,
    pos: first[1] || "",
    morphology: found.formOf || "",
    meaning,
    explanation: quick ? "" : `From the built-in dictionary (${dict}${inEnglish}): the word's usual meanings. It can't tell which one fits this sentence.`,
    other_meanings: quick ? [] : glosses.slice(1, 10).map((x) => (x.pos && x.pos !== first[1] ? `${x.g} (${x.pos})` : x.g)),
    dialect, dialect_note: "", msa_equivalent: "",
    sentence_translation: "", translation_marked: "", correction: "",
    provider: "dictionary", model: dict,
  };
  if (quick) answer.quick = true;
  return answer;
}

/** The popup's answer for a German compound with no entry of its own (germanCompound): the meaning is its
 * parts' first meanings joined (Handschuhfabrik: "glove + factory"), and each part's meanings follow. */
function compoundAnswer(found, word, { quick = false, language = "English", source = "" } = {}) {
  const dict = dictionaryName(source);
  const firstGloss = (p) => p.groups[0][2][0];
  const shown = found.parts.map((p) => p.groups[0][0]);
  const head = found.parts[found.parts.length - 1];
  const inEnglish = /^english$/i.test(language) ? "" : ", in English";
  const lemma = found.lemma && found.lemma !== String(word).replace(EDGE_PUNCT, "") ? found.lemma : "";
  const answer = {
    word,
    vocalized: "",
    lemma,
    root: shown.join(" + "),
    pos: head.groups[0][1] || "",
    morphology: found.formOf || "",
    meaning: found.parts.map(firstGloss).join(" + "),
    explanation: quick ? "" : `From the built-in dictionary (${dict}${inEnglish}): it has no entry for this compound word, so these are the meanings of its parts.`,
    other_meanings: quick ? [] : found.parts.map((p, i) => `${shown[i]}: ${p.groups.flatMap((g) => g[2]).slice(0, 3).join("; ")}`),
    dialect: "", dialect_note: "", msa_equivalent: "",
    sentence_translation: "", translation_marked: "", correction: "",
    provider: "dictionary", model: dict,
  };
  if (quick) answer.quick = true;
  return answer;
}
