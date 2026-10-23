// Hindi: how a word is said (a simple romanization drawn over Hindi text, and given in the word popup),
// and which dictionary word a form belongs to, so every form of a word counts as one word.
//
// Hindi is written in Devanagari with spaces between words. A word's letters are consonants that carry
// the vowel "a" unless a vowel sign (matra: ा ि ी ु ू े ै ो ौ), a virama (्, no vowel: the consonant
// joins the next one in a conjunct, क्ष, प्र) or a nukta (़: ज़ z, फ़ f, ड़ ṛ) changes them, and nasal
// signs (ं anusvara, ँ chandrabindu). Those signs are Unicode "marks", not letters, so nothing here cuts
// a word at them: a word is everything between spaces and punctuation (the full stop । included).
//
// READINGS. romanize() writes a word the way it is said, in the style of most Hindi textbooks: long vowels
// with a line (ā ī ū), retroflex sounds with a dot (ṭ ḍ ṇ ṛ), "ch"/"chh" and "sh" as an English reader
// expects, ज्ञ as it is said (gy: ज्ञान gyān), a nasal vowel with a tilde (में mẽ, हैं haĩ, हूँ hū̃).
// Spoken Hindi drops the vowel "a" that the spelling implies in many places (कमरा is kamrā, not kamarā;
// समझना samajhnā): the usual rule takes it off at the end of a word (except after a group of consonants
// ending in य, र or व: मित्र mitra, राज्य rājya) and between two consonants that have a vowel on each side
// (V C _ C V), worked from the end of the word. That matches English Wiktionary's romanization of 98.8% of
// the 1000 commonest Hindi words and 90.4% of the 30,000 commonest (measured 2026-10-21; the rest are
// mostly compounds, Sanskrit words that keep their a, and spellings without the nukta of a Persian sound).
// The downloaded word table carries Wiktionary's reading for the words where the rule says something else
// (`readings`), and those win.
//
// FORMS. With the word table (docs/lexicon/hi-lemmas.json.gz, made by tools/build_hindi.py from the
// inflection tables of English Wiktionary's Hindi entries, ranked by wordfreq counts), a form is looked
// up directly: लड़कों, किताबें, करता, किया, करूँगा, बड़ी. A form the table lacks has its ending taken
// off by the rules below (plural and oblique endings of nouns, adjective endings, the verb's -ता/-ती/-ते,
// -ना/-ने/-नी, -कर/-के, -ूँगा/-ेगा…, -या/-ए/-ई) and is given the commonest result the table knows as a
// dictionary word. Without the table a word is known by its spelling (and the few irregular verbs below).
//
// Lookups match a spelling with its everyday variants folded together (hindiKey): with or without nukta
// (ज़रूर / जरूर), chandrabindu or anusvara (हूँ / हूं), a nasal letter with a virama before a stop or the
// anusvara that stands for it today (हिन्दी / हिंदी, सम्बन्ध / संबंध: the old books use the first), and
// ये / यी after a consonant or a vowel sign written as ए / ई (गये / गए, लिये / लिए, नयी / नई).
// No screen or network code here: tests/js/hindi.test.mjs.

import { EDGE_PUNCT } from "../wordlookup.js";

// ---------- letters ----------
const VIRAMA = "\u{94D}";
const NUKTA = "\u{93C}";
const ANUSVARA = "\u{902}";
const CHANDRABINDU = "\u{901}";
const VISARGA = "\u{903}";
const AVAGRAHA = "\u{93D}";
const JOINERS = /[\u{200C}\u{200D}]/gu; // zero-width (non-)joiners: they only change how a conjunct is drawn

const CONSONANTS = {
  "क": "k", "ख": "kh", "ग": "g", "घ": "gh", "ङ": "ṅ",
  "च": "ch", "छ": "chh", "ज": "j", "झ": "jh", "ञ": "ñ",
  "ट": "ṭ", "ठ": "ṭh", "ड": "ḍ", "ढ": "ḍh", "ण": "ṇ",
  "त": "t", "थ": "th", "द": "d", "ध": "dh", "न": "n", "ऩ": "n",
  "प": "p", "फ": "ph", "ब": "b", "भ": "bh", "म": "m",
  "य": "y", "र": "r", "ऱ": "r", "ल": "l", "ळ": "ḷ", "ऴ": "ḷ", "व": "v",
  "श": "sh", "ष": "sh", "स": "s", "ह": "h",
};
// With a nukta under them: sounds from Persian, Arabic and English, and the flapped ड़ ढ़.
const NUKTA_CONSONANTS = { "क": "q", "ख": "kh", "ग": "gh", "ज": "z", "झ": "zh", "फ": "f", "ड": "ṛ", "ढ": "ṛh", "य": "y", "र": "r", "न": "n" };
// (Written as one letter with its nukta: क़ ख़ ग़ ज़ ड़ ढ़ फ़ य़. NFC writes them as letter + nukta.)
const VOWELS = { "अ": "a", "आ": "ā", "इ": "i", "ई": "ī", "उ": "u", "ऊ": "ū", "ऋ": "ri", "ॠ": "rī", "ऌ": "li", "ए": "e", "ऐ": "ai",
  "ओ": "o", "औ": "au", "ऑ": "ô", "ऍ": "ê", "ऎ": "e", "ऒ": "o" };
