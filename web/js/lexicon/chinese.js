// Chinese: from written text to words, each with its pinyin, in simplified or traditional characters.
//
// Chinese has no spaces, so a sentence can be cut into words in many ways. Every way is tried and
// the likeliest wins: each word costs more the rarer it is (how often it appears in real text,
// from wordfreq), and the cheapest cut through the sentence is kept (我们 / 在 / 学习 rather than
// 我 / 们在 / 学 / 习). Words come from CC-CEDICT, which also gives each word's pinyin and both
// ways of writing it: text in traditional characters (Taiwan, Hong Kong) is turned into simplified
// to be cut and recognised, so 學習 and 学习 are the same word, and can be shown either way.
// A few characters are both: CC-CEDICT lists 么 as an old form of 幺 and 著 of 着, yet 么 and 著 are
// everyday simplified characters (什么, 著名). Those are read both ways and the likelier word wins.
//
// The file (docs/lexicon/zh-cedict.json.gz, made by tools/build_cjk.py) holds:
//   words  {simplified word: [pinyin with tone numbers, how rare (centibels; 0 = unknown)]}
//   t2s    {traditional character: simplified}   only characters that differ
//   s2t    {simplified word: traditional}         words of 2+ characters that differ
//   s2tc   {simplified character: traditional}    the usual traditional form of a character
//
// No screen or network code here.

import { EDGE_PUNCT } from "../wordlookup.js";

const HAN = /[㐀-䶿一-鿿豈-﫿〇]|[\u{20000}-\u{3134f}]/u;
const WORDISH = /[\p{L}\p{N}]/u;
const MAX_WORD = 8; // characters: longer CC-CEDICT entries are idioms and names that cut fine without it

// What a word costs when wordfreq doesn't know it (a word at 1 in 10^8 costs 800).
const RARE_WORD = 850;
const RARE_CHAR = 900;
const UNKNOWN_CHAR = 1000;
const VARIANT = 150; // reading a character as an old variant of another (份 as 分): see forms()
const AS_SIMPLIFIED = 200; // reading a character of simplified-looking text as traditional (於 as 于)

export class ChineseDictionary {
  constructor(data) {
    if (!data || data.format !== 1 || data.kind !== "zh") throw new Error("This Chinese dictionary is from a different version of the app.");
    this.name = "zh";
    this.words = data.words;
    this.t2s = data.t2s || {};
    this.s2t = data.s2t || {};
    this.s2tc = data.s2tc || {};
    // Traditional characters that simplified words use as they are (么 in 什么, 份 in 一份).
    const used = new Set();
    for (const w of Object.keys(this.words)) for (const ch of w) used.add(ch);
    this.both = new Set(Object.keys(this.t2s).filter((ch) => used.has(ch)));
  }

  entry(simplified) {
    return Object.prototype.hasOwnProperty.call(this.words, simplified) ? this.words[simplified] : null;
  }

  /** Text in simplified characters, character for character (same length): 學習 -> 学习. Characters
   * that are also simplified (么, 著) are put in their likeliest form, as in the words they make. */
  simplify(text) {
    let out = "";
    const traditional = this.isTraditional(text);
    const re = /((?:[㐀-䶿一-鿿豈-﫿〇]|[\u{20000}-\u{3134f}])+)|([^])/gu;
    let m;
    while ((m = re.exec(String(text || "")))) {
      if (m[1]) for (const w of this.words_(m[1], traditional)) out += w.lemma;
      else out += m[0];
    }
    return out;
  }

  /** Is the text written in traditional characters? Yes when it has one that is only traditional (學, 說). */
  isTraditional(text) {
    for (const ch of String(text || "")) if (this.t2s[ch] && !this.both.has(ch)) return true;
    return false;
  }

  /** The simplified forms a character may stand for: [[form, extra cost], ...]. A character that is
   * also simplified (么, 著) may be either. In traditional text, taking it as an old variant (份 for
   * 分, which traditional writes 分 too) costs a little more than taking it as the traditional form of
   * a character (著 for 着). In simplified text it is as written unless that makes no word (於是 -> 于是). */
  forms(ch, traditional) {
    const s = this.t2s[ch];
    if (!s) return [[ch, 0]];
    if (!this.both.has(ch)) return [[s, 0]];
    if (!traditional) return [[ch, 0], [s, AS_SIMPLIFIED]];
    return [[s, (this.s2tc[s] || s) === ch ? 0 : VARIANT], [ch, 0]];
  }

  /** A run of Chinese characters cut into words: [{a, b, lemma}] (character indexes; the word in
   * simplified characters). The cheapest cut wins: see cut(). */
  words_(run, traditional = true) {
    const chars = Array.from(run);
    const options = chars.map((ch) => this.forms(ch, traditional));
    const n = chars.length;
    const best = new Float64Array(n + 1).fill(Infinity);
    const from = new Int32Array(n + 1);
    const lemma = new Array(n + 1);
    best[0] = 0;
    for (let i = 0; i < n; i++) {
      if (best[i] === Infinity) continue;
      let spellings = [["", 0]]; // [the word so far in simplified characters, its extra cost]
      for (let j = i; j < Math.min(n, i + MAX_WORD); j++) {
        spellings = spellings.flatMap(([w, x]) => options[j].map(([ch, y]) => [w + ch, x + y])).slice(0, 8);
        let c = Infinity;
        let found = null;
        for (const [w, extra] of spellings) {
          const e = this.entry(w);
          if (!e) continue;
          const cost = (e[1] || (j === i ? RARE_CHAR : RARE_WORD)) + extra;
          if (cost < c) { c = cost; found = w; }
        }
        if (found === null) {
          if (j !== i) continue;
          c = UNKNOWN_CHAR;
          found = spellings[0][0];
        }
        if (best[i] + c < best[j + 1]) { best[j + 1] = best[i] + c; from[j + 1] = i; lemma[j + 1] = found; }
      }
    }
    const out = [];
    for (let j = n; j > 0; j = from[j]) out.push({ a: from[j], b: j, lemma: lemma[j] });
    return out.reverse();
  }

