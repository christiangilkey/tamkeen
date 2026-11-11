// How a word is said, worked out on this device with no AI: for the free Mnemonic maker
// (review/freemnemonic.js), which needs the word's sounds to find English words that sound like it.
//
// The best source is Wiktionary's IPA for the word (in the language's examples file, docs/lexicon/
// <lang>-examples.json.gz). Without it the sounds come from the word's spelling, or from the reading the
// app already has (Japanese kana, Chinese pinyin, Korean, Thai and Hindi romanization, Arabic vowel marks),
// by the rules below: rough, but each language's letters are read the way that language reads them
// (Spanish "ll" as y, Italian "ci" as chi, German "sch" as sh...).
//
// The result has the AI's shape (mnemonic.js readPronunciation): {romanization, ipa, syllables: [{text, ipa}],
// stress}, so the rest of the Mnemonic maker is the same with or without AI.
//
// No page code: tested on its own (tests/js/soundout.test.mjs).

import { phones } from "./phonemes.js";

const VOWEL = /[aeiouyæøœɑɒɐɔəɛɜɞɤɨɪʊʉɯʌɘɵɶʏ]/;

// ---------------------------------------------------------------- syllables

const symbolOf = (p) => p.s + (p.long ? "ː" : "");

/**
 * IPA cut into syllables: {syllables: [{text, ipa}], stress}. Syllable marks (.) and stress marks (ˈ) in
 * the IPA are kept where they are; elsewhere a consonant between two vowels starts the next syllable, and
 * of two or more, the first ends the syllable before. `stress` is -1 when the IPA marks none.
 */
export function syllabify(ipa) {
  const ps = phones(ipa);
  if (!ps.length) return { syllables: [], stress: -1 };
  const vowel = (p) => VOWEL.test(p.s);
  const marked = ps.some((p, i) => i > 0 && p.boundary);
  const groups = [];
  if (marked) {
    for (const p of ps) {
      if (!groups.length || p.boundary) groups.push([]);
      groups[groups.length - 1].push(p);
    }
  }
  // Groups without a vowel join the one before (a word's last consonant written apart); groups with two
  // vowels apart are cut again by the rule.
  const cut = (list) => {
    const out = [];
    const nuclei = list.map((p, i) => (vowel(p) && !(i > 0 && vowel(list[i - 1]) && !p.boundary && (p.s === "j" || p.s === "w")) ? i : -1)).filter((i) => i >= 0);
    // two vowels side by side are two syllables (a-i), unless the second is a glide
    if (nuclei.length <= 1) return [list];
    let start = 0;
    for (let k = 0; k + 1 < nuclei.length; k++) {
      const a = nuclei[k], b = nuclei[k + 1];
      const between = b - a - 1;
      // one consonant starts the next syllable; of two, the first ends this one, unless the two can start a
      // syllable together (br, pl, tr: o-bri-ga-do)
      const together = between === 2 && /^[pbtdkɡfv]$/.test(list[a + 1].s) && /^[rɾɹlʁ]$/.test(list[a + 2].s);
      const at = between <= 1 ? b - between : together ? a + 1 : a + 2;
      out.push(list.slice(start, at));
      start = at;
    }
    out.push(list.slice(start));
    return out.filter((g) => g.length);
  };
  let list = marked ? groups.flatMap((g) => (g.filter(vowel).length > 1 ? cut(g) : [g])) : cut(ps);
  const merged = [];
  for (const g of list) {
    if (!g.some(vowel) && merged.length) merged[merged.length - 1].push(...g);
    else if (!g.some(vowel) && !merged.length) merged.push(g);
    else if (merged.length && !merged[merged.length - 1].some(vowel)) merged[merged.length - 1].push(...g);
    else merged.push(g);
  }
  list = merged;
  const stress = list.findIndex((g) => g.some((p) => p.stress));
  return {
    syllables: list.map((g) => ({ text: respell(g), ipa: g.map(symbolOf).join("") })),
    stress: list.length > 1 ? stress : -1,
  };
}

// How an English speaker might write each sound, for the syllables shown ("ka-BA-yo").
const SPELL = { ʃ: "sh", ʒ: "zh", tʃ: "ch", dʒ: "j", θ: "th", ð: "dh", x: "kh", χ: "kh", ɣ: "gh", ħ: "h", ʕ: "'", ʔ: "'",
  j: "y", ŋ: "ng", ɲ: "ny", ʎ: "ly", ɾ: "r", ɹ: "r", ʁ: "r", ʀ: "r", ɻ: "r", ɡ: "g", ç: "h", ɕ: "sh", ʑ: "zh", tɕ: "ch",
  dʑ: "j", tʂ: "ch", dʐ: "j", ʂ: "sh", ʐ: "r", ts: "ts", dz: "dz", β: "b", ɸ: "f", ʋ: "v", ɥ: "w", q: "q", ɖ: "d", ʈ: "t",
  ɳ: "n", ɭ: "l", c: "k", ɟ: "g", ɰ: "w", ʝ: "y", ɦ: "h", ɽ: "r", ɴ: "n",
  æ: "a", ɑ: "a", ɐ: "a", ɒ: "o", ɔ: "o", ə: "uh", ɛ: "e", ɜ: "er", ɪ: "i", ʊ: "u", ʌ: "u", ɨ: "i", ʉ: "u", ɯ: "u",
  ɤ: "uh", y: "ü", ø: "ö", œ: "ö", ʏ: "ü", ɘ: "e", ɵ: "o", ɶ: "ö" };