// The vowel signs (matras) ा ि ी ु ू ृ ॄ ॢ े ै ो ौ ॉ ॅ ॆ ॊ, by code point (they are drawn on their letter).
const SIGNS = { "\u{93E}": "ā", "\u{93F}": "i", "\u{940}": "ī", "\u{941}": "u", "\u{942}": "ū", "\u{943}": "ri", "\u{944}": "rī",
  "\u{962}": "li", "\u{947}": "e", "\u{948}": "ai", "\u{94B}": "o", "\u{94C}": "au", "\u{949}": "ô", "\u{945}": "ê", "\u{946}": "e",
  "\u{94A}": "o" };
const DIGITS = "०१२३४५६७८९";
// Where the mouth closes for each stop, for an anusvara before it (हिंदी hindī, संबंध sambandh, ठंडा ṭhaṇḍā,
// करेंगे kareṅge). Before न and म themselves the vowel is said through the nose (मैंने maĩne, उन्होंने unhõne).
const PLACE = {};
for (const c of "कखगघ") PLACE[c] = "ṅ";
for (const c of "चछजझ") PLACE[c] = "ñ";
for (const c of "टठडढ") PLACE[c] = "ṇ";
for (const c of "तथदध") PLACE[c] = "n";
for (const c of "पफबभ") PLACE[c] = "m";

const TILDE = "\u{303}"; // (combining tilde)
/** A vowel said through the nose: a tilde on it (on the second letter of ai and au: haĩ, aũ). */
const nasal = (v) => (v + TILDE).normalize("NFC");

const DEVANAGARI = /[\u{900}-\u{97F}]/u;
/** Is there Devanagari in this text? */
export const hasDevanagari = (text) => DEVANAGARI.test(String(text ?? ""));

/**
 * The word split into its sounds: {c: "k"} a consonant, {v: "ā"} a vowel ({inherent: true}: the a a consonant
 * carries), {nasal: "anusvara" | "chandrabindu"} on the vowel before, {raw: "x"} anything else.
 */
function sounds(word) {
  const out = [];
  const chars = Array.from(String(word).normalize("NFC").replace(JOINERS, ""));
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (CONSONANTS[ch] !== undefined) {
      let roman = CONSONANTS[ch];
      if (chars[i + 1] === NUKTA) { roman = NUKTA_CONSONANTS[ch] || roman; i++; }
      // ज्ञ is said "gy" in Hindi (ज्ञान gyān, विशेषज्ञ visheshagya)
      if (ch === "ज" && chars[i + 1] === VIRAMA && chars[i + 2] === "ञ") { out.push({ c: "g", letter: ch }); roman = "y"; i += 2; }
      out.push({ c: roman, letter: ch });
      const next = chars[i + 1];
      if (next === VIRAMA) { i++; continue; }
      if (SIGNS[next] !== undefined) { out.push({ v: SIGNS[next] }); i++; continue; }
      out.push({ v: "a", inherent: true });
      continue;
    }
    if (VOWELS[ch] !== undefined) { out.push({ v: VOWELS[ch] }); continue; }
    if (ch === ANUSVARA) { out.push({ nasal: "anusvara" }); continue; }
    if (ch === CHANDRABINDU) { out.push({ nasal: "chandrabindu" }); continue; }
    if (ch === VISARGA) { out.push({ c: "ḥ", visarga: true }); continue; }
    if (ch === AVAGRAHA || ch === NUKTA || ch === VIRAMA) continue;
    if (ch === "ॐ") { out.push({ v: "o" }, { c: "m" }); continue; }
    if (ch === "॰") { out.push({ raw: "." }); continue; } // the abbreviation mark: टी॰वी॰ ṭī.vī.
    const d = DIGITS.indexOf(ch);
    out.push({ raw: d >= 0 ? String(d) : ch });
  }
  return out;
}

