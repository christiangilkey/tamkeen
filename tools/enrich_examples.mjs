// The second step of the examples files (docs/lexicon/<lang>-examples.json.gz; the first is
// tools/build_examples.py build): so that common words nearly always get a sentence with no AI key.
//
//   node tools/enrich_examples.mjs [lang ...]      (every language that has an examples file when none is given)
//
// It adds two things to each file, and can be run again (what it added last time is taken out first):
//   1. The language's Basics course sentences (docs/course/<lang>/course.json: the 1,000 commonest words, each with
//      one short everyday sentence and its translation, made for Tamkeen; Arabic: the Standard Arabic course, the
//      dialect courses are in already as "c:<code>"). Source "b", filed under their word ("words"), at the end.
//   2. `forms` and `also`: {a word of the sentences, as a key: "its dictionary words' keys, joined by |"}, so that
//      a sentence with مشاكل or المشكلة or مشكلتي is found for مشكلة, one with Teile for Teil, incluye for incluir,
//      with no word tables on the device. From the language's meanings file (docs/lexicon/<lang>-meanings.json.gz,
//      English Wiktionary: its "plural of", "form of" list and the forms in each entry's table), Arabic's pronoun
//      endings and little words in front (meaningdata.js arabicVariants: مدرستي -> مدرسة), and the courses' marked
//      words (⟦كردی⟧ in the sentence for کردن). `also` has the words that are dictionary words themselves too
//      (كتب "books" and "he wrote"): they count for less (web/js/lexicon/exampledata.js FORM_COST, ALSO_COST).
// Keys are made with the app's own code (meaningdata.js matchKey, exampledata.js sentenceKeys), so they match.
// Then docs/lexicon/index.json gets the file's new size and sha256 (devices update by it).

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { arabicVariants, matchKey } from "../web/js/lexicon/meaningdata.js";
import { sentenceKeys } from "../web/js/lexicon/exampledata.js";
import { soundCore } from "../web/js/review/wordcore.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LEX = path.join(ROOT, "docs", "lexicon");
const UNSPACED = new Set(["ja", "zh", "th"]);
const MAX_LEMMAS = 3;  // dictionary words kept for one form (the first are the likeliest)

const readGz = (file) => JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString("utf8"));
const unmark = (s) => String(s || "").replace(/[⟦⟧]/g, "").replace(/\s+/g, " ").trim();

/** The Basics course's words with a sentence: [{word, sentence, translation, marked: [the parts in ⟦ ⟧]}]. */
function courseWords(lang) {
  const file = path.join(ROOT, "docs", "course", lang, "course.json");
  if (!fs.existsSync(file)) return [];
  const course = JSON.parse(fs.readFileSync(file, "utf8"));
  return (course.words || []).filter((w) => w.word && w.sentence && w.translation)
    .map((w) => ({ word: w.word, sentence: unmark(w.sentence), translation: unmark(w.translation),
      marked: [...String(w.sentence).matchAll(/⟦([^⟧]+)⟧/g)].map((m) => m[1]) }));
}

/** The keys a course word is filed under: as written and its core (der Teil -> teil, (to) go -> go). */
function wordKeys(word, lang) {
  const out = new Set([matchKey(word, lang)]);
  const core = soundCore(word, lang).core;
  if (core) out.add(matchKey(core, lang));
  return [...out].filter(Boolean);
}

