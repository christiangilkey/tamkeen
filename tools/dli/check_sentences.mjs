// Check the sentences written for a DLI deck (tools/dli/DECKS.md), chapter by chapter.
//
//   node tools/dli/check_sentences.mjs <lang>                  every chapter: what is written, what is wrong
//   node tools/dli/check_sentences.mjs <lang> c010 c011        only these chapters
//   node tools/dli/check_sentences.mjs <lang> --todo c010      the words to write for chapter c010
//   (--content <folder>: another content folder; default ../dli-content beside the repository;
//    --deck <id>: a language's other deck, e.g. ar-icpt; default its first, the basic deck)
//
// Errors (exit code 1) are things that must be fixed; warnings are worth a second look (a marked word that
// shares little with the deck's word may be a typo, or just a form that changes a lot, like Korean 하다 → 해요).

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const LIMIT = { zh: 40 };
const MAX_CHARS = 100;
const ENDS = /[.!?。！？؟…][)"'»”’」』]*$/u;
const MARKS = /⟦([^⟦⟧]*)⟧/gu;
const HARAKAT = /[ً-ْٰ]/gu;
const AR_LETTER = /[ء-ي]/gu;
const plain = (s) => String(s || "").replace(/[⟦⟧]/gu, "");

/** The deck's word as candidates to look for: alternatives split at "/", grammar marks and brackets dropped. */
export function candidates(word) {
  return String(word || "").split(/[\/／]/u).flatMap((part) => {
    const bare = part.replace(/\([^)]*\)|（[^）]*）|[~～↑]/gu, " ").replace(/\s+/gu, " ").trim();
    const noArticle = bare.replace(/^(el|la|los|las|un|una|lo)\s+/iu, "");
    return [...new Set([bare, noArticle])].filter(Boolean);
  });
}

/** Letters to compare, per language: no vowel marks, one form for letters written several ways. */
export function letters(text, lang) {
  let t = String(text || "").normalize("NFC").toLowerCase();
  if (lang === "ar" || lang === "fa") {
    t = t.replace(HARAKAT, "").replace(/ـ/gu, "").replace(/[إأآٱ]/gu, "ا").replace(/ى/gu, "ي").replace(/ی/gu, "ي")
      .replace(/ک/gu, "ك").replace(/ة/gu, "ه").replace(/[ؤئ]/gu, "ء").replace(/‌/gu, "");
  }
  if (lang === "es") t = t.normalize("NFD").replace(/\p{M}/gu, "").normalize("NFC");
  return t.replace(/[^\p{L}\p{N}]/gu, "");
}

/** Does the marked part look like the deck's word? Shares the start (es), a syllable (ko), a character (zh),
 *  or most of its letters (ar, fa: a root changes its shape but keeps its letters). */
export function looksLike(marked, word, lang) {
  const m = letters(marked, lang);
  return candidates(word).some((c) => {
    const w = letters(c, lang);
    if (!w || !m) return false;
    if (m.includes(w) || w.includes(m)) return true;
    if (lang === "es") return m.slice(0, 3) === w.slice(0, 3);
    if (lang === "zh" || lang === "ko") return [...w].some((ch) => m.includes(ch));
    const need = new Set([...w].filter((ch) => !"اوي".includes(ch)));
    const have = [...need].filter((ch) => m.includes(ch)).length;
    return need.size ? have >= Math.min(need.size, Math.max(2, Math.ceil(need.size * 0.6))) : false;
  });
}