  /** A word (in simplified characters) in traditional characters. */
  traditional(simplified) {
    if (this.s2t[simplified]) return this.s2t[simplified];
    let out = "";
    for (const ch of simplified) out += this.s2tc[ch] || ch;
    return out;
  }

  /** How a word is shown in `script` ("simplified", "traditional", or anything else = as written). */
  display(word, script) {
    if (script !== "simplified" && script !== "traditional") return word;
    const simp = this.simplify(word);
    if (script === "simplified") return simp;
    return simp === word || !HAN.test(word) ? this.traditional(simp) : word; // already traditional: keep it
  }

  /** The pinyin of a word, tone numbers per syllable ("ni3 hao3"), or "". */
  pinyin(word) {
    const e = this.entry(this.simplify(word));
    return e ? e[0] : "";
  }

  /** Cut a run of Chinese characters into words: [[from, to], ...] (character indexes). Every way
   * is tried and the cheapest wins: a word costs more the rarer it is (see words_()). */
  cut(text) {
    return this.words_(text).map((w) => [w.a, w.b]);
  }
}

/** The words of a text: [{text, index, lemma, pinyin}], covering all of it. `lemma` is the word in
 * simplified characters (what "seen" is kept by); spaces and punctuation have lemma "". Letters and
 * numbers in other scripts stay whole words. */
export function chineseWords(dict, text) {
  const s = String(text || "");
  const traditional = dict.isTraditional(s);
  const out = [];
  const re = /((?:[㐀-䶿一-鿿豈-﫿〇]|[\u{20000}-\u{3134f}])+)|([\p{L}\p{N}][\p{L}\p{N}'’.-]*[\p{L}\p{N}]|[\p{L}\p{N}])|(\s+)|([^])/gu;
  let m;
  while ((m = re.exec(s))) {
    const at = m.index;
    if (m[1]) {
      const run = m[1];
      const chars = Array.from(run);
      const units = [0]; // where each character starts in UTF-16 units
      for (const ch of chars) units.push(units[units.length - 1] + ch.length);
      for (const { a, b, lemma } of dict.words_(run, traditional)) {
        const e = dict.entry(lemma);
        out.push({ text: chars.slice(a, b).join(""), index: at + units[a], lemma, pinyin: e ? e[0] : "" });
      }
    } else if (m[2]) {
      out.push({ text: m[2], index: at, lemma: m[2].toLowerCase(), pinyin: "" });
    } else {
      out.push({ text: m[0], index: at, lemma: "", pinyin: "" });
    }
  }
  return out;
}

// ---------- pinyin with tone marks ----------
const MARKS = { a: "āáǎàa", e: "ēéěèe", i: "īíǐìi", o: "ōóǒòo", u: "ūúǔùu", ü: "ǖǘǚǜü" };

/** One syllable with a tone number ("hao3") as written with its mark ("hǎo"), and its tone (1-5). */
export function toneMark(syllable) {
  const m = String(syllable || "").match(/^([a-zü]+)([1-5])$/i);
  if (!m) return { text: String(syllable || ""), tone: 5 };
  const s = m[1].toLowerCase().replace(/v/g, "ü");
  const tone = Number(m[2]);
  if (tone === 5) return { text: s, tone };
  // The mark goes on a or e; on the o of ou; otherwise on the last vowel.
  let at = s.search(/[ae]/);
  if (at < 0) at = s.indexOf("ou");
  if (at < 0) for (let i = s.length - 1; i >= 0; i--) if ("iouü".includes(s[i])) { at = i; break; }
  if (at < 0) return { text: s, tone };
  return { text: s.slice(0, at) + MARKS[s[at]][tone - 1] + s.slice(at + 1), tone };
}

/** The syllables of a word's pinyin, one per character: [{text, tone}]. */
export function pinyinSyllables(pinyin) {
  return String(pinyin || "").split(/\s+/).filter(Boolean).map(toneMark);
}

export const isHan = (ch) => HAN.test(ch);
export const hasLetters = (s) => WORDISH.test(s);

/** The lexeme of one word as shown on screen: {key, lemma, pos, root}, or null for something that
 * isn't a word. Known by its simplified spelling, so 學習 and 学习 are one word. */
export function chineseLexeme(token, dict) {
  const core = String(token || "").normalize("NFC").replace(EDGE_PUNCT, "").toLowerCase();
  if (!/\p{L}/u.test(core)) return null;
  const words = chineseWords(dict, core).filter((w) => w.lemma);
  const lemma = words.length === 1 ? words[0].lemma : dict.simplify(core);
  return { key: `zh|${lemma}|x`, lemma, pos: "", root: "" };
}
