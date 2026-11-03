// The Iraqi basics course's word list: tools/course/ar-irq/list.tsv (written by hand) -> words.json (what
// build_course.py voices and publishes) and EVIDENCE.md (the proof behind every word, for reading).
//
//   node tools/course/ar-irq/make.mjs                      list.tsv -> words.json, EVIDENCE.md here
//   node tools/course/ar-irq/make.mjs draft.tsv some/dir     a draft list, written somewhere else (to try it)
//
// For each word it adds:
//   uses, perMillion  how often its forms (list.tsv, each also with و / ف in front) are used in the Iraqi texts
//                     (tools/course/dialect/sources.mjs TEXTS.irq: Iraqis' YouTube comments and Telegram messages);
//   rank              its place among every spelling in those texts, Standard words included, most used = 1 (the
//                     Gulf course's way: the gaps are everything left out, mostly Standard Arabic);
//   src               what published dictionaries say it means, with the page it is on: Wiktionary's Iraqi Arabic
//                     entries (wikt.mjs), the senses of Wiktionary's Arabic entries labelled Iraqi, and the Living
//                     Arabic Project's Iraqi dictionary (la.mjs, la-iraqi.json). "word~pattern" in list.tsv keeps
//                     only the senses that match the pattern (a headword spelled like another word);
//   msa               what Wiktionary's Arabic (Standard) entry spelled the same says, when there is one.
// Words are put in order of use, most used first. The voice part of words.json gets sounds.tsv: how the voice
// says each word written with گ or چ, letters Azure's Iraqi voice skips (build_course.py "ipa").
// Then run tools/course/dialect/evidence.mjs irq (real sentences using each word) and
// tools/course/dialect/overlap.mjs ar-irq (no word is an MSA word).
import { createReadStream, existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { counts, SRC } from "../dialect/sources.mjs";
import { countedForms } from "../dialect/evidence.mjs";
import { bare } from "../dialect/msa.mjs";
import { LA_FILE } from "./la.mjs";
import { WIKT, pageUrl } from "./wikt.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIELDS = ["word", "pos", "meaning", "note", "heads", "la", "forms", "sentence", "translation"];
// Senses a Standard Arabic entry gives only for some region or register: not Standard Arabic.
const LABELLED = /colloquial|dialect|levant|leban|syria|palestin|jordan|egypt|gulf|iraq|maghreb|morocc|tunis|algeri|hijaz|najd|saudi|sudan|yemen|kuwait|bahrain|qatar|emirat|libya|vulgar|slang|informal|regional/i;
const IRAQ = /iraq|baghdad|mesopotam|basra|mosul/i;
export const UNSAID = "گچ"; // letters Azure's Iraqi voice skips
export const VOICE = { voice: "ar-IQ-BasselNeural", locale: "ar-IQ", name: "Bassel (Azure, Iraq)" };

/** "هيچ~like|so" -> {key: "هيچ", re: /like|so/i} */
const pick = (s) => { const [key, re] = s.split("~"); return { key: key.trim(), re: re ? new RegExp(re, "i") : null }; };

/** list.tsv -> [{word, pos, meaning, note, heads[], la[], forms[], sentence, translation, form}] */
export function readList(path = join(HERE, "list.tsv")) {
  return readFileSync(path, "utf8").split(/\r?\n/).filter((l) => l.trim() && !l.startsWith("#")).map((line, i) => {
    const cells = line.split("|").map((c) => c.trim());
    if (cells.length !== FIELDS.length) throw new Error(`list.tsv line ${i + 1}: ${cells.length} cells, not ${FIELDS.length}: ${line}`);
    const w = Object.fromEntries(FIELDS.map((f, j) => [f, cells[j]]));
    const list = (s) => s.split(",").map((h) => h.trim()).filter(Boolean);
    // The word as the sentence has it, when it isn't written the same: the part marked ⟦ ⟧.
    const marked = (w.sentence.match(/⟦([^⟦⟧]+)⟧/) || [])[1] || "";
    const form = w.sentence.replace(/[⟦⟧]/g, "").includes(w.word) ? "" : marked;
    return { ...w, heads: list(w.heads), la: list(w.la), forms: w.forms.split(/\s+/).filter(Boolean), form };
  });
}

/** sounds.tsv: {word as written, no vowel marks: IPA}. */
export function readSounds(path = join(HERE, "sounds.tsv")) {
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (!line.trim() || line.startsWith("#")) continue;
    const [word, ipa] = line.split("\t").map((x) => (x || "").trim());
    if (!word || !ipa) throw new Error(`sounds.tsv: ${line}`);
    out[word] = ipa;
  }
  return out;
}

