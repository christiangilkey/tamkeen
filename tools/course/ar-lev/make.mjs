// The Levantine basics course's word list: tools/course/ar-lev/list.tsv (written by hand) -> words.json (what
// build_course.py voices and publishes) and EVIDENCE.md (the proof behind every word, for reading).
//
//   node tools/course/ar-lev/make.mjs                      list.tsv -> words.json, EVIDENCE.md here
//   node tools/course/ar-lev/make.mjs draft.tsv some/dir     a draft list, written somewhere else (to try it)
//
// For each word it adds:
//   uses, perMillion  how often its forms (list.tsv, each also with و / ف in front) are used in the 2.1 million
//                     words of Levantine text (tools/course/dialect/sources.mjs TEXTS.lev);
//   rank              its place among the Levantine dictionary's words (Wiktionary's North and South Levantine
//                     Arabic entries, counted the same way), most used = 1. The gaps are the words left out
//                     because they are Standard Arabic (README.md);
//   src               what published dictionaries say it means: every sense of its dictionary entries (list.tsv
//                     names the entries), with the page it is on;
//   msa               what Wiktionary's Arabic (Standard) entry spelled the same says, when there is one.
// Words are put in order of use, most used first. Then run tools/course/dialect/evidence.mjs lev (real sentences
// using each word) and tools/course/dialect/overlap.mjs ar-lev (no word is an MSA word).
import { createReadStream, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { counts, SRC } from "../dialect/sources.mjs";
import { countedForms } from "../dialect/evidence.mjs";
import { bare } from "../dialect/msa.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIELDS = ["word", "pos", "meaning", "note", "heads", "forms", "sentence", "translation", "form"];
const SECTION = { "North Levantine Arabic": "North_Levantine_Arabic", "South Levantine Arabic": "South_Levantine_Arabic", Arabic: "Arabic" };
// Senses a Standard Arabic entry gives only for some region or register: not Standard Arabic.
const LABELLED = /colloquial|dialect|levant|leban|syria|palestin|jordan|egypt|gulf|iraq|maghreb|morocc|tunis|algeri|hijaz|najd|saudi|sudan|yemen|kuwait|bahrain|qatar|emirat|libya|vulgar|slang|informal|regional/i;

/** list.tsv -> [{word, pos, meaning, note, heads[], forms[], sentence, translation, form}] */
export function readList(path = join(HERE, "list.tsv")) {
  return readFileSync(path, "utf8").split(/\r?\n/).filter((l) => l.trim() && !l.startsWith("#")).map((line, i) => {
    const cells = line.split("|").map((c) => c.trim());
    if (cells.length !== FIELDS.length) throw new Error(`list.tsv line ${i + 1}: ${cells.length} cells, not ${FIELDS.length}: ${line}`);
    const w = Object.fromEntries(FIELDS.map((f, j) => [f, cells[j]]));
    return { ...w, heads: w.heads.split(",").map((h) => h.trim()).filter(Boolean), forms: w.forms.split(/\s+/).filter(Boolean) };
  });
}

const page = (word, lang) => `https://en.wiktionary.org/wiki/${encodeURIComponent(word)}#${SECTION[lang]}`;
const glossOf = (s) => (s.raw_glosses || s.glosses || []).join("; ");

/**
 * The Levantine dictionary: Wiktionary's North and South Levantine Arabic entries (kaikki.org extract).
 * -> {uses: [uses of each dictionary word, counted like the course's words], senses: Map(bare headword -> [src])}
 */
async function levantineDictionary(n) {
  const uses = new Map(), senses = new Map();
  for (const lang of ["North Levantine Arabic", "South Levantine Arabic"]) {
    for await (const line of createInterface({ input: createReadStream(join(SRC, "wikt", `${lang.replace(/ /g, "")}.jsonl`)) })) {
      const j = JSON.parse(line);
      const k = bare(j.word);
      for (const s of j.senses || []) {
        const gloss = glossOf(s);
        if (gloss) senses.set(k, [...(senses.get(k) || []), { dictionary: `Wiktionary (${lang})`, entry: j.word, gloss, url: page(j.word, lang) }]);
      }
      if (["name", "character", "suffix", "prefix", "infix", "symbol", "proverb"].includes(j.pos)) continue;
      const forms = (j.forms || []).filter((f) => /[؀-ۿ]/.test(f.form || "") && !(f.tags || []).some((t) => /romanization|table-tags|inflection-template/.test(t)))
        .map((f) => String(f.form).replace(/\s*\(.*$/, "")).filter((f) => !f.includes(" "));
      const u = countedForms({ word: j.word, forms }).reduce((s, f) => s + (n.get(f) || 0), 0);
      if (u > (uses.get(k) || 0)) uses.set(k, u);
    }
  }
  return { uses: [...uses.values()], senses };
}

/**
 * Wiktionary's Arabic entries spelled like these words: {msa: Map(bare -> ["word (pos): gloss"]) the Standard
 * Arabic senses (no region or register label), lev: Map(bare -> [src]) the senses labelled Levantine}.
 */
async function arabicEntries(keys) {
  const msa = new Map(), lev = new Map();
  for await (const line of createInterface({ input: createReadStream(join(SRC, "wikt", "Arabic.jsonl")) })) {
    const m = line.match(/"word": "([^"]+)"/);
    if (!m || !keys.has(bare(m[1]))) continue;
    const j = JSON.parse(line);
    const k = bare(j.word);
    for (const s of j.senses || []) {
      const gloss = glossOf(s);
      if (!gloss || /inflection of|form of|plural of|feminine of|verbal noun of|participle of/.test(gloss)) continue;
      const labels = [gloss, ...(s.tags || [])];
      if (labels.some((t) => /levant|leban|syria|palestin|jordan/i.test(t))) {
        lev.set(k, [...(lev.get(k) || []), { dictionary: "Wiktionary (Arabic, labelled Levantine)", entry: j.word, gloss, url: page(j.word, "Arabic") }]);
      } else if (!labels.some((t) => LABELLED.test(t))) {
        msa.set(k, [...(msa.get(k) || []), `${j.word} (${j.pos}): ${gloss}`]);
      }
    }
  }
  return { msa, lev };
}

async function main() {
  const [listPath, outDir = HERE] = process.argv.slice(2);
  const list = readList(listPath || join(HERE, "list.tsv"));
  const { n, total } = counts("lev");
  const { uses: ranked, senses } = await levantineDictionary(n);
  const arabic = await arabicEntries(new Set(list.flatMap((w) => [w.word, ...w.heads].map(bare))));

  const words = list.map((w) => {
    const uses = countedForms(w).reduce((s, f) => s + (n.get(f) || 0), 0);
    const src = [];
    const seen = new Set();
    for (const h of w.heads) {
      for (const e of [...(senses.get(bare(h)) || []), ...(arabic.lev.get(bare(h)) || [])]) {
        if (seen.has(e.dictionary + e.entry + e.gloss)) continue;
        seen.add(e.dictionary + e.entry + e.gloss);
        src.push(e);
      }
    }
    if (!src.length) throw new Error(`${w.word}: no dictionary entry for ${w.heads.join(", ")} (list.tsv heads)`);
    return { ...w, uses, src, msa: arabic.msa.get(bare(w.word)) || [] };
  }).sort((a, b) => b.uses - a.uses);

  let last = 0;
  const out = words.map((w, i) => {
    const rank = Math.max(1 + ranked.filter((u) => u > w.uses).length, last + 1, i + 1);
    last = rank;
    const word = { n: i + 1, rank, word: w.word, pos: w.pos, meaning: w.meaning };
    if (w.note) word.note = w.note;
    Object.assign(word, { sentence: w.sentence, translation: w.translation });
    if (w.form) word.form = w.form;
    return { ...word, forms: w.forms, uses: w.uses, perMillion: Number(((w.uses / total) * 1e6).toFixed(1)), src: w.src, msa: w.msa };
  });

  const course = {
    lang: "ar-lev",
    title: "Levantine basics",
    variety: "Levantine Arabic (Damascus and Beirut; a few common Palestinian and Jordanian words are marked)",
    about: `The most common words of spoken Levantine Arabic that are not Standard Arabic: counted in ${(total / 1e6).toFixed(1)} million words of Syrian, Lebanese, Palestinian and Jordanian text, most common first, 50 to a unit. It builds on the Arabic basics course: words you already know from Standard Arabic, even said a little differently (كْتير for كَثير), are left out, and the grammar course teaches the patterns. Every meaning is backed by a published dictionary entry. Each word has one short everyday sentence, with Levantine vowel marks and its English translation; ⟦ ⟧ marks the part that translates the word. A note under a word says how it differs from a Standard Arabic word that looks the same.`,
    planned: out.length,
    voice: { voice: "ar-SY-AmanyNeural", locale: "ar-SY", name: "Amany (Azure, Syria)" },
    words: out,
  };
  writeFileSync(join(outDir, "words.json"), `${JSON.stringify(course, null, 1)}\n`);
  writeFileSync(join(outDir, "EVIDENCE.md"), evidenceMd(course, total));
  console.log(`${out.length} words -> ${join(outDir, "words.json")} and EVIDENCE.md (${total} words of text)`);
}

const esc = (s) => String(s).replace(/\|/g, "\\|").replace(/\s+/g, " ");

function evidenceMd(course, total) {
  const lines = [
    "# Levantine basics: the evidence for every word",
    "",
    "Made by `tools/course/ar-lev/make.mjs` from `list.tsv`; the method is in `README.md`. For each word:",
    "",
    `- **Uses**: how often it is used per million words in ${(total / 1e6).toFixed(2)} million words of real Levantine text (Shami corpus, UFAL subtitles, Levanti, AOC Jordanian comments), and its **rank** among the Levantine dictionary's words.`,
    "- **Dictionary**: what a published dictionary says it means (Wiktionary's North or South Levantine Arabic entry, linked). The meaning taught is one of these senses.",
    "- **Standard Arabic**: what Wiktionary's Standard Arabic entry spelled the same says, if there is one. It never gives the meaning taught (that would make it a Standard Arabic word, which the course leaves out); the note in the app says how they differ.",
    "- Real sentences that use each word are in `evidence.json` (made by `tools/course/dialect/evidence.mjs lev`).",
    "",
  ];
  for (const w of course.words) {
    lines.push(`## ${w.n}. ${w.word} (${w.pos}): ${w.meaning}`, "");
    lines.push(`- Uses: ${w.perMillion} per million (${w.uses} times), rank ${w.rank}. Forms counted: ${w.forms.join(" ")}`);
    for (const s of w.src) lines.push(`- Dictionary: [${s.dictionary}, “${s.entry}”](${s.url}): “${esc(s.gloss)}”`);
    lines.push(`- Standard Arabic: ${w.msa.length ? w.msa.slice(0, 4).map((m) => `“${esc(m)}”`).join("; ") : "Wiktionary has no Standard Arabic entry spelled this way."}`);
    if (w.note) lines.push(`- Note in the app: ${w.note}`);
    lines.push(`- Sentence: ${w.sentence.replace(/[⟦⟧]/g, "")} — ${w.translation.replace(/[⟦⟧]/g, "")}`, "");
  }
  return `${lines.join("\n")}\n`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
