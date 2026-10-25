// Step 2 of the Tagalog basics course's word list: the written forms counted by forms.py, grouped by
// root with the analyzer the app uses for seen words (web/js/lexicon/tagalog.js and its table
// docs/lexicon/tl-roots.json.gz: kumain, kakain, kinain -> kain), ranked by how common each word is in
// all its forms together.
//
//   node tools/course/tl/rank.mjs   ->  tools/course/build/tl-ranked.json
//     [{rank, key, freq, forms: [[form, freq], ...]}, ...]  (the top 4000)
//
// The analyzer joins whatever shares a root, but a learner meets some of those as words of their own
// (pagkain "food" is not kumain "to eat"; masama "bad" is not kasama "with"). split.json and join.json fix
// the groupings the course needs; the words themselves are chosen by hand (tools/course/tl/words.json).
import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tagalogLexeme } from "../../../web/js/lexicon/tagalog.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..", "..");
const forms = JSON.parse(readFileSync(join(here, "..", "build", "tl-forms.json"), "utf8"));
const table = JSON.parse(gunzipSync(readFileSync(join(root, "docs", "lexicon", "tl-roots.json.gz"))));

// A form that is a word of its own, not a form of the analyzer's root: form -> the word it counts for.
const SPLIT = JSON.parse(readFileSync(join(here, "split.json"), "utf8"));
// Roots the analyzer keeps apart that are one word for a learner: root -> the root it joins.
const JOIN = JSON.parse(readFileSync(join(here, "join.json"), "utf8"));

const byKey = new Map();
for (const [form, freq] of forms) {
  const a = tagalogLexeme(form, table);
  if (!a) continue;
  let key = SPLIT[form] || a.lemma;
  key = JOIN[key] || key;
  let e = byKey.get(key);
  if (!e) byKey.set(key, (e = { key, freq: 0, forms: [] }));
  e.freq += freq;
  e.forms.push([form, freq]);
}
const ranked = [...byKey.values()].sort((x, y) => y.freq - x.freq).slice(0, 4000)
  .map((e, i) => ({ rank: i + 1, ...e, freq: Number(e.freq.toPrecision(4)), forms: e.forms.slice(0, 10).map(([f, n]) => [f, Number(n.toPrecision(3))]) }));
writeFileSync(join(here, "..", "build", "tl-ranked.json"), JSON.stringify(ranked, null, 1));
console.log(`${byKey.size} words from ${forms.length} forms; top ${ranked.length} -> build/tl-ranked.json`);