const ch = (code) => String.fromCharCode(code);

/** The words (no vowel marks) of these texts that have a letter the voice skips. */
export function unsaidWords(texts) {
  const marks = new RegExp(`[${ch(0x64b)}-${ch(0x65f)}${ch(0x670)}${ch(0x640)}]`, "g"); // vowel marks and tatweel
  const words = texts.flatMap((t) => String(t).replace(/[⟦⟧]/g, "").match(new RegExp(`[${ch(0x621)}-${ch(0x65f)}${ch(0x670)}-${ch(0x6d3)}]+`, "g")) || []);
  return [...new Set(words.map((w) => w.replace(marks, "")).filter((w) => [...UNSAID].some((c) => w.includes(c))))];
}

/**
 * Wiktionary's Arabic entries spelled like these words: {msa: Map(bare -> ["word (pos): gloss"]) the Standard
 * Arabic senses (no region or register label), irq: Map(bare -> [src]) the senses labelled Iraqi}.
 */
async function arabicEntries(keys) {
  const msa = new Map(), irq = new Map();
  for await (const line of createInterface({ input: createReadStream(join(SRC, "wikt", "Arabic.jsonl")) })) {
    const m = line.match(/"word": "([^"]+)"/);
    if (!m || !keys.has(bare(m[1]))) continue;
    const j = JSON.parse(line);
    const k = bare(j.word);
    for (const s of j.senses || []) {
      const gloss = (s.raw_glosses || s.glosses || []).join("; ");
      if (!gloss || /inflection of|form of|plural of|feminine of|verbal noun of|participle of/.test(gloss)) continue;
      const labels = [gloss, ...(s.tags || [])];
      if (labels.some((t) => IRAQ.test(t))) {
        irq.set(k, [...(irq.get(k) || []), { dictionary: "Wiktionary (Arabic, labelled Iraqi)", entry: j.word, gloss, url: `https://en.wiktionary.org/wiki/${encodeURIComponent(j.word)}#Arabic` }]);
      } else if (!labels.some((t) => LABELLED.test(t))) {
        msa.set(k, [...(msa.get(k) || []), `${j.word} (${j.pos}): ${gloss}`]);
      }
    }
  }
  return { msa, irq };
}