function enrich(lang) {
  const file = path.join(LEX, `${lang}-examples.json.gz`);
  const pack = readGz(file);
  // 0. What this step added last time out.
  let end = pack.sentences.findIndex((s) => String(s[2]).startsWith("b"));
  if (end >= 0) {
    if (pack.sentences.slice(end).some((s) => !String(s[2]).startsWith("b"))) throw new Error(`${lang}: course sentences not at the end`);
    pack.sentences.length = end;
    for (const [k, list] of Object.entries(pack.words)) {
      const kept = list.filter((i) => i < end);
      if (kept.length) pack.words[k] = kept; else delete pack.words[k];
    }
  }
  delete pack.forms;
  delete pack.also;

  // 1. The Basics course's sentences.
  const course = courseWords(lang);
  let added = 0;
  const marks = [];  // [marked part's key, the course word's keys]
  for (const w of course) {
    const keys = wordKeys(w.word, lang);
    for (const m of w.marked) {
      const mk = matchKey(m, lang);
      if (mk && !keys.includes(mk) && !UNSPACED.has(lang) && !/\s/.test(m)) marks.push([mk, keys]);
    }
    let i = pack.sentences.findIndex((s) => s[0] === w.sentence);
    if (i < 0) {
      i = pack.sentences.length;
      pack.sentences.push([w.sentence, w.translation, "b"]);
      added++;
    }
    for (const k of keys) {
      const list = (pack.words[k] ||= []);
      if (!list.includes(i)) list.push(i);
    }
  }

  // 2. Each word of the sentences -> its dictionary words.
  const forms = {}, also = {};
  if (!UNSPACED.has(lang)) {
    const meaningsFile = path.join(LEX, `${lang}-meanings.json.gz`);
    const meanings = fs.existsSync(meaningsFile) ? readGz(meaningsFile) : { words: {}, forms: {} };
    const heads = meanings.words || {};
    // form -> dictionary words: Wiktionary's "plural of"/"form of" list, then the forms in each entry's table
    const formOf = new Map();
    const put = (form, lemma) => {
      if (!form || !lemma || form === lemma) return;
      const list = formOf.get(form);
      if (!list) formOf.set(form, [lemma]); else if (!list.includes(lemma)) list.push(lemma);
    };
    for (const [form, list] of Object.entries(meanings.forms || {})) for (const x of list || []) put(form, Array.isArray(x) ? x[0] : x);
    for (const [k, entries] of Object.entries(heads)) {
      for (const e of entries || []) {
        const table = Array.isArray(e) && Array.isArray(e[4]) && Array.isArray(e[4][1]) ? e[4][1] : [];
        for (const f of table) if (Array.isArray(f) && typeof f[1] === "string" && !/\s/.test(f[1].trim())) put(matchKey(f[1], lang), k);
      }
    }
    for (const [mk, keys] of marks) for (const k of keys) put(mk, k);
    const tokens = new Set();
    for (const [text] of pack.sentences) for (const k of sentenceKeys(text, lang)) tokens.add(k);
    for (const t of tokens) {
      const lemmas = [...(formOf.get(t) || [])];
      const own = Object.prototype.hasOwnProperty.call(heads, t);
      // Arabic: the word without its pronoun ending or little words in front, when that is a dictionary word
      // (only for words that aren't dictionary words themselves: ملك is "king", not مل + ك; and only the first
      // that is one, endings off before little words in front: بيتي is بيت, not ب + يتي)
      if (!own && !lemmas.length && lang === "ar") {
        for (const v of arabicVariants(t).slice(1)) {
          if (v === t || v.length < 2) continue;
          const found = Object.prototype.hasOwnProperty.call(heads, v) ? [v] : formOf.get(v) || [];
          if (found.length) { lemmas.push(...found); break; }
        }
      }
      const keep = lemmas.filter((l) => l !== t).slice(0, MAX_LEMMAS);
      if (keep.length) (own ? also : forms)[t] = keep.join("|");
    }
    if (Object.keys(forms).length) pack.forms = forms;
    if (Object.keys(also).length) pack.also = also;
  }
  if (added) {
    pack.source = String(pack.source || "").replace(/ and Tamkeen's Basics course$/, "") + " and Tamkeen's Basics course";
  }

  // 3. Written back, and its new checksum in the list devices update by.
  const packed = zlib.gzipSync(Buffer.from(JSON.stringify(pack), "utf8"), { level: 9 });
  fs.writeFileSync(file, packed);
  const indexFile = path.join(LEX, "index.json");
  const index = JSON.parse(fs.readFileSync(indexFile, "utf8"));
  const entry = index.files[`ex-${lang}`] || {};
  const db = String(entry.db || "Tatoeba + English Wiktionary (Wiktextract)").replace(/ \+ Tamkeen's Basics course$/, "");
  index.files[`ex-${lang}`] = { ...entry, db: added ? `${db} + Tamkeen's Basics course` : db, file: `${lang}-examples.json.gz`, bytes: packed.length,
    sha256: crypto.createHash("sha256").update(packed).digest("hex"), sentences: pack.sentences.length,
    course: course.length ? pack.sentences.filter((s) => s[2] === "b").length : 0,
    forms: Object.keys(forms).length + Object.keys(also).length };
  fs.writeFileSync(indexFile, JSON.stringify(index, null, 1) + "\n");
  console.log(`${lang}: ${pack.sentences.length} sentences (+${added} from the Basics course), ${Object.keys(forms).length} + ${Object.keys(also).length} forms, ${(packed.length / 1e6).toFixed(2)} MB`);
}

const wanted = process.argv.slice(2);
const langs = wanted.length ? wanted : fs.readdirSync(LEX).map((f) => /^([a-z]+)-examples\.json\.gz$/.exec(f)).filter(Boolean).map((m) => m[1]);
for (const lang of langs) enrich(lang);