function respell(group) {
  return group.map((p) => {
    const s = SPELL[p.s] ?? p.s;
    return p.long ? (VOWEL.test(p.s) ? s + s.slice(-1) : s + s.slice(-1)) : s;
  }).join("");
}

/** Sounds (phonemes.js phones) as an English speaker might write them: for a part of a word (review/wordpart.js). */
export const respellPhones = (group) => respell(group);

// ---------------------------------------------------------------- spelling rules

// [letters, IPA], tried longest first at each place; `before`: a vowel letter must come next.
function rules(text, list, { vowels = "aeiouáéíóúàèìòùâêîôûãõäöüy" } = {}) {
  const s = text;
  let out = "";
  for (let i = 0; i < s.length;) {
    let hit = null;
    for (const r of list) {
      const [from, to, test] = r;
      if (s.startsWith(from, i) && (!test || test(s, i, from.length, vowels))) { hit = [from, to]; break; }
    }
    if (hit) { out += hit[1]; i += hit[0].length; continue; }
    out += s[i++];
  }
  return out;
}
const beforeFront = (s, i, n) => /[eiéíèìêîy]/.test(s[i + n] || "");
const betweenVowels = (s, i, n, v) => i > 0 && v.includes(s[i - 1]) && v.includes(s[i + n] || "");
const atEnd = (s, i, n) => i + n >= s.length || !/\p{L}/u.test(s[i + n]);
const atStart = (s, i) => i === 0 || !/\p{L}/u.test(s[i - 1]);

// Bisaya in Wolff's spelling (lexicon/meaningdata.js wolffSpelling), by his introduction, 3.0-3.22. Only his spelling
// shows which vowels are long, so his rule is used only for it (today's spelling keeps the penult rule below).

/** Wolff's spelling to IPA: a grave says a glottal stop follows its vowel (bàbà is baʔbaʔ, walà walaʔ), and two vowels
 * side by side have one between them (maáyo is maʔayo, kaon kaʔon); his other marks only say where the stress is.
 * Two consonants between vowels belong to two syllables, even dl, br, pl (tudlò is tud.loʔ, its penult closed). */
function wolffIpa(spelled) {
  const s = String(spelled).normalize("NFD").toLowerCase()
    .replace(/([aeiou])(\p{M}*)/gu, (all, v, marks) => v + (marks.includes("̀") ? "ʔ" : ""))
    .replace(/\p{M}/gu, "") // (above: a grave; here every other mark goes)
    .replace(/([aeiou])(?=[aeiou])/g, "$1ʔ");
  return rules(s, TAGALOG).replace(/([aeiou][pbtdkgfv])([ɾl])(?=[aeiou])/g, "$1.$2");
}

/** Which syllable Wolff's spelling stresses: the long vowel's (his acute: hátag, lamísa, maáyo), or a last one his wedge
 * marks (mandǎr); else the last but one when it is closed (tan-aw, bàbà, bantay) and the last when it is open and short
 * (palit, mala, walà). A phrase's stress is its last word's, as for other languages. */
function wolffStress(syl, spelled) {
  const n = syl.length;
  if (n < 2) return -1;
  const words = String(spelled).normalize("NFD").toLowerCase().split(/\s+/).filter(Boolean);
  const last = words.pop() || "";
  const before = (words.join(" ").match(/[aeiou]/g) || []).length; // (each vowel is a syllable: maáyo is ma-a-yo)
  let v = -1;
  for (const ch of last) {
    if (/[aeiou]/.test(ch)) v++;
    else if ((ch === "́" || ch === "̌") && v >= 0) return Math.min(n - 1, before + v); // (acute, wedge)
  }
  return VOWEL.test(syl[n - 2].slice(-1)) ? n - 1 : n - 2;
}

