// Turns a hand-written draft of Hindi course words into a batch for tools/course/add_batch.py: each meaning
// gets the word's romanisation in front ("[karnā] to do"), read the way the app reads Hindi
// (web/js/lexicon/hindi.js HindiReadings, with Wiktionary's readings from the word table), and each row is
// checked against the ranked list and its own sentence. Warnings only; the batch is written anyway.
//
//   node tools/course/hi/prep.mjs tools/course/build/draft-hi-001.json   ->  tools/course/build/batch-hi-001.json
//
// Draft rows: [rank, word, pos, meaning, sentence, translation, form?]  (a meaning that already starts
// with "[" keeps its own romanisation).
import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { HindiReadings, hindiKey, hindiWord } from "../../../web/js/lexicon/hindi.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..", "..");
const build = join(here, "..", "build");
const lemmas = JSON.parse(gunzipSync(readFileSync(join(root, "docs", "lexicon", "hi-lemmas.json.gz"))).toString("utf8"));
const readings = new HindiReadings(lemmas);
const ranked = JSON.parse(readFileSync(join(build, "hi-ranked.json"), "utf8"));
const course = JSON.parse(readFileSync(join(here, "words.json"), "utf8"));
const used = new Map(course.words.map((w) => [`${hindiKey(w.word)}|${w.pos}`, w.n]));

const draft = process.argv[2];
const rows = JSON.parse(readFileSync(draft, "utf8"));
const warn = (r, msg) => console.log(`  ! ${r[0]} ${r[1]}: ${msg}`);
let last = course.words.length ? course.words.at(-1).rank : 0;
const out = rows.map((r) => {
  const [rank, word, pos, meaning, sentence, translation, form] = r;
  const entry = ranked[rank - 1];
  if (!entry) warn(r, "rank beyond the ranked list");
  else if (hindiKey(entry.lemma) !== hindiKey(word)) warn(r, `the ranked list has ${entry.lemma} at ${rank}`);
  if (rank <= last) warn(r, `rank doesn't rise (last ${last})`);
  last = rank;
  const key = `${hindiKey(word)}|${pos}`;
  if (used.has(key)) warn(r, `already word ${used.get(key)}`);
  used.set(key, rank);
  const tokens = sentence.split(/\s+/).map(hindiWord);
  const forms = [word, ...[].concat(form || [])].map(hindiWord);
  if (!forms.some((f) => (f.includes(" ") ? hindiWord(sentence).includes(f) : tokens.includes(f)))) warn(r, `no ${forms.join(" / ")} as a word in “${sentence}”`);
  if (tokens.length > 8) warn(r, `${tokens.length} words`);
  if (!/[।?!]$/.test(sentence)) warn(r, "doesn't end with । ? or !");
  if ((translation.match(/⟦/g) || []).length !== 1 || (translation.match(/⟧/g) || []).length !== 1) warn(r, "needs one ⟦ ⟧");
  const m = meaning.startsWith("[") ? meaning : `[${readings.word(word)}] ${meaning}`;
  console.log(`${rank}\t${word}\t${m}`);
  return form ? [rank, word, pos, m, sentence, translation, form] : [rank, word, pos, m, sentence, translation];
});
const dest = join(build, basename(draft).replace(/^draft-/, "batch-"));
writeFileSync(dest, JSON.stringify(out, null, 1) + "\n");
console.log(`${out.length} rows -> ${dest}`);
