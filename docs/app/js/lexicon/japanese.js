// Japanese: from written text to the words a learner taps, each with its dictionary form and reading.
//
// The tokenizer (./kuromoji.js) cuts text into the pieces grammar books call morphemes: 食べました is
// 食べ + まし + た. A learner thinks of that as one word, a form of 食べる, so the pieces are put back
// together here:
//   - a verb or adjective takes the endings and helpers that follow it: auxiliaries (ます, た, ない,
//     たい, れる), the joining て/で/ば, and dependent verbs and adjectives after it (食べている,
//     食べてしまう, 食べやすい): its dictionary form is the verb's own (食べる);
//   - a prefix joins the word after it (お茶), and a suffix the noun before it (日本人, 田中さん);
//   - particles (は, を, に) and the copula (だ, です after a noun) stay words of their own.
// Each piece keeps its reading, for furigana: only the kanji get one (食[た]べた).
//
// No screen or network code here.

import { tokenize } from "./kuromoji.js";
import { EDGE_PUNCT } from "../wordlookup.js";

const KANJI = /[㐀-䶿一-鿿豈-﫿々〆ヶ]/u;
const LETTER = /[\p{L}\p{N}]/u;

/** Katakana to hiragana. */
export function hiragana(s) {
  return String(s || "").replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

// Readings IPADIC gives that learners and most speakers don't use.
const READING = { 日本: "ニホン", 日本人: "ニホンジン", 日本語: "ニホンゴ" };

const chainHead = (g) => g.kind === "verb" || g.kind === "adj" || g.kind === "aux";
const isCopula = (t) => t.pos === "助動詞" && (t.basic === "だ" || t.basic === "です");

function kindOf(t) {
  if (t.pos === "動詞") return "verb";
  if (t.pos === "形容詞") return "adj";
  if (t.pos === "助動詞") return "aux";
  if (t.pos === "名詞") return t.pos1 === "数" ? "number" : "noun";
  if (t.pos === "接頭詞") return "prefix";
  if (t.pos === "記号" || !LETTER.test(t.surface)) return "punct";
  return "other";
}

/** Does token `t` belong to the word `g` that comes before it? */
function joins(g, t) {
  const last = g.tokens[g.tokens.length - 1];
  if (g.kind === "punct" || !LETTER.test(t.surface)) return false;
  if (g.kind === "prefix") return t.pos === "名詞" || t.pos === "動詞" || t.pos === "形容詞";
  if (chainHead(g)) {
    if (t.pos === "助動詞") return !isCopula(t) || last.pos === "助動詞"; // 食べませんでした, not 高いです
    if (t.pos === "助詞" && t.pos1 === "接続助詞") return ["て", "で", "ば", "ちゃ", "じゃ"].includes(t.surface);
    if (t.pos === "動詞" && (t.pos1 === "非自立" || t.pos1 === "接尾")) return true;
    if (t.pos === "形容詞" && t.pos1 === "非自立") return true;
    return false;
  }
  if (g.kind === "noun") return t.pos === "名詞" && t.pos1 === "接尾" && t.pos2 !== "助数詞";
  return false;
}

function finish(g) {
  const head = g.tokens.find((t) => t.pos !== "接頭詞") || g.tokens[0];
  const before = g.tokens.slice(0, g.tokens.indexOf(head)).map((t) => t.surface).join("");
  const surface = g.tokens.map((t) => t.surface).join("");
  let lemma;
  if (head.pos === "動詞" || head.pos === "形容詞") lemma = before + head.basic;
  else if (g.tokens.length === 1) lemma = head.basic || head.surface;
  else if (head.pos === "助動詞") lemma = head.basic;
  else lemma = surface;
  return { text: surface, index: g.tokens[0].start, lemma, kind: g.kind === "prefix" ? kindOf(head) : g.kind,
    parts: g.tokens.map((t) => ({ text: t.surface, reading: hiragana(READING[t.surface] || t.reading || "") })) };
}

/** The words of a text: [{text, index, lemma, kind, parts: [{text, reading}]}], covering all of it
 * (spaces and punctuation come out as words of kind "punct"). */
export function japaneseWords(dict, text) {
  const out = [];
  let g = null;
  for (const t of tokenize(dict, String(text || ""))) {
    if (g && joins(g, t)) { g.tokens.push(t); continue; }
    if (g) out.push(finish(g));
    g = { kind: kindOf(t), tokens: [t] };
  }
  if (g) out.push(finish(g));
  return out;
}

/**
 * Furigana for one piece: [[text, reading or ""], ...]. Only kanji get a reading; the kana written
 * around them are matched against the reading so they don't (食べ, たべ -> 食[た] べ).
 */
export function furigana(text, reading) {
  text = String(text || "");
  reading = hiragana(reading);
  if (!KANJI.test(text) || !reading) return [[text, ""]];
  // Runs of kanji and of everything else.
  const runs = [];
  for (const ch of text) {
    const k = KANJI.test(ch);
    if (runs.length && runs[runs.length - 1].kanji === k) runs[runs.length - 1].text += ch;
    else runs.push({ kanji: k, text: ch });
  }
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^${runs.map((r) => (r.kanji ? "(.+?)" : `(${esc(hiragana(r.text))})`)).join("")}$`, "u");
  const m = reading.match(re);
  if (!m) return [[text, reading]]; // a reading that doesn't fit the spelling: over the whole piece
  return runs.map((r, i) => [r.text, r.kanji ? m[i + 1] : ""]);
}

// Lexemes of one dictionary, by spelling: a transcript says the same words again and again.
const known = new WeakMap();

/** The lexeme of one word as shown on screen: {key, lemma, pos, root}, or null for something that
 * isn't a word. A word the tokenizer reads as one word is known by its dictionary form
 * (食べました -> ja|食べる|x); anything else by its spelling, as before there was a dictionary. */
export function japaneseLexeme(token, dict) {
  const core = String(token || "").normalize("NFC").replace(EDGE_PUNCT, "").toLowerCase();
  if (!/\p{L}/u.test(core)) return null;
  let cache = known.get(dict);
  if (!cache) known.set(dict, (cache = new Map()));
  if (!cache.has(core)) {
    const words = japaneseWords(dict, core).filter((w) => w.kind !== "punct");
    const lemma = words.length === 1 ? words[0].lemma : core;
    if (cache.size > 50000) cache.clear();
    cache.set(core, { key: `ja|${lemma}|x`, lemma, pos: "", root: "" });
  }
  return { ...cache.get(core) };
}