// Stress by the usual rule of the language, given the syllables (as IPA) and the written word. `wolff`: a Bisaya word
// in Wolff's spelling (wolffStress).
function placeStress(syl, lang, word, { wolff = false } = {}) {
  const n = syl.length;
  if (n < 2) return -1;
  if (lang === "ceb" && wolff) return wolffStress(syl, word);
  const accent = /[áéíóúàèìòùâêô]/;
  if (["es", "it", "pt", "ca", "tl", "ceb", "la"].includes(lang)) {
    // A written accent says where the stress is: count the vowel groups up to it.
    const plain = word.toLowerCase();
    const at = plain.search(accent);
    if (at >= 0 && lang !== "ca" || (lang === "ca" && /[àèéíòóú]/.test(plain))) {
      const groups = plain.slice(0, (lang === "ca" ? plain.search(/[àèéíòóú]/) : at) + 1).match(/[aeiouáéíóúàèìòùâêîôûãõü]+/g) || [];
      return Math.min(n - 1, groups.length - 1);
    }
    if (lang === "es") return /[aeiouns]$/.test(plain) ? n - 2 : n - 1;
    if (lang === "pt") return /([iu]s?|[lrz]|ão|ãos|om|ons|im|ins|um|uns)$/.test(plain) ? n - 1 : n - 2;
    if (lang === "ca") return /([aeiou]s?|en|in)$/.test(plain) ? n - 2 : n - 1;
    if (lang === "la") return n >= 3 && !/[āēīōū]/.test(plain.slice(0, -2).slice(-4)) ? n - 3 : n - 2;
    return n - 2;
  }
  if (lang === "de") return n >= 3 && /^(be|ge|ver|er|zer|ent|emp)/.test(word.toLowerCase()) ? 1 : 0;
  if (lang === "fr" || lang === "fa" || lang === "th" || lang === "tr") return n - 1;
  if (lang === "ar") {
    // the last heavy syllable of the last three (CVː or CVC), not counting the last; else the third from the end
    const heavy = (s) => /ː/.test(s) || !VOWEL.test(s.slice(-1));
    if (n >= 2 && heavy(syl[n - 2])) return n - 2;
    return n >= 3 ? n - 3 : 0;
  }
  if (lang === "hi") return n >= 2 && /ː/.test(syl[n - 2]) ? n - 2 : 0;
  return 0;
}

const SPANISH = [["ch", "tʃ"], ["ll", "j"], ["rr", "r"], ["qu", "k"], ["gu", "ɡ", beforeFront], ["gü", "ɡw"], ["ñ", "ɲ"],
  ["c", "s", beforeFront], ["c", "k"], ["g", "x", beforeFront], ["j", "x"], ["h", ""], ["z", "s"], ["v", "b"], ["y", "i", atEnd],
  ["y", "j"], ["x", "ks"], ["r", "r", atStart], ["r", "ɾ"], ["á", "a"], ["é", "e"], ["í", "i"], ["ó", "o"], ["ú", "u"], ["ü", "u"]];
const ITALIAN = [["gli", "ʎi"], ["gn", "ɲ"], ["sci", "ʃi"], ["sce", "ʃe"], ["sc", "sk"], ["chi", "ki"], ["che", "ke"], ["ghi", "ɡi"],
  ["ghe", "ɡe"], ["cia", "tʃa"], ["cio", "tʃo"], ["ciu", "tʃu"], ["gia", "dʒa"], ["gio", "dʒo"], ["giu", "dʒu"], ["ci", "tʃi"],
  ["ce", "tʃe"], ["gi", "dʒi"], ["ge", "dʒe"], ["qu", "kw"], ["c", "k"], ["zz", "tts"], ["z", "ts"], ["h", ""], ["j", "j"],
  ["s", "z", betweenVowels], ["r", "r"], ["à", "a"], ["è", "ɛ"], ["é", "e"], ["ì", "i"], ["ò", "ɔ"], ["ó", "o"], ["ù", "u"]];
const PORTUGUESE = [["ção", "sɐ̃w"], ["ções", "sõjs"], ["ão", "ɐ̃w"], ["ãe", "ɐ̃j"], ["õe", "õj"], ["lh", "ʎ"], ["nh", "ɲ"], ["ch", "ʃ"],
  ["rr", "x"], ["ss", "s"], ["qu", "k", beforeFront], ["gu", "ɡ", beforeFront], ["qu", "kw"], ["ç", "s"], ["c", "s", beforeFront],
  ["c", "k"], ["g", "ʒ", beforeFront], ["j", "ʒ"], ["x", "ʃ"], ["h", ""], ["s", "z", betweenVowels], ["r", "x", atStart], ["r", "ɾ"],
  ["o", "u", atEnd], ["os", "us", atEnd], ["e", "i", atEnd], ["es", "is", atEnd], ["am", "ɐ̃w", atEnd], ["em", "ẽj", atEnd],
  ["im", "ĩ", atEnd], ["om", "õ", atEnd], ["um", "ũ", atEnd], ["á", "a"], ["â", "ɐ"], ["ã", "ɐ̃"], ["é", "ɛ"], ["ê", "e"],
  ["í", "i"], ["ó", "ɔ"], ["ô", "o"], ["õ", "õ"], ["ú", "u"]];
const CATALAN = [["ny", "ɲ"], ["l·l", "ll"], ["ll", "ʎ"], ["ix", "ʃ"], ["tx", "tʃ"], ["tj", "dʒ"], ["tg", "dʒ"], ["ig", "tʃ", atEnd],
  ["qu", "k", beforeFront], ["gu", "ɡ", beforeFront], ["qu", "kw"], ["ç", "s"], ["c", "s", beforeFront], ["c", "k"],
  ["g", "ʒ", beforeFront], ["j", "ʒ"], ["x", "ʃ", atStart], ["x", "ks"], ["h", ""], ["ss", "s"], ["s", "z", betweenVowels],
  ["rr", "r"], ["r", "", atEnd], ["r", "r", atStart], ["r", "ɾ"], ["v", "b"], ["a", "ə", atEnd], ["es", "əs", atEnd],
  ["e", "ə", atEnd], ["à", "a"], ["è", "ɛ"], ["é", "e"], ["í", "i"], ["ò", "ɔ"], ["ó", "o"], ["ú", "u"], ["ï", "i"], ["ü", "u"]];
