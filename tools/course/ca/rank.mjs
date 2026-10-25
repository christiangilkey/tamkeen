// Step 2 of the Catalan basics course's word list: the written forms counted by forms.py, grouped by
// dictionary word (parlem, parlava and parlo all count for parlar) with the analyzer the app uses for
// seen words (web/js/lexicon/romance.js and docs/lexicon/ca-lemmas.json.gz), ranked by how common each
// dictionary word is in all its forms together.
//
//   node tools/course/ca/rank.mjs   ->  tools/course/build/ca-ranked.json
//     [{rank, lemma, freq, forms: [[form, freq], ...]}, ...]  (the top 2000)
//
// A few groupings are set by hand: vaig, vas, va, vam, vau, van are counted apart from anar, since in
// writing they are nearly always the past-tense helper (va dir "he said"); al, del, pel and the rest are
// a preposition joined to the article, counted with the preposition.
import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { LemmaTable, romanceLexeme } from "../../../web/js/lexicon/romance.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..", "..");
const build = join(here, "..", "build");
const forms = JSON.parse(readFileSync(join(build, "ca-forms.json"), "utf8"));
const table = new LemmaTable(JSON.parse(gunzipSync(readFileSync(join(root, "docs", "lexicon", "ca-lemmas.json.gz")))));

const HAND = {
  vaig: "va (past)", vas: "va (past)", va: "va (past)", vam: "va (past)", vau: "va (past)", van: "va (past)",
  vàrem: "va (past)", vàreu: "va (past)", varen: "va (past)",
  al: "a", als: "a", del: "de", dels: "de", pel: "per", pels: "per", can: "ca",
  la: "el", les: "el", els: "el", lo: "el", los: "el", l: "el",
  d: "de", s: "es", se: "es", m: "em", me: "em", t: "et", te: "et", n: "en", ne: "en",
  em: "em", et: "et", ens: "ens", nos: "ens", us: "us", vos: "us", li: "li", lis: "li", jo: "jo", mi: "jo", dues: "dos",
  // Words the table reads as a form of another word (com is not a form of comar, entre not of entrar).
  com: "com", entre: "entre", fins: "fins", encara: "encara", durant: "durant", cal: "caldre", calen: "caldre",
  crec: "creure", vol: "voler", vols: "voler", partit: "partit", partits: "partit", treball: "treball",
  treballs: "treball", porta: "porta", portes: "porta", dades: "dada", dada: "dada", segons: "segons",
  sentit: "sentit", sentits: "sentit", mort: "mort", morts: "mort", present: "present", presents: "present",
  pas: "pas", passos: "pas", viu: "viure", entrada: "entrada", entrades: "entrada", espera: "esperar",
  ajuda: "ajuda", ajudes: "ajuda", mirada: "mirada", sortida: "sortida", sortides: "sortida",
  trobada: "trobada", trobades: "trobada", partida: "partida", partides: "partida", oferta: "oferta",
  ofertes: "oferta", pregunta: "pregunta", preguntes: "pregunta", lluita: "lluita", lluites: "lluita",
  defensa: "defensa", marxa: "marxa", intent: "intent", intents: "intent", record: "record", records: "record",
  tracte: "tracte", mostra: "mostra", mostres: "mostra", format: "format", formats: "format",
  passada: "passat", passat: "passat", passats: "passat", passades: "passat", unit: "unit", units: "unit",
  unida: "unit", unides: "unit", deu: "deu", obert: "obert", oberta: "obert", oberts: "obert", obertes: "obert",
  conegut: "conegut", coneguda: "conegut", coneguts: "conegut", conegudes: "conegut",
  presa: "presa", preses: "presa", dura: "dur", vista: "vista", vistes: "vista", torn: "torn",
};

const byLemma = new Map();
for (const [form, freq] of forms) {
  if (!/\p{L}/u.test(form)) continue;
  const lemma = HAND[form] || romanceLexeme(form, "ca", table)?.lemma;
  if (!lemma) continue;
  let e = byLemma.get(lemma);
  if (!e) byLemma.set(lemma, (e = { lemma, freq: 0, forms: [] }));
  e.freq += freq;
  e.forms.push([form, freq]);
}
const ranked = [...byLemma.values()].sort((x, y) => y.freq - x.freq).slice(0, 2000)
  .map((e, i) => ({ rank: i + 1, lemma: e.lemma, freq: Number(e.freq.toPrecision(4)),
    forms: e.forms.slice(0, 6).map(([f, n]) => [f, Number(n.toPrecision(3))]) }));
writeFileSync(join(build, "ca-ranked.json"), JSON.stringify(ranked, null, 1));
console.log(`${byLemma.size} dictionary words from ${forms.length} forms; top ${ranked.length} -> build/ca-ranked.json`);