const isV = (s) => !!s && s.v !== undefined;
const isC = (s) => !!s && s.c !== undefined;

/** What an anusvara at list[i] is said as before the sound after it: a nasal consonant ("ṅ", "n", "m"...),
 * or "" when it makes the vowel before it nasal. */
function anusvaraSound(list, i) {
  const after = list[i + 1];
  if (!after || list[i].nasal !== "anusvara") return "";
  if (after.letter && PLACE[after.letter]) return PLACE[after.letter]; // हिंदी hindī, करेंगे kareṅge
  if (/^(?:s|sh|r)$/.test(after.c || "")) return "n"; // संसार sansār, संरक्षण sanrakshaṇ
  if (after.c === "v") return "m"; // संवाद samvād
  return "";
}

/** Take off the "a" Hindi doesn't say (see the top of the file), in one word's sounds. */
function dropSchwas(list) {
  // An anusvara said as a consonant is one here (ज़िंदगी zindagī: the a after "nd" stays); a nasal vowel's
  // mark is neither consonant nor vowel and is left out.
  const at = list.map((s, i) => (!s.nasal || anusvaraSound(list, i) ? i : -1)).filter((i) => i >= 0);
  const seq = at.map((i) => (list[i].nasal ? { c: anusvaraSound(list, i), fromNasal: true } : list[i]));
  const nasalised = (k) => { const n = list[at[k] + 1]; return !!(n && n.nasal && !anusvaraSound(list, at[k] + 1)); };
  const vowels = seq.filter(isV).length;
  // At the end of the word: gone, unless it is the word's only vowel (न na), a nasal mark follows, it comes
  // after a group of consonants ending in य, र or व (राज्य rājya, मित्र mitra, विश्व vishva, यज्ञ yagya;
  // not र्व: पूर्व pūrv) or after -इय / -ईय (प्रिय priya, भारतीय bhārtīya).
  const last = seq.length - 1;
  if (last >= 1 && seq[last].inherent && vowels > 1 && !nasalised(last)) {
    const c1 = seq[last - 1];
    const c2 = seq[last - 2];
    const group = isC(c1) && isC(c2) && !c2.fromNasal && "yrv".includes(c1.c) && !(c1.c === "v" && c2.c === "r"); // (गांव gāmv)
    const iya = c1.c === "y" && isV(c2) && (c2.v === "i" || c2.v === "ī");
    if (!(group || iya)) seq[last].dropped = true;
  }
  // In the middle: V C _ C V, from the end of the word towards its start. (Worked from the start instead,
  // it agreed with Wiktionary less often: 89.4% against 90.6% of the 30,000 commonest spellings.)
  const vowelAt = (k) => isV(seq[k]) && !seq[k].dropped;
  for (let k = seq.length - 2; k >= 2; k--) {
    const s = seq[k];
    if (!s.inherent || s.dropped || nasalised(k)) continue; // (a nasal a stays: हँसना hãsnā)
    if (isC(seq[k - 1]) && vowelAt(k - 2) && isC(seq[k + 1]) && !seq[k + 1].visarga && vowelAt(k + 2)) s.dropped = true;
  }
}

/** How a Hindi word (or text) is said, in Latin letters: "किताबें" -> "kitābẽ". Letters that aren't
 * Devanagari are kept as they are. */
export function romanize(text) {
  const all = sounds(String(text ?? ""));
  // Each run of Devanagari is a word of its own for the "a" rules.
  let run = [];
  const flush = () => { if (run.length) dropSchwas(run); run = []; };
  for (const s of all) {
    if (s.raw !== undefined) flush();
    else run.push(s);
  }
  flush();
  let out = "";
  for (let i = 0; i < all.length; i++) {
    const s = all[i];
    if (s.raw !== undefined) { out += s.raw; continue; }
    if (s.c !== undefined) { out += s.c; continue; }
    if (s.nasal || s.dropped) continue; // (a nasal mark is written with the vowel before it, below)
    const n = all[i + 1];
    if (!n || !n.nasal) { out += s.v; continue; }
    // Anusvara before a stop is that stop's own nasal (हिंदी hindī), before स/श/र an n (संसार sansār),
    // before व an m (संवाद samvād); at the end after a it is m (एवं evam). Anywhere else, and chandrabindu
    // always, the vowel is said through the nose (में mẽ, हैं haĩ, हूँ hū̃, हँसना hãsnā).
    const after = all[i + 2];
    const consonant = anusvaraSound(all, i + 1);
    if (consonant) out += s.v + consonant;
    else if (n.nasal === "anusvara" && s.v === "a" && !isC(after) && !isV(after)) out += "am";
    else out += nasal(s.v);
  }
  return out;
}