const FRENCH = [["eaux", "o"], ["eau", "o"], ["aux", "o"], ["ain", "ɛ̃"], ["ein", "ɛ̃"], ["oin", "wɛ̃"], ["ien", "jɛ̃"],
  ["ille", "ij"], ["ail", "aj"], ["eil", "ɛj"], ["au", "o"], ["ou", "u"], ["oi", "wa"], ["ai", "ɛ"], ["ei", "ɛ"], ["eu", "ø"],
  ["œu", "ø"], ["ch", "ʃ"], ["gn", "ɲ"], ["qu", "k"], ["ph", "f"], ["th", "t"], ["ç", "s"], ["c", "s", beforeFront], ["c", "k"],
  ["ge", "ʒ"], ["gi", "ʒi"], ["g", "ɡ"], ["j", "ʒ"], ["h", ""], ["ss", "s"], ["s", "z", betweenVowels], ["an", "ɑ̃", (s, i) => !/[aeiouyn]/.test(s[i + 2] || "")],
  ["am", "ɑ̃", (s, i) => !/[aeiouym]/.test(s[i + 2] || "")], ["en", "ɑ̃", (s, i) => !/[aeiouyn]/.test(s[i + 2] || "")],
  ["em", "ɑ̃", (s, i) => !/[aeiouym]/.test(s[i + 2] || "")], ["on", "ɔ̃", (s, i) => !/[aeiouyn]/.test(s[i + 2] || "")],
  ["om", "ɔ̃", (s, i) => !/[aeiouym]/.test(s[i + 2] || "")], ["in", "ɛ̃", (s, i) => !/[aeiouyn]/.test(s[i + 2] || "")],
  ["un", "œ̃", (s, i) => !/[aeiouyn]/.test(s[i + 2] || "")], ["e", "ɛ", (s, i) => /^[bcdfgklmnprstvz]{2}/.test(s.slice(i + 1)) && !/^(nt|s$)/.test(s.slice(i + 1))],
  ["ll", "l"], ["tt", "t"], ["ss", "s"], ["nn", "n"], ["mm", "m"], ["rr", "ʁ"], ["er", "e", atEnd], ["ez", "e", atEnd], ["es", "", atEnd],
  ["ent", "", atEnd], ["e", "", atEnd], ["s", "", atEnd], ["t", "", atEnd], ["d", "", atEnd], ["x", "", atEnd], ["z", "", atEnd],
  ["p", "", atEnd], ["r", "ʁ"], ["u", "y"], ["é", "e"], ["è", "ɛ"], ["ê", "ɛ"], ["ë", "ɛ"], ["à", "a"], ["â", "ɑ"], ["î", "i"],
  ["ï", "i"], ["ô", "o"], ["û", "y"], ["ù", "y"], ["e", "ə"], ["y", "i"]];
const GERMAN = [["tsch", "tʃ"], ["ng", "ŋ"], ["sch", "ʃ"], ["sp", "ʃp", atStart], ["st", "ʃt", atStart], ["ch", "x", (s, i) => /[aou]/.test(s[i - 1] || "")],
  ["chs", "ks"], ["ch", "ç"], ["ck", "k"], ["ei", "aj"], ["ai", "aj"], ["ie", "iː"], ["eu", "ɔj"], ["äu", "ɔj"], ["au", "aw"],
  ["ph", "f"], ["th", "t"], ["qu", "kv"], ["ß", "s"], ["ss", "s"], ["tz", "ts"], ["z", "ts"], ["w", "v"], ["v", "f"], ["j", "j"],
  ["s", "z", (s, i, n, v) => v.includes(s[i + 1] || "") && (i === 0 || v.includes(s[i - 1]))],
  ["ig", "ɪç", atEnd], ["b", "p", atEnd], ["d", "t", atEnd], ["g", "k", atEnd], ["er", "ɐ", atEnd], ["en", "ən", atEnd],
  ["el", "əl", atEnd], ["e", "ə", atEnd], ["ah", "aː"], ["eh", "eː"], ["ih", "iː"], ["oh", "oː"], ["uh", "uː"], ["äh", "ɛː"],
  ["öh", "øː"], ["üh", "yː"], ["aa", "aː"], ["ee", "eː"], ["oo", "oː"], ["h", "h", atStart], ["h", ""], ["ä", "ɛ"], ["ö", "ø"],
  ["ü", "y"], ["r", "ʁ"], ["y", "y"]];
