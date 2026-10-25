// Step 2 of the French basics course's word list: the written forms counted by forms.py, grouped by
// dictionary word (suis, est, sont and était all count for être) with the analyzer the app uses for
// seen words (web/js/lexicon/romance.js and docs/lexicon/fr-lemmas.json.gz), ranked by how common each
// dictionary word is in all its forms together.
//
//   node tools/course/fr/rank.mjs   ->  tools/course/build/fr-ranked.json
//     [{rank, lemma, freq, forms: [[form, freq], ...]}, ...]  (the top 2500)
//
// Two changes to the app's grouping, for the course only:
// - wordfreq splits l'homme into "l" and "homme": the elided pieces count for their whole word (l -> le,
//   j -> je, qu -> que, ...);
// - each pronoun is its own word (the app folds me and moi into je): learners meet me, moi and je as
//   three words, and a dictionary lists them so.
import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { LemmaTable, romanceLexeme } from "../../../web/js/lexicon/romance.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..", "..");
const build = join(here, "..", "build");
const forms = JSON.parse(readFileSync(join(build, "fr-forms.json"), "utf8"));
const table = new LemmaTable(JSON.parse(gunzipSync(readFileSync(join(root, "docs", "lexicon", "fr-lemmas.json.gz")))));

const ELIDED = { l: "le", d: "de", j: "je", c: "ce", qu: "que", n: "ne", s: "se", m: "me", t: "te", jusqu: "jusque",
  lorsqu: "lorsque", puisqu: "puisque", quoiqu: "quoique" };
const OWN = { me: "me", moi: "moi", te: "te", toi: "toi", se: "se", soi: "soi", lui: "lui", eux: "eux", leur: "leur",
  leurs: "leur", nous: "nous", vous: "vous", en: "en", y: "y", on: "on", ils: "il", elles: "elle", la: "le", les: "le",
  une: "un", cette: "ce", cet: "ce", ces: "ce", sa: "son", ses: "son", ma: "mon", mes: "mon", ta: "ton", tes: "ton",
  nos: "notre", vos: "votre", du: "de", au: "à", aux: "à", des: "des", ça: "ça", ca: "ça", cela: "cela", ceci: "ceci" };
// Forms the table gives to the wrong word (dans -> dan, mais -> mai, plus -> plaire, entre -> entrer,
// porte "door" -> porter): each goes to its commoner reading.
for (const w of ("dans mais plus sous fois vers fils cours entre devant maintenant puis part partie pendant durant " +
  "suivant passer tu sur bus porte portes entrée entrées arrivée sortie sorties pensée pensées découverte " +
  "reprise mort morte morts été lors avant ensemble mal bien").split(" ")) OWN[w] ??= w;
Object.assign(OWN, { parties: "partie", sure: "sûr", tue: "tuer", faites: "faire", fait: "faire", été: "être",
  yeux: "œil", oeil: "œil", œil: "œil", morte: "mort", morts: "mort", passé: "passer" });

const byLemma = new Map();
for (const [form, freq] of forms) {
  let lemma = ELIDED[form] || OWN[form];
  if (!lemma) {
    const a = romanceLexeme(form, "fr", table);
    if (!a) continue;
    lemma = a.lemma;
  }
  let e = byLemma.get(lemma);
  if (!e) byLemma.set(lemma, (e = { lemma, freq: 0, forms: [] }));
  e.freq += freq;
  e.forms.push([form, freq]);
}
const ranked = [...byLemma.values()].sort((x, y) => y.freq - x.freq).slice(0, 2500)
  .map((e, i) => ({ rank: i + 1, lemma: e.lemma, freq: Number(e.freq.toPrecision(4)),
    forms: e.forms.slice(0, 6).map(([f, n]) => [f, Number(n.toPrecision(3))]) }));
writeFileSync(join(build, "fr-ranked.json"), JSON.stringify(ranked, null, 1));
console.log(`${byLemma.size} dictionary words from ${forms.length} forms; top ${ranked.length} -> build/fr-ranked.json`);
