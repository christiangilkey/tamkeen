// Step 2 of a basics course's word list: the written forms counted by forms.py, grouped by
// dictionary word (وكتبوا, يكتبون and كتبت all count for the verb كَتَب) with the same analyzer the
// app uses to tell which words a learner has seen (web/js/lexicon/arabic.js, CAMeL's tables in
// docs/lexicon), ranked by how common each dictionary word is in all its forms together.
//
//   node tools/course/rank.mjs ar   ->  tools/course/build/ar-ranked.json
//     [{rank, key, lemma, pos, root, freq, forms: [[form, freq], ...]}, ...]  (the top 1600)
//
// The course's own word list (tools/course/<lang>/words.json) is chosen from this one by hand:
// names of people and places are left out, and each word gets its everyday spelling and meaning.
import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Dictionary, analyzeArabic } from "../../web/js/lexicon/arabic.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const lang = process.argv[2] || "ar";
if (lang !== "ar") throw new Error("Only Arabic is grouped by dictionary word so far.");
const forms = JSON.parse(readFileSync(join(here, "build", `${lang}-forms.json`), "utf8"));
const msa = new Dictionary(JSON.parse(gunzipSync(readFileSync(join(root, "docs", "lexicon", "ar-msa.json.gz")))));

const byKey = new Map();
for (const [form, freq] of forms) {
  const [a] = analyzeArabic([form], [msa]);
  if (!a) continue;
  let e = byKey.get(a.key);
  if (!e) byKey.set(a.key, (e = { key: a.key, lemma: a.lemma, pos: a.pos, root: a.root, freq: 0, forms: [] }));
  e.freq += freq;
  e.forms.push([form, freq]);
}
const ranked = [...byKey.values()].sort((x, y) => y.freq - x.freq).slice(0, 1600)
  .map((e, i) => ({ rank: i + 1, ...e, freq: Number(e.freq.toPrecision(4)), forms: e.forms.slice(0, 6).map(([f, n]) => [f, Number(n.toPrecision(3))]) }));
writeFileSync(join(here, "build", `${lang}-ranked.json`), JSON.stringify(ranked, null, 1));
console.log(`${byKey.size} dictionary words from ${forms.length} forms; top ${ranked.length} -> build/${lang}-ranked.json`);