const LATIN = [["ae", "e"], ["oe", "e"], ["au", "aw"], ["qu", "kw"], ["gu", "ɡw", (s, i) => /[aeiou]/.test(s[i + 2] || "")],
  ["ch", "k"], ["ph", "f"], ["th", "t"], ["sc", "ʃ", beforeFront], ["c", "tʃ", (s, i) => /[eiy]|ae|oe/.test(s.slice(i + 1, i + 3))],
  ["c", "k"], ["g", "dʒ", beforeFront], ["gn", "ɲ"], ["ti", "tsi", (s, i) => /[aeiou]/.test(s[i + 2] || "") && i > 0],
  ["x", "ks"], ["j", "j"], ["v", "v"], ["h", ""], ["y", "i"], ["z", "dz"], ["s", "z", betweenVowels],
  ["ā", "aː"], ["ē", "eː"], ["ī", "iː"], ["ō", "oː"], ["ū", "uː"]];
const TAGALOG = [["ng", "ŋ"], ["ny", "ɲ"], ["ts", "tʃ"], ["c", "k"], ["j", "dʒ"], ["y", "j"], ["-", "ʔ"], ["r", "ɾ"], ["ñ", "ɲ"]];
const RUSSIAN = { а: "a", б: "b", в: "v", г: "ɡ", д: "d", е: "je", ё: "jo", ж: "ʒ", з: "z", и: "i", й: "j", к: "k", л: "l", м: "m",
  н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "x", ц: "ts", ч: "tʃ", ш: "ʃ", щ: "ʃː", ъ: "", ы: "ɨ", ь: "",
  э: "e", ю: "ju", я: "ja" };
const KOREAN = [["yeo", "jʌ"], ["eo", "ʌ"], ["eu", "ɯ"], ["ae", "ɛ"], ["yae", "jɛ"], ["oe", "we"], ["wae", "wɛ"], ["ui", "ɰi"],
  ["ya", "ja"], ["yo", "jo"], ["yu", "ju"], ["ye", "je"], ["ng", "ŋ"], ["ch", "tʃ"], ["j", "dʒ"], ["kk", "kː"], ["tt", "tː"],
  ["pp", "pː"], ["ss", "sː"], ["r", "ɾ"], ["g", "ɡ"]];
const THAI = [["aa", "aː"], ["ii", "iː"], ["uu", "uː"], ["ee", "eː"], ["ɛɛ", "ɛː"], ["oo", "oː"], ["ɔɔ", "ɔː"], ["ʉʉ", "ɯː"],
  ["əə", "əː"], ["ʉ", "ɯ"], ["ng", "ŋ"], ["bp", "p"], ["dt", "t"], ["ph", "p"], ["th", "t"], ["kh", "k"], ["ch", "tʃ"], ["j", "tʃ"],
  ["y", "j"], ["r", "ɾ"]];
const HINDI = [["aa", "aː"], ["ā", "aː"], ["ii", "iː"], ["ī", "iː"], ["uu", "uː"], ["ū", "uː"], ["ai", "ɛː"], ["au", "ɔː"], ["e", "eː"],
  ["o", "oː"], ["chh", "tʃ"], ["ch", "tʃ"], ["sh", "ʃ"], ["ṣ", "ʃ"], ["ś", "ʃ"], ["kh", "k"], ["gh", "ɡ"], ["th", "t"], ["dh", "d"],
  ["ph", "f"], ["bh", "b"], ["jh", "dʒ"], ["j", "dʒ"], ["ṭ", "ʈ"], ["ḍ", "ɖ"], ["ṇ", "n"], ["ṅ", "ŋ"], ["ñ", "n"], ["ṃ", "n"],
  ["ṛ", "ɽ"], ["y", "j"], ["v", "ʋ"], ["r", "ɾ"], ["ṁ", "n"], ["g", "ɡ"]];
const JAPANESE = [["kya", "kja"], ["kyu", "kju"], ["kyo", "kjo"], ["sha", "ʃa"], ["shu", "ʃu"], ["sho", "ʃo"], ["shi", "ʃi"], ["chi", "tʃi"],
  ["cha", "tʃa"], ["chu", "tʃu"], ["cho", "tʃo"], ["tsu", "tsu"], ["nya", "ɲa"], ["nyu", "ɲu"], ["nyo", "ɲo"], ["hya", "çja"],
  ["mya", "mja"], ["rya", "ɾja"], ["ryu", "ɾju"], ["ryo", "ɾjo"], ["gya", "ɡja"], ["gyu", "ɡju"], ["gyo", "ɡjo"], ["ja", "dʒa"],
  ["ju", "dʒu"], ["jo", "dʒo"], ["ji", "dʒi"], ["fu", "ɸu"], ["r", "ɾ"], ["y", "j"], ["g", "ɡ"], ["u", "ɯ"], ["n'", "n"]];
