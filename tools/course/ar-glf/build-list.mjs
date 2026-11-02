// The Gulf (Saudi, Riyadh-style) basics word list: list.json (the words chosen by hand, with their sentences)
// -> words.json (numbered by how often Saudis use them) and evidence.json (the proof of each word's meaning
// and use). README.md in this folder explains the sources and the rules.
//
//   node tools/course/ar-glf/build-list.mjs [--out <folder>]
//
// Needs the downloaded texts and dictionaries in tools/course/build/dialect/ (README.md says how to get them)
// and the word counts made by counts.mjs.
import { createReadStream, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { countForm, dictionary, msaBasics, SRC } from "../dialect/sources.mjs";
import { bare, shiftClash } from "../dialect/msa.mjs";
import { msaWords, spellings } from "../dialect/overlap.mjs";
import { matchForm } from "../../../web/js/lexicon/arabic.js";

const here = dirname(fileURLToPath(import.meta.url));
const out = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : here;
const list = JSON.parse(readFileSync(join(here, "list.json"), "utf8"));
const la = JSON.parse(readFileSync(join(here, "la-gulf.json"), "utf8"));
const manual = JSON.parse(readFileSync(join(here, "manual.json"), "utf8"));
const { totals, forms: counted } = JSON.parse(readFileSync(join(SRC, "glf-work", "counts.json"), "utf8"));
const CORPORA = ["aoc", "sada", "fineweb2"];

// Dictionaries: Wiktionary's Gulf, Hijazi and Najdi Arabic entries and its Arabic senses labelled Gulf/Saudi.
const dict = await dictionary("glf");
const najdi = JSON.parse(readFileSync(join(SRC, "wikt-najdi", "najdi-pages.json"), "utf8"));
for (const [t, s] of Object.entries(najdi)) {
  const defs = s.split("\n").filter((l) => /^# /.test(l))
    .map((l) => l.replace(/^# /, "").replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, "$2").replace(/\{\{[^}]*\}\}/g, "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
  if (defs.length) {
    const k = matchForm(t);
    dict.set(k, [...(dict.get(k) || []), { src: "Wiktionary (Najdi Arabic)", word: t, gloss: defs.join("; ") }]);
  }
}
const wiktUrl = (e) => {
  const lang = (e.src.match(/\(([^,)]+)/) || [])[1] || "Arabic";
  return `https://en.wiktionary.org/wiki/${encodeURIComponent(e.word)}#${lang.replace(/ /g, "_")}`;
};

// A word is counted in all its spellings (forms), each also with و / ف (“and”, “so”) in front.
const spellingsOf = (w) => [...new Set([bare(w.word), ...String(w.forms || "").split(/\s+/).map(bare)])].filter(Boolean);
const withConj = (fs) => [...new Set(fs.flatMap((f) => [f, `و${f}`, `ف${f}`]))];
const MSAW = msaWords(), basics = msaBasics();

const rows = list.map((w) => {
  const fs = withConj(spellingsOf(w));
  const c = [0, 0, 0];
  for (const f of fs) { const a = counted[f]; if (a) for (let i = 0; i < 3; i++) c[i] += a[i]; }
  const perMillion = c.map((x, i) => Number(((x / totals[i]) * 1e6).toFixed(1)));
  const score = (perMillion[0] + perMillion[1] + perMillion[2]) / 3;
  return { w, fs, c, perMillion, score };
}).sort((a, b) => b.score - a.score);

// Rank: the word's place among every spelling in the Saudi texts (MSA words included), most used first.
const allScores = Object.values(counted).map((a) => ((a[0] / totals[0]) + (a[1] / totals[1]) + (a[2] / totals[2])) * 1e6 / 3).sort((x, y) => y - x);
const rankOf = (score) => {
  let lo = 0, hi = allScores.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (allScores[mid] > score) lo = mid + 1; else hi = mid; }
  return lo + 1;
};

// Real sentences that use the word: short ones from each text collection.
const exampleForms = rows.map((r) => new Set(withConj(String(r.w.exforms || r.w.forms || r.w.word).split(/\s+/).map(bare))));
const exampleMatch = rows.map((r) => (r.w.exmatch ? new RegExp(r.w.exmatch) : null));
const examples = rows.map(() => ({ aoc: [], sada: [], fineweb2: [] }));
const take = (corpus, line) => {
  if (line.length < 15 || line.length > 130 || /https?:|www\.|@|#/.test(line)) return;
  const toks = new Set(line.split(/\s+/).map(countForm));
  rows.forEach((r, i) => {
    const ex = examples[i][corpus];
    if (ex.length < 2 && [...exampleForms[i]].some((f) => toks.has(f)) && (!exampleMatch[i] || exampleMatch[i].test(line)) && !ex.includes(line)) ex.push(line);
  });
};
const lines = (f) => readFileSync(join(SRC, f), "utf8").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
for (const l of lines("aoc/dialect_alriyadh-segs.txt.norm")) take("aoc", l);
for (const l of lines("sada/najdi-clean.tsv")) take("sada", l.split("\t")[0]);
let fwSeen = 0;
for await (const l of createInterface({ input: createReadStream(join(SRC, "fineweb2", "najdi-00000.txt")) })) {
  take("fineweb2", l.trim());
  if (++fwSeen % 200000 === 0 && examples.every((e) => e.fineweb2.length >= 2)) break;
}

const PUBLISHED = ["word", "pos", "meaning", "sentence", "translation", "form", "say", "note"];
const words = rows.map((r, i) => {
  const o = { n: i + 1, rank: Math.max(rankOf(r.score), i + 1) };
  for (const k of PUBLISHED) if (r.w[k] !== undefined) o[k] = r.w[k];
  return o;
});
for (let i = 1; i < words.length; i++) if (words[i].rank <= words[i - 1].rank) words[i].rank = words[i - 1].rank + 1;

const evidence = rows.map((r, i) => {
  const seen = new Set(), meanings = [];
  for (const f of spellingsOf(r.w)) for (const e of dict.get(f) || []) {
    const k = `${e.src}|${e.gloss}`;
    if (seen.has(k) || /descended from/.test(e.src)) continue;
    seen.add(k);
    meanings.push({ src: e.src, word: e.word, gloss: e.gloss, url: wiktUrl(e) });
  }
  for (const e of la[r.w.la] || []) meanings.push({ src: "Living Arabic Project, Gulf Arabic dictionary (livingarabic.com)", word: e.word, gloss: e.meaning, url: e.url });
  for (const id of r.w.manual || []) meanings.push(manual[id]);
  const flags = [];
  for (const k of spellings(r.w.word)) if (MSAW.has(k)) flags.push(`MSA overlap: ${MSAW.get(k).join("; ")}`);
  for (const b of shiftClash(r.w.word, basics)) flags.push(`looks like MSA basics word ${b.n} ${b.word} with a sound change (checked by hand: a different word)`);
  return {
    n: i + 1,
    word: r.w.word,
    meaning: r.w.meaning,
    ...(r.w.note ? { note: r.w.note } : {}),
    ...(r.w.evnote ? { remark: r.w.evnote } : {}),
    counted: {
      forms: r.fs.filter((f) => CORPORA.some((_, k) => (counted[f] || [])[k])),
      count: Object.fromEntries(CORPORA.map((k, j) => [k, r.c[j]])),
      perMillion: Object.fromEntries(CORPORA.map((k, j) => [k, r.perMillion[j]])),
    },
    meanings,
    examples: examples[i],
    ...(flags.length ? { flags } : {}),
  };
});

const head = JSON.parse(readFileSync(join(here, "head.json"), "utf8"));
head.planned = words.length;
writeFileSync(join(out, "words.json"), `${JSON.stringify({ ...head, words }, null, 1)}\n`);
writeFileSync(join(out, "evidence.json"), `${JSON.stringify({
  dialect: "glf",
  note: "Made by tools/course/ar-glf/build-list.mjs. For each word: how often it is used in Saudi texts (count and per million words, in all the spellings listed), what published dictionaries say it means (with links), and real Saudi sentences that use it. Sources and licences: tools/course/ar-glf/README.md.",
  texts: {
    aoc: `Arabic Online Commentary, readers' comments on Al-Riyadh judged dialectal (Zaidan & Callison-Burch 2011): ${totals[0]} words`,
    sada: `SADA 2022 Saudi TV transcripts, Najdi speakers (SDAIA, CC BY-NC-SA 4.0; only counted, and quoted briefly here): ${totals[1]} words`,
    fineweb2: `FineWeb2, its Najdi Arabic part, the first of its 11 files (Hugging Face, ODC-By 1.0): ${totals[2]} words`,
  },
  words: evidence,
}, null, 1)}\n`);
console.log(`${words.length} words -> ${out}/words.json, evidence.json`);