const SCRIPT = {
  ar: { need: /[ء-ي]/u, bad: /[A-Za-z]/u, what: "Arabic" },
  fa: { need: /[ء-ی]/u, bad: /[A-Za-zيك]/u, what: "Persian (with ی and ک, no Latin letters)" },
  zh: { need: /\p{Script=Han}/u, bad: /[A-Za-z̀-ͯ]|[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/u, what: "Chinese characters (no pinyin)" },
  ko: { need: /\p{Script=Hangul}/u, bad: /[A-Za-z]/u, what: "Hangul" },
  es: { need: /[a-záéíóúñü]/iu, bad: /[؀-ۿ\p{Script=Han}\p{Script=Hangul}]/u, what: "Spanish" },
};

/** The problems of one entry: { errors: [], warnings: [] }. */
export function checkEntry(e, word, lang) {
  const errors = [];
  const warnings = [];
  const s = String(e.sentence || "");
  const tr = String(e.translation || "");
  const sm = [...s.matchAll(MARKS)];
  const tm = [...tr.matchAll(MARKS)];
  if (!s.trim()) errors.push("no sentence");
  else {
    if (sm.length !== 1 || (s.match(/[⟦⟧]/gu) || []).length !== 2) errors.push("the sentence needs ⟦ ⟧ round the word, once");
    else if (!sm[0][1].trim()) errors.push("the sentence's ⟦ ⟧ are empty");
    else if (!looksLike(sm[0][1], (e.fix && e.fix.word) || word.word, lang)) warnings.push(`marked “${sm[0][1]}” for the word “${word.word}”`);
    const p = plain(s).trim();
    const most = LIMIT[lang] || MAX_CHARS;
    if ([...p].length > most) errors.push(`the sentence is ${[...p].length} characters (at most ${most})`);
    if (!ENDS.test(p)) errors.push("the sentence doesn't end like a sentence (. ! ? 。 ؟)");
    const sc = SCRIPT[lang];
    if (sc && (!sc.need.test(p) || sc.bad.test(p))) errors.push(`the sentence should be written in ${sc.what}`);
    if (lang === "ar") {
      const L = (p.match(AR_LETTER) || []).length;
      const H = (p.match(HARAKAT) || []).length;
      if (L && H / L < 0.5) errors.push(`the sentence isn't fully vowelled (${H} marks for ${L} letters)`);
    }
  }
  if (!tr.trim()) errors.push("no translation");
  else {
    if (tm.length !== 1 || (tr.match(/[⟦⟧]/gu) || []).length !== 2) errors.push("the translation needs ⟦ ⟧ round the word's part, once");
    else if (!tm[0][1].trim()) errors.push("the translation's ⟦ ⟧ are empty");
    if (plain(tr).length > 200) errors.push("the translation is over 200 characters");
    if (/[؀-ۿ\p{Script=Han}\p{Script=Hangul}]/u.test(plain(tr))) warnings.push("the translation has non-English letters");
  }
  const sound = e.say && typeof e.say === "object" && ["sapi", "ipa"].includes(e.say.alphabet) && typeof e.say.ph === "string"
    && e.say.ph.trim() && e.say.ph.length <= 100 && Object.keys(e.say).length === 2;
  if (e.say !== undefined && !sound && (typeof e.say !== "string" || !e.say.trim() || e.say.length > 100)) {
    errors.push('say must be a short text, or {"alphabet": "sapi" or "ipa", "ph": "..."}');
  }
  if (lang === "ar") {
    if (typeof e.say !== "string" || !e.say.trim()) errors.push("Arabic needs say: the word fully vowelled");
    else if (!/[ً-ْٰ]/u.test(e.say)) errors.push("say has no vowel marks");
  }
  if (e.fix !== undefined) {
    const ok = e.fix && typeof e.fix === "object" && Object.keys(e.fix).length
      && Object.entries(e.fix).every(([k, v]) => ["word", "meaning"].includes(k) && typeof v === "string" && v.trim());
    if (!ok) errors.push("fix may only hold word and/or meaning (texts)");
  }
  const extra = Object.keys(e).filter((k) => !["n", "sentence", "translation", "say", "fix"].includes(k));
  if (extra.length) errors.push(`unknown field(s): ${extra.join(", ")}`);
  return { errors, warnings };
}

export function loadDeck(lang, content, wanted = "") {
  const base = join(content, lang);
  const id = !existsSync(base) ? null : wanted ? (existsSync(join(base, wanted, "deck.json")) ? wanted : null)
    : readdirSync(base).sort().find((d) => existsSync(join(base, d, "deck.json")));
  if (!id) throw new Error(`No deck for ${lang} in ${base} (run tools/dli/anki_decks.py first).`);
  const folder = join(base, id);
  return { folder, deck: JSON.parse(readFileSync(join(folder, "deck.json"), "utf8")) };
}

/** Check one chapter's file: { written, due, errors: [[n, msg]], warnings: [[n, msg]] }. */
export function checkChapter(deck, folder, chapter) {
  const lang = deck.language;
  const due = chapter.words.filter((n) => deck.words[n - 1].chapters[0] === chapter.id);
  const out = { written: 0, due: due.length, errors: [], warnings: [], exists: false };
  const file = join(folder, "sentences", `${chapter.id}.json`);
  if (!existsSync(file)) return out;
  out.exists = true;
  let data;
  try { data = JSON.parse(readFileSync(file, "utf8")); } catch (e) { out.errors.push([0, `not readable JSON: ${e.message}`]); return out; }
  if (!data || data.chapter !== chapter.id || !Array.isArray(data.words)) { out.errors.push([0, `must be {"chapter": "${chapter.id}", "words": [...]}`]); return out; }
  const seen = new Set();
  const dueSet = new Set(due);
  for (const e of data.words) {
    const n = e && e.n;
    if (!dueSet.has(n)) { out.errors.push([n, "not a word first met in this chapter"]); continue; }
    if (seen.has(n)) { out.errors.push([n, "written twice"]); continue; }
    seen.add(n);
    const r = checkEntry(e, deck.words[n - 1], lang);
    for (const m of r.errors) out.errors.push([n, m]);
    for (const m of r.warnings) out.warnings.push([n, m]);
  }
  out.written = seen.size;
  for (const n of due) if (!seen.has(n)) out.errors.push([n, `not written yet (${deck.words[n - 1].word})`]);
  return out;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const opt = (f) => { const i = args.indexOf(f); return i >= 0 ? args.splice(i, 2)[1] : undefined; };
  const content = resolve(opt("--content") || join(root, "..", "dli-content"));
  const todo = opt("--todo");
  const deckId = opt("--deck") || "";
  const [lang, ...wanted] = args;
  const { deck, folder } = loadDeck(lang, content, deckId);
  if (todo) {
    const ch = deck.chapters.find((c) => c.id === todo);
    if (!ch) throw new Error(`No chapter ${todo}.`);
    const title = (id) => (deck.chapters.find((c) => c.id === id) || {}).title;
    console.log(`${deck.title}: ${ch.id} ${ch.title}`);
    for (const n of ch.words) {
      const w = deck.words[n - 1];
      if (w.chapters[0] !== ch.id) continue;
      const also = w.chapters.slice(1).map(title);
      console.log(JSON.stringify({ n, word: w.word, meaning: w.meaning, ...(w.notes ? { notes: w.notes } : {}), ...(also.length ? { also_in: also } : {}) }));
    }
  } else {
    let bad = 0, written = 0, due = 0, warned = 0;
    for (const ch of deck.chapters.filter((c) => !wanted.length || wanted.includes(c.id))) {
      const r = checkChapter(deck, folder, ch);
      written += r.written; due += r.due; bad += r.errors.length; warned += r.warnings.length;
      if (!r.exists && !wanted.length) continue;
      console.log(`${ch.id} ${ch.title}: ${r.written}/${r.due} written${r.errors.length ? `, ${r.errors.length} to fix` : ""}${r.warnings.length ? `, ${r.warnings.length} to look at` : ""}`);
      for (const [n, m] of r.errors) console.log(`   ✗ ${n}: ${m}`);
      for (const [n, m] of r.warnings) console.log(`   ? ${n}: ${m}`);
    }
    console.log(`${deck.title}: ${written} of ${due} words written; ${bad} to fix, ${warned} to look at.`);
    if (bad) process.exitCode = 1;
  }
}