// Chinese: pinyin, one syllable at a time. Initials as an English speaker hears them (b is English b,
// unaspirated p; zh like "j").
const PINYIN_INITIAL = [["zh", "dʒ"], ["ch", "tʃ"], ["sh", "ʃ"], ["r", "ɻ"], ["z", "dz"], ["c", "ts"], ["j", "dʑ"], ["q", "tɕ"],
  ["x", "ɕ"], ["b", "b"], ["p", "p"], ["d", "d"], ["t", "t"], ["g", "ɡ"], ["k", "k"], ["h", "x"], ["m", "m"], ["f", "f"], ["n", "n"],
  ["l", "l"], ["w", "w"], ["y", "j"], ["s", "s"]];
const PINYIN_FINAL = { a: "a", o: "wo", e: "ɤ", i: "i", u: "u", ü: "y", v: "y", ai: "aj", ei: "ej", ao: "aw", ou: "ow", an: "an",
  en: "ən", ang: "aŋ", eng: "əŋ", ong: "ʊŋ", ia: "ja", ie: "jɛ", iao: "jaw", iu: "jow", ian: "jɛn", in: "in", iang: "jaŋ",
  ing: "iŋ", iong: "jʊŋ", ua: "wa", uo: "wo", uai: "waj", ui: "wej", uan: "wan", un: "wən", uang: "waŋ", ue: "ɥɛ", üe: "ɥɛ",
  ve: "ɥɛ", er: "ɚ", ün: "yn", üan: "ɥɛn" };
