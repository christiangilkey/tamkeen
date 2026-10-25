// Step 2 of the Hindi basics course's word list: the written forms counted by tools/course/forms.py,
// grouped by dictionary word (लड़के, लड़कों and लड़का all count for लड़का; किया, करता, करूँगा for करना)
// with the analyzer the app uses for seen words (web/js/lexicon/hindi.js and its word table in
// docs/lexicon/hi-lemmas.json.gz), ranked by how common each dictionary word is in all its forms together.
//
//   node tools/course/hi/rank.mjs   ->  tools/course/build/hi-ranked.json
//     [{rank, lemma, reading, freq, gloss, forms: [[form, freq], ...]}, ...]  (the top 3000)
//
// The course's words (tools/course/hi/words.json) are chosen from this list by hand.
import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { HindiReadings, hindiKey, hindiLemma } from "../../../web/js/lexicon/hindi.js";
import { LemmaTable } from "../../../web/js/lexicon/romance.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..", "..");
const build = join(here, "..", "build");
const file = (name) => JSON.parse(gunzipSync(readFileSync(join(root, "docs", "lexicon", name))).toString("utf8"));
const lemmas = file("hi-lemmas.json.gz");
const table = new LemmaTable(lemmas);
const readings = new HindiReadings(lemmas);
const meanings = file("hi-meanings.json.gz");
const gloss = (w) => {
  const senses = meanings.words[w] || meanings.words[hindiKey(w)] || [];
  return senses.slice(0, 3).map(([, pos, defs]) => `${pos}: ${defs.slice(0, 2).join("; ")}`).join(" | ");
};

const forms = JSON.parse(readFileSync(join(build, "hi-forms.json"), "utf8"));
const byKey = new Map();
for (const [form, freq] of forms) {
  if (!/\p{Script=Devanagari}/u.test(form)) continue;
  const lemma = hindiLemma(form, table);
  const key = hindiKey(lemma);
  let e = byKey.get(key);
  if (!e) byKey.set(key, (e = { lemma, freq: 0, forms: [] }));
  e.freq += freq;
  e.forms.push([form, freq]);
}
const ranked = [...byKey.values()].sort((x, y) => y.freq - x.freq).slice(0, 3000)
  .map((e, i) => ({
    rank: i + 1, lemma: e.lemma, reading: readings.word(e.lemma), freq: Number(e.freq.toPrecision(4)), gloss: gloss(e.lemma),
    forms: e.forms.slice(0, 6).map(([f, n]) => [f, Number(n.toPrecision(3))]),
  }));
writeFileSync(join(build, "hi-ranked.json"), JSON.stringify(ranked, null, 1));
console.log(`${byKey.size} dictionary words from ${forms.length} forms; top ${ranked.length} -> build/hi-ranked.json`);