// ---------- spellings ----------

/** The word as written, ready to look up: NFC, no joiners, punctuation (। included) off its ends. */
export function hindiWord(token) {
  return String(token ?? "").normalize("NFC").replace(JOINERS, "").replace(EDGE_PUNCT, "").toLowerCase();
}

/** The spelling with its everyday variants folded together, for matching (see the top of the file).
 * Must agree with key() for "hi" in tools/build_meanings.py and tools/build_hindi.py. */
export function hindiKey(word) {
  // (no nukta; chandrabindu as anusvara; a nasal with a virama before क-भ as anusvara, the older spelling
  // of books, हिन्दी सम्बन्ध, as today's हिंदी संबंध; ये / यी after a letter क-ह or a vowel sign ा-ौ as ए / ई)
  return hindiWord(word).replace(/\u{93C}/gu, "").replace(/\u{901}/gu, "\u{902}")
    .replace(/[\u{919}\u{91E}\u{923}\u{928}\u{92E}]\u{94D}(?=[\u{915}-\u{918}\u{91A}-\u{91D}\u{91F}-\u{922}\u{924}-\u{927}\u{92A}-\u{92D}])/gu, "\u{902}")
    .replace(/(?<=[\u{915}-\u{939}\u{93E}-\u{94C}])\u{92F}\u{947}/gu, "\u{90F}")
    .replace(/(?<=[\u{915}-\u{939}\u{93E}-\u{94C}])\u{92F}\u{940}/gu, "\u{908}");
}

// ---------- forms ----------
// Endings taken off a form the table doesn't know. Verbs: the dictionary form is the infinitive in -ना,
// made from the stem left. Nouns and adjectives: the direct singular, from the endings in NOUN_ENDINGS.
const VERB_ENDINGS = [
  // futures and wishes: करूँगा करेंगे करोगी करें करो करूँ
  "ूँगा", "ूँगी", "ूंगा", "ूंगी", "ेंगे", "ेंगी", "ेगा", "ेगी", "ोगे", "ोगी", "ूँ", "ूं", "ें", "ो", "े",
  // participles and the infinitive: करता करती करते करतीं, करना करने करनी
  "ता", "ती", "ते", "तीं", "ना", "ने", "नी", "नीं",
  // done: बताया बताई बताए (खाया, पाया: the stem ends in its vowel)
  "या", "ये", "यी", "ई", "ईं", "ए", "ीं",
  // having done: करके, कर; one who does: करनेवाला
  "कर", "के", "नेवाला", "नेवाली", "नेवाले",
];
const NOUN_ENDINGS = [
  ["ियों", ["ी", "ि"]], ["ियाँ", ["ी", "ि"]], ["ियां", ["ी", "ि"]], ["ुओं", ["ु", "ू"]], ["ुएँ", ["ु", "ू"]], ["ुएं", ["ु", "ू"]],
  ["ाओं", ["ा"]], ["ाएँ", ["ा"]], ["ाएं", ["ा"]], ["ों", ["ा", "", "ो"]], ["ें", [""]], ["ो", ["ा", ""]], ["े", ["ा"]],
  ["ी", ["ा"]], ["ीं", ["ा"]], ["ओं", [""]], ["एँ", [""]], ["एं", [""]],
];
// Irregular verbs: forms of जाना, करना, देना, लेना, होना, पीना that the endings can't lead back to.
const IRREGULAR = {
  "गया": "जाना", "गयी": "जाना", "गई": "जाना", "गये": "जाना", "गए": "जाना", "गईं": "जाना", "गयीं": "जाना",
  "किया": "करना", "किये": "करना", "किए": "करना", "कीजिए": "करना", "कीजिये": "करना",
  "दिया": "देना", "दिये": "देना", "दिए": "देना", "दीजिए": "देना", "दीजिये": "देना", "दूँ": "देना", "दूं": "देना",
  "दूँगा": "देना", "दूंगा": "देना", "दूँगी": "देना", "दूंगी": "देना",
  "लिया": "लेना", "लीजिए": "लेना", "लीजिये": "लेना", "लूँ": "लेना", "लूं": "लेना", "लूँगा": "लेना", "लूंगा": "लेना", "लूँगी": "लेना",
  "हुआ": "होना", "हुई": "होना", "हुए": "होना", "हुये": "होना", "हुईं": "होना", "हूँ": "होना", "हूं": "होना", "हैं": "होना", "है": "होना",
  "था": "होना", "थे": "होना", "थी": "होना", "थीं": "होना",
  "पिया": "पीना", "पिये": "पीना", "पिए": "पीना", "पीजिए": "पीना",
};

