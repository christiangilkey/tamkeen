// Step 2 of the Persian basics course's word list: the written forms counted by forms.py, grouped by
// dictionary word (می‌خواهم, خواستم and بخواهید all count for خواستن) with the analyzer the app uses for
// seen words (web/js/lexicon/persian.js and docs/lexicon/fa-lemmas.json.gz), ranked by how common each
// dictionary word is in all its forms together.
//
//   node tools/course/fa/rank.mjs   ->  tools/course/build/fa-ranked.json
//     [{rank, lemma, freq, forms: [[form, freq], ...]}, ...]  (the top 2500)
//
// The analyzer makes mistakes (it can take a noun with an ending for another word): the course's own
// list (tools/course/fa/words.json) is chosen from this one by hand.
import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { LemmaTable } from "../../../web/js/lexicon/romance.js";
import { persianLexeme } from "../../../web/js/lexicon/persian.js";

const here = dirname(fileURLToPath(import.meta.url));
const build = join(here, "..", "build");
const root = join(here, "..", "..", "..");
const forms = JSON.parse(readFileSync(join(build, "fa-forms.json"), "utf8"));
const table = new LemmaTable(JSON.parse(gunzipSync(readFileSync(join(root, "docs", "lexicon", "fa-lemmas.json.gz")))));

const byLemma = new Map();
for (const [form, freq] of forms) {
  const a = persianLexeme(form, table);
  if (!a) continue;
  let e = byLemma.get(a.key);
  if (!e) byLemma.set(a.key, (e = { lemma: a.lemma, freq: 0, forms: [] }));
  e.freq += freq;
  e.forms.push([form, freq]);
}
const ranked = [...byLemma.values()].sort((x, y) => y.freq - x.freq).slice(0, 2500)
  .map((e, i) => ({ rank: i + 1, lemma: e.lemma, freq: Number(e.freq.toPrecision(4)),
    forms: e.forms.slice(0, 6).map(([f, n]) => [f, Number(n.toPrecision(3))]) }));
writeFileSync(join(build, "fa-ranked.json"), JSON.stringify(ranked, null, 1));
console.log(`${byLemma.size} dictionary words from ${forms.length} forms; top ${ranked.length} -> build/fa-ranked.json`);