// One pinyin syllable (xièxie is xie + xie); a final n or ng isn't taken when a vowel follows (fangan: fan + gan).
const PINYIN_SYLLABLE = /(?:zh|ch|sh|[bpmfdtnlgkhjqxrzcsyw])?(?:iang|iong|uang|ueng|ang|eng|ing|ong|ian|iao|uai|uan|üan|van|ai|ao|an|ei|en|er|ia|ie|in|iu|ou|ua|ue|üe|ve|ui|un|ün|uo|a|e|i|o|u|ü|v)(?![aeiouüv])/g;
function pinyinIpa(text) {
  const plain = String(text).normalize("NFD").replace(/[̀-ͯ]/g, (c) => (c === "̈" ? c : "")).normalize("NFC").toLowerCase().replace(/[1-5]/g, " ");
  const syllables = plain.split(/[\s'’-]+/).filter(Boolean).flatMap((part) => part.match(PINYIN_SYLLABLE) || [part]);
  return syllables.map((syl) => {
    let ini = "", rest = syl;
    const hit = PINYIN_INITIAL.find(([p]) => syl.startsWith(p));
    if (hit) { ini = hit[1]; rest = syl.slice(hit[0].length); }
    if ((ini === "j" || ini === "w") && rest) { // y, w only spell a final: yi = i, wu = u, yu = ü, ye = ie
      const y = ini === "j";
      ini = "";
      rest = y ? (rest.startsWith("u") ? "ü" + rest.slice(1) : rest.startsWith("i") ? rest : "i" + rest)
        : (rest.startsWith("u") ? rest : "u" + rest);
    }
    if (["dʑ", "tɕ", "ɕ"].includes(ini) && rest.startsWith("u")) rest = "ü" + rest.slice(1);
    let fin = PINYIN_FINAL[rest] ?? rest;
    if (rest === "i" && ["dz", "ts", "s", "dʒ", "tʃ", "ʃ", "ɻ"].includes(ini)) fin = "ɨ";
    return ini + fin;
  }).join(".");
}

const HIRAGANA = "ぁあぃいぅうぇえぉおかがきぎくぐけげこごさざしじすずせぜそぞただちぢっつづてでとどなにぬねのはばぱひびぴふぶぷへべぺほぼぽまみむめもゃやゅゆょよらりるれろゎわゐゑをんゔ";
const ROMAJI = ["a", "a", "i", "i", "u", "u", "e", "e", "o", "o", "ka", "ga", "ki", "gi", "ku", "gu", "ke", "ge", "ko", "go", "sa", "za",
  "shi", "ji", "su", "zu", "se", "ze", "so", "zo", "ta", "da", "chi", "ji", "Q", "tsu", "zu", "te", "de", "to", "do", "na", "ni", "nu",
  "ne", "no", "ha", "ba", "pa", "hi", "bi", "pi", "fu", "bu", "pu", "he", "be", "pe", "ho", "bo", "po", "ma", "mi", "mu", "me", "mo",
  "ya", "ya", "yu", "yu", "yo", "yo", "ra", "ri", "ru", "re", "ro", "wa", "wa", "i", "e", "o", "N", "vu"];
const SMALL = { ゃ: "ya", ゅ: "yu", ょ: "yo", ぁ: "a", ぃ: "i", ぅ: "u", ぇ: "e", ぉ: "o" };
/** Kana (hiragana or katakana) in Latin letters: きって → kitte, とうきょう → tōkyō written tookyoo. */
export function kanaRomaji(kana) {
  const hira = Array.from(String(kana ?? "")).map((c) => {
    const code = c.charCodeAt(0);
    return code >= 0x30a1 && code <= 0x30f6 ? String.fromCharCode(code - 0x60) : c;
  });
  let out = "";
  for (let i = 0; i < hira.length; i++) {
    const c = hira[i], next = hira[i + 1];
    if (c === "ー") { out += out.slice(-1); continue; }
    const k = HIRAGANA.indexOf(c);
    if (k < 0) { out += /\p{L}/u.test(c) ? "" : " "; continue; }
    let r = ROMAJI[k];
    if (SMALL[next] && /[iI]$/.test(r) && /[ゃゅょ]/.test(next)) { r = r.slice(0, -1) + SMALL[next]; if (/^(shi|chi|ji)/.test(ROMAJI[k])) r = ROMAJI[k].slice(0, -1) + SMALL[next].slice(1); i++; }
    else if (SMALL[next] && /[ぁぃぅぇぉ]/.test(next) && r.length > 1) { r = r.slice(0, -1) + SMALL[next]; i++; }
    out += r;
  }
  // っ doubles the next consonant; ん is n
  return out.replace(/Q([a-z])/g, "$1$1").replace(/Q/g, "").replace(/N/g, "n");
}

// Arabic letters (with or without vowel marks).
const AR = { ب: "b", ت: "t", ث: "θ", ج: "dʒ", ح: "ħ", خ: "x", د: "d", ذ: "ð", ر: "r", ز: "z", س: "s", ش: "ʃ", ص: "s", ض: "d",
  ط: "t", ظ: "ð", ع: "ʕ", غ: "ɣ", ف: "f", ق: "q", ك: "k", ل: "l", م: "m", ن: "n", ه: "h", ء: "ʔ", أ: "ʔ", إ: "ʔ", ؤ: "ʔ", ئ: "ʔ",
  پ: "p", چ: "tʃ", ژ: "ʒ", گ: "ɡ", ڤ: "v", ک: "k" };
const SUN = new Set(Array.from("تثدذرزسشصضطظلن"));
/** Arabic (or Persian) spelling to IPA. With vowel marks it is read as written; without them, a short a
 * is guessed after each consonant that isn't followed by a long vowel (Persian: a short a or e). */
function arabicIpa(text, lang) {
  // (a phrase is read a word at a time: each word's own first letter, article and ending)
  const words = String(text).trim().split(/\s+/u).filter(Boolean);
  return words.length > 1 ? words.map((w) => arabicWordIpa(w, lang)).filter(Boolean).join(".") : arabicWordIpa(text, lang);
}
function arabicWordIpa(word, lang) {
  const chars = Array.from(String(word).normalize("NFC").replace(/ـ/g, ""));
  const marked = chars.some((c) => /[ًٌٍَُِْ]/.test(c));
  let out = "", guessed = false;
  const isLetter = (c) => c && (AR[c] !== undefined || "اويىةیآ".includes(c));
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i], next = chars[i + 1];
    if (c === "ا" || c === "ى" || c === "آ") {
      if (c === "آ") { out += "ʔaː"; continue; }
      if (i === 0) { // the article al-, or a first vowel
        if (next === "ل" && chars.length > 3 && lang === "ar") {
          const third = chars[2];
          out += SUN.has(third) && third !== "ل" ? "a" : "al";
          i++;
          continue;
        }
        out += "ʔa";
        continue;
      }
      // (the alef written after a verb's plural و says nothing: تاهوا is taahuu)
      if (c === "ا" && lang === "ar" && !marked && i === chars.length - 1 && chars[i - 1] === "و" && i >= 3) continue;
      out += lang === "fa" ? "ɒː" : "aː";
      continue;
    }
    if (c === "ة") { out += "a"; continue; }
    if (c === "و" || c === "ي" || c === "ی") {
      const prevVowel = /[aiuːeoɒ]$/.test(out);
      const markNext = /[َُِ]/.test(next || "");
      if (i === 0 || markNext || (prevVowel && !marked && !/ː$/.test(out) && isLetter(next) && false)) {
        out += c === "و" ? (lang === "fa" ? "v" : "w") : "j";
        // (no vowel marks: a first و or ي before a consonant carries a short a, as و "and" does: وتاهوا is wa-taahuu)
        if (i === 0 && !marked && chars.length > 2 && AR[next] !== undefined) out += "a";
        continue;
      }
      if (marked && /[َ]$/.test(chars[i - 1] || "")) { out += c === "و" ? "w" : "j"; continue; }
      out += c === "و" ? "uː" : "iː";
      continue;
    }
    if (c === "َ") { out += "a"; continue; }
    if (c === "ِ") { out += lang === "fa" ? "e" : "i"; continue; }
    if (c === "ُ") { out += lang === "fa" ? "o" : "u"; continue; }
    if (c === "ً") { out += "an"; continue; }
    if (c === "ٍ") { out += "in"; continue; }
    if (c === "ٌ") { out += "un"; continue; }
    if (c === "ّ") { const m = /([^aiuːeoɒ])$/.exec(out); if (m) out += m[1]; continue; }
    if (c === "ْ" || c === "ٰ") { if (c === "ٰ") out += "aː"; continue; }
    if (AR[c] !== undefined) {
      out += AR[c];
      // No vowel marks: a short vowel after a consonant followed by another consonant (kataba: k a t a b).
      // (a consonant after a guessed vowel closes the syllable: mustashfa is m-a-s t-a-ʃ f-aː, not m-a-s-a-t-a…)
      if (!marked && isLetter(next) && !"اويیىة".includes(next) && i < chars.length - 1 && !guessed) { out += "a"; guessed = true; continue; }
      guessed = false;
      continue;
    }
  }
  return out;
}

