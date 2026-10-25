// Step 2 of the German basics course's word list: the written forms counted by forms.py, grouped by
// dictionary word (Häuser and Haus count for Haus; ging, geht and gegangen for gehen) with the analyzer
// the app uses for seen words (web/js/lexicon/german.js and its table, docs/lexicon/de-lemmas.json.gz),
// ranked by how common each dictionary word is in all its forms together.
//
//   node tools/course/de/rank.mjs   ->  tools/course/build/de-ranked.json
//     [{rank, lemma, freq, alt, forms: [[form, freq], ...]}, ...]  (the top 2500)
//
// wordfreq writes every word in small letters, so "tag" could be the verb tagen or the noun der Tag. A form
// the table says is commoner as a noun (its caps_first list: tag, zeit, frage) counts for the noun; FIX
// settles some more by hand, and SPLIT shares a form between two words that are both common (leben: the
// verb, and das Leben). `alt` names the other word a form could be, for choosing by hand.
import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { LemmaTable } from "../../../web/js/lexicon/romance.js";
import { germanLemma } from "../../../web/js/lexicon/german.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..", "..");
const build = join(here, "..", "build");
const forms = JSON.parse(readFileSync(join(build, "de-forms.json"), "utf8"));
const data = JSON.parse(gunzipSync(readFileSync(join(root, "docs", "lexicon", "de-lemmas.json.gz"))));
const table = new LemmaTable(data);
const capsFirst = new Set(data.caps_first);

// The possessive sein and ihr are other words than the verb sein and the pronoun ihr ("you").
const FIX = {
  muss: "müssen", weiss: "wissen", weiß: "wissen", frau: "Frau", frauen: "Frau", einer: "ein",
  deutschen: "deutsch", beiden: "beide", beider: "beide", aller: "alle", all: "alle",
  erste: "erste", ersten: "erste", erster: "erste", erstes: "erste", erstem: "erste",
  stunde: "Stunde", stunden: "Stunde", fragen: "Frage", spiele: "Spiel",
  seine: "sein (his)", seiner: "sein (his)", seinen: "sein (his)", seinem: "sein (his)", seines: "sein (his)",
  ihre: "ihr (her)", ihrer: "ihr (her)", ihren: "ihr (her)", ihrem: "ihr (her)", ihres: "ihr (her)",
  macht: "machen", halt: "halt", stand: "stehen", lage: "Lage", was: "was", gehört: "gehören",
};
const SPLIT = {
  leben: ["leben", "Leben"], essen: ["essen", "Essen"], weg: ["weg", "Weg"], morgen: ["morgen", "Morgen"],
  recht: ["recht", "Recht"], mal: ["mal", "Mal"], sein: ["sein", "sein (his)"], ihr: ["ihr", "ihr (her)"],
  teilen: ["teilen", "Teil"], stellen: ["stellen", "Stelle"], wissen: ["wissen", "Wissen"],
  spielen: ["spielen", "Spiel"], arbeiten: ["arbeiten", "Arbeit"],
};

function lemmasOf(form) {
  if (SPLIT[form]) return SPLIT[form];
  if (FIX[form]) return [FIX[form]];
  const cap = form.charAt(0).toUpperCase() + form.slice(1);
  const l = capsFirst.has(form) ? germanLemma(cap, table, false) : germanLemma(form, table, true);
  return l ? [l] : [];
}

const byLemma = new Map();
for (const [form, freq] of forms) {
  const ls = lemmasOf(form);
  const cap = form.charAt(0).toUpperCase() + form.slice(1);
  const other = germanLemma(cap, table, false);
  for (const lemma of ls) {
    let e = byLemma.get(lemma);
    if (!e) byLemma.set(lemma, (e = { lemma, freq: 0, alt: new Set(), forms: [] }));
    e.freq += freq / ls.length;
    e.forms.push([form, freq / ls.length]);
    if (other && !ls.includes(other)) e.alt.add(other);
  }
}
const ranked = [...byLemma.values()].sort((x, y) => y.freq - x.freq).slice(0, 2500)
  .map((e, i) => ({ rank: i + 1, lemma: e.lemma, freq: Number(e.freq.toPrecision(4)), alt: [...e.alt].slice(0, 3),
    forms: e.forms.slice(0, 6).map(([f, n]) => [f, Number(n.toPrecision(3))]) }));
writeFileSync(join(build, "de-ranked.json"), JSON.stringify(ranked, null, 1));
console.log(`${byLemma.size} dictionary words from ${forms.length} forms; top ${ranked.length} -> build/de-ranked.json`);