async function main() {
  const [listPath, outDir = HERE] = process.argv.slice(2);
  const list = readList(listPath || join(HERE, "list.tsv"));
  const { n, total } = counts("irq");
  const wikt = existsSync(WIKT) ? JSON.parse(readFileSync(WIKT, "utf8")) : {};
  const wiktByKey = new Map();
  for (const [word, senses] of Object.entries(wikt)) wiktByKey.set(bare(word), [...(wiktByKey.get(bare(word)) || []), ...senses.map((s) => ({ ...s, word }))]);
  const la = JSON.parse(readFileSync(LA_FILE, "utf8"));
  const arabic = await arabicEntries(new Set(list.flatMap((w) => [w.word, ...w.heads.map((h) => pick(h).key)].map(bare))));
  const spellings = [...n.values()].sort((a, b) => b - a); // every spelling's count, most used first

  const words = list.map((w) => {
    const uses = countedForms(w).reduce((s, f) => s + (n.get(f) || 0), 0);
    const src = [];
    const seen = new Set();
    const add = (e) => { if (!seen.has(e.dictionary + e.entry + e.gloss)) { seen.add(e.dictionary + e.entry + e.gloss); src.push(e); } };
    for (const h of w.heads.map(pick)) {
      for (const s of wiktByKey.get(bare(h.key)) || []) {
        if (!h.re || h.re.test(s.gloss)) add({ dictionary: "Wiktionary (Iraqi Arabic)", entry: s.word, gloss: s.gloss, url: pageUrl(s.word) });
      }
      for (const e of arabic.irq.get(bare(h.key)) || []) if (!h.re || h.re.test(e.gloss)) add(e);
    }
    for (const q of w.la.map(pick)) {
      if (!la[q.key]) throw new Error(`${w.word}: ${q.key} isn't in la-iraqi.json yet (node tools/course/ar-irq/la.mjs)`);
      for (const e of la[q.key]) if (!q.re || q.re.test(e.meaning)) add({ dictionary: "Living Arabic Project, Iraqi dictionary", entry: e.word, gloss: e.meaning, url: e.url });
    }
    if (!src.length) throw new Error(`${w.word}: no dictionary entry (list.tsv heads ${w.heads.join(", ")}; la ${w.la.join(", ")})`);
    return { ...w, uses, src, msa: arabic.msa.get(bare(w.word)) || [] };
  }).sort((a, b) => b.uses - a.uses);

  let last = 0;
  const out = words.map((w, i) => {
    const rank = Math.max(1 + spellings.filter((u) => u > w.uses).length, last + 1, i + 1);
    last = rank;
    const word = { n: i + 1, rank, word: w.word, pos: w.pos, meaning: w.meaning };
    if (w.note) word.note = w.note;
    Object.assign(word, { sentence: w.sentence, translation: w.translation });
    if (w.form) word.form = w.form;
    return { ...word, forms: w.forms, uses: w.uses, perMillion: Number(((w.uses / total) * 1e6).toFixed(1)), src: w.src, msa: w.msa };
  });

  // How the voice says the words it can't read: every word with گ or چ needs its sound.
  const sounds = readSounds();
  const missing = unsaidWords(out.flatMap((w) => [w.word, w.sentence])).filter((t) => !sounds[t]);
  if (missing.length) throw new Error(`sounds.tsv has no sound for: ${missing.join(" ")}`);
  const used = new Set(unsaidWords(out.flatMap((w) => [w.word, w.sentence])));
  const ipa = Object.fromEntries(Object.entries(sounds).filter(([k]) => used.has(k)).sort());

  const course = {
    lang: "ar-irq",
    title: "Iraqi basics",
    variety: "Iraqi Arabic (Baghdad)",
    about: `The most common words of spoken Iraqi Arabic that are not Standard Arabic: counted in ${(total / 1e6).toFixed(1)} million words that Iraqis wrote in comments and messages, most common first, 50 to a unit. It builds on the Arabic basics course: words you already know from Standard Arabic, even said a little differently (گال for قال, چبير for كبير), are left out, and the grammar course teaches the patterns. Every meaning is backed by a published dictionary entry. Each word has one short everyday sentence as people say it in Baghdad, with vowel marks and its English translation; ⟦ ⟧ marks the part that translates the word. گ is the Iraqi g (Standard ق) and چ is ch (often Standard ك). A note under a word says how it differs from a Standard Arabic word that looks the same.`,
    planned: out.length,
    voice: { ...VOICE, unsaid: UNSAID, ipa },
    words: out,
  };
  writeFileSync(join(outDir, "words.json"), `${JSON.stringify(course, null, 1)}\n`);
  writeFileSync(join(outDir, "EVIDENCE.md"), evidenceMd(course, total));
  console.log(`${out.length} words -> ${join(outDir, "words.json")} and EVIDENCE.md (${total} words of text)`);
}

const esc = (s) => String(s).replace(/\|/g, "\\|").replace(/\s+/g, " ");

function evidenceMd(course, total) {
  const lines = [
    "# Iraqi basics: the evidence for every word",
    "",
    "Made by `tools/course/ar-irq/make.mjs` from `list.tsv`; the method is in `README.md`. For each word:",
    "",
    `- **Uses**: how often it is used per million words in ${(total / 1e6).toFixed(2)} million words of real Iraqi text (the Iraqi Arabic Dialect Corpus: Iraqis' YouTube comments and Telegram messages), and its **rank** among every spelling in those texts.`,
    "- **Dictionary**: what a published dictionary says it means (Wiktionary's Iraqi Arabic entry, or the Living Arabic Project's Iraqi dictionary, linked). The meaning taught is one of these senses.",
    "- **Standard Arabic**: what Wiktionary's Standard Arabic entry spelled the same says, if there is one. It never gives the meaning taught (that would make it a Standard Arabic word, which the course leaves out); the note in the app says how they differ.",
    "- Real sentences that use each word are in `evidence.json` (made by `tools/course/dialect/evidence.mjs irq`).",
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