const ranks = new WeakMap(); // table -> folded dictionary word -> its place in the table (commonest first)
function rankOf(table) {
  let r = ranks.get(table);
  if (!r) {
    r = new Map();
    table.lemmas.forEach((w, i) => { const k = hindiKey(w); if (!r.has(k)) r.set(k, i); });
    ranks.set(table, r);
  }
  return r;
}
const folded = new WeakMap(); // table -> folded form -> its dictionary word
function formsOf(table) {
  let m = folded.get(table);
  if (!m) {
    m = new Map();
    for (const [form, i] of Object.entries(table.forms || {})) { const k = hindiKey(form); if (!m.has(k)) m.set(k, table.lemmas[i]); }
    folded.set(table, m);
  }
  return m;
}

/** The dictionary word a table gives a spelling (a form of it, or the word itself), or "". The spelling
 * as written first, then with its variants folded (भाई is "brother", not भायी, a form of भाना). */
function known(word, table) {
  const own = table.lookup(word);
  if (own) return own;
  const k = hindiKey(word);
  const f = formsOf(table).get(k);
  if (f) return f;
  const r = rankOf(table);
  return r.has(k) ? table.lemmas[r.get(k)] : "";
}

/** Dictionary forms the endings suggest for a word (each to be checked against the table). */
export function hindiCandidates(word) {
  const w = hindiWord(word);
  const out = [];
  const add = (c) => { if (c && c !== w && Array.from(c).length >= 2 && !out.includes(c)) out.push(c); };
  if (IRREGULAR[w]) add(IRREGULAR[w]);
  for (const end of VERB_ENDINGS) {
    if (!w.endsWith(end) || w.length <= end.length) continue;
    const stem = w.slice(0, -end.length);
    if (/[\u{915}-\u{939}\u{93C}\u{93E}-\u{94C}]$/u.test(stem)) add(`${stem}ना`); // (a stem ends in a letter, nukta or vowel sign)
  }
  for (const [end, bases] of NOUN_ENDINGS) {
    if (!w.endsWith(end) || w.length <= end.length) continue;
    const stem = w.slice(0, -end.length);
    for (const b of bases) add(stem + b);
  }
  return out;
}

/** The dictionary form of a Hindi word: the table's (directly, or through the endings), else the word. */
export function hindiLemma(token, table) {
  const word = hindiWord(token);
  if (!table) return IRREGULAR[word] || word;
  const direct = known(word, table);
  if (direct) return direct;
  if (IRREGULAR[word]) return IRREGULAR[word];
  // The commonest dictionary word the endings lead to.
  const r = rankOf(table);
  let best = -1;
  for (const c of hindiCandidates(word)) {
    const k = hindiKey(c);
    if (r.has(k) && (best < 0 || r.get(k) < best)) best = r.get(k);
  }
  return best >= 0 ? table.lemmas[best] : word;
}

/** The lexeme of one Hindi word: {key, lemma, pos, root}, or null for something that isn't a word. */
export function hindiLexeme(token, table = null) {
  const word = hindiWord(token);
  if (!/\p{L}/u.test(word)) return null;
  const lemma = hindiLemma(word, table);
  return { key: `hi|${hindiKey(lemma)}|x`, lemma, pos: "", root: "" };
}

// ---------- readings ----------

/** Readings: the rules, and Wiktionary's reading where it differs (the word table's `readings`, if loaded). */
export class HindiReadings {
  constructor(table = null) {
    this.exact = new Map(); // as written
    this.own = new Map(); // with the variants folded (hindiKey): the first spelling's
    for (const [w, r] of Object.entries((table && table.readings) || {})) {
      this.exact.set(w, r);
      if (!this.own.has(hindiKey(w))) this.own.set(hindiKey(w), r);
    }
  }

  /** How a word is said ("" for something with no Devanagari). Punctuation round it is left out. */
  word(token) {
    const w = hindiWord(token);
    if (!hasDevanagari(w)) return "";
    return this.exact.get(w) || this.own.get(hindiKey(w)) || romanize(w);
  }

  /** How a word or a text is said, word by word. */
  reading(text) {
    const t = String(text ?? "").trim();
    if (!hasDevanagari(t)) return "";
    return t.split(/\s+/).map((part) => (hasDevanagari(part) ? this.word(part) : part)).filter(Boolean).join(" ");
  }
}

/** The reading of a word or text with the rules alone (no table). */
export const hindiReading = (text) => new HindiReadings().reading(text);