/** Spelling (or a reading in Latin letters) to IPA by the language's rules. */
export function spellingIpa(text, lang) {
  const w = String(text ?? "").normalize("NFC").toLowerCase().trim();
  if (!w) return "";
  switch (lang) {
    case "es": return rules(w, SPANISH);
    case "it": return rules(w, ITALIAN);
    case "pt": return rules(w, PORTUGUESE);
    case "ca": return rules(w, CATALAN);
    case "fr": return rules(w, FRENCH);
    case "de": return rules(w, GERMAN);
    case "la": return rules(w.replace(/j/g, "i").replace(/(?<=[aeiouāēīōū]|^)i(?=[aeiouāēīōū])/g, "j"), LATIN);
    case "tl": case "ceb": return rules(w, TAGALOG);
    case "ru": {
      // Unstressed o is said a; е, я after a consonant soften it (said like e, a).
      const stressAt = w.indexOf("́");
      let out = "";
      const letters = Array.from(w.normalize("NFD"));
      let vowelIndex = 0;
      for (let i = 0; i < letters.length; i++) {
        const c = letters[i];
        if (c === "́") { out += ""; continue; }
        let r = RUSSIAN[c] ?? (/\p{L}/u.test(c) ? c : "");
        const stressed = letters[i + 1] === "́";
        if (/[еёюя]/.test(c) && i > 0 && !/[аеёиоуыэюяъь]/.test(letters[i - 1])) r = r.slice(1);
        if (c === "о" && stressAt >= 0 && !stressed) r = "a";
        if (stressed) {
          // the mark goes before the consonant that starts the stressed syllable (sa-ˈba-ka)
          const m = /(tʃ|ts|ʃː|[bvɡdʒzjklmnprstfxʃ])$/.exec(out);
          if (m) out = out.slice(0, -m[1].length) + "ˈ" + m[1];
          else r = "ˈ" + r;
        }
        if (/[аеёиоуыэюя]/.test(c)) vowelIndex++;
        out += r;
      }
      return out;
    }
    case "ko": return rules(w, KOREAN);
    case "th": return rules(w.normalize("NFD").replace(/[̀-ͯ]/g, "").normalize("NFC"), THAI);
    case "hi": return rules(w, HINDI);
    case "ja": return rules(/[぀-ヿ]/.test(w) ? kanaRomaji(w) : w, JAPANESE);
    case "zh": return pinyinIpa(w);
    case "ar": case "fa": return arabicIpa(text, lang);
    default: return w;
  }
}

/**
 * How the word is said, with no AI: {romanization, ipa, syllables, stress, from} like mnemonic.js
 * readPronunciation's, or null. `ipa` is Wiktionary's when the examples file has the word (from: "wiktionary"),
 * `reading` what the app's dictionaries give (kana, pinyin, a romanization; Arabic with vowel marks; Bisaya in Wolff's
 * spelling, examples.js freePronunciation), else the spelling is read by the language's rules (from: "rules").
 */
export function pronunciationOf({ word, lang, ipa = "", reading = "" }) {
  const w = String(word ?? "").trim();
  if (!w) return null;
  let said = String(ipa || "").trim(), from = "wiktionary";
  if (said.startsWith("py:")) { said = pinyinIpa(said.slice(3)); from = "wiktionary"; }
  if (lang === "la") said = said.replace(/ʷ/g, "w");  // (aqua: kw, not k)
  if (lang === "ja") said = said.replace(/ɨ/g, "ɯ").replace(/ɴ/g, "n");  // (Wiktionary writes Japanese u as a barred i)
  // A Bisaya reading is Wolff's spelling (the app has no other): his marks and his stress rule (wolffStress).
  const wolff = lang === "ceb" && /\p{Script=Latin}/u.test(reading);
  if (!said) {
    from = "rules";
    const source = lang === "ar" || lang === "fa" ? (reading || w) : (reading || w);
    said = wolff ? wolffIpa(reading) : spellingIpa(source, lang);
  }
  if (!said) return null;
  const cut = syllabify(said);
  if (!cut.syllables.length) return null;
  let stress = cut.stress;
  if (stress < 0 && from === "rules") stress = placeStress(cut.syllables.map((s) => s.ipa), lang, reading && /\p{Script=Latin}/u.test(reading) ? reading : w, { wolff });
  // Japanese, Chinese and Korean have no word stress to show.
  if (["ja", "zh", "ko"].includes(lang)) stress = -1;
  return { romanization: cut.syllables.map((s) => s.text).join(""), ipa: said.replace(/^\/|\/$/g, ""), syllables: cut.syllables, stress, from };
}
