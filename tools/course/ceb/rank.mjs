// Bisaya's word list for its basics course: the commonest written forms grouped by root (mokaon,
// gikaon, kaona all count for kaon) with the analyzer the app uses for seen words
// (web/js/lexicon/cebuano.js), ranked by how common each root is in all its forms together.
//
//   node tools/course/ceb/rank.mjs   ->  tools/course/build/ceb-ranked.json
//     [{rank, lemma, freq, forms: [[form, formRank], ...]}, ...]  (the top 3000)
//
// Bisaya isn't in wordfreq. Its forms come from docs/lexicon/ceb-roots.json.gz: the 60,000 commonest
// words of the Cebuano web text of OPUS's NLLB collection (ODC-By 1.0), most common first, without
// their counts. A form's count is estimated from its place in that list (Zipf's law: the n-th commonest
// is said about 1/n as often as the commonest), which is enough to put the roots in order.
// The course's own words (tools/course/ceb/words.json) are chosen from this list by hand.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cebuanoRoot } from "../../../web/js/lexicon/cebuano.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..", "..");
const table = JSON.parse(gunzipSync(readFileSync(join(root, "docs", "lexicon", "ceb-roots.json.gz"))));
const FORMS = 20000; // the commonest forms; rarer ones barely move the order of the top roots

// Spellings of one word (sulud is sulod, jud is gyud), and short forms of a word (wa: wala, di: dili,
// sad and pud: usab, naay: naa + y): counted with it. Keys are roots as the analyzer gives them.
const SAME = {
  sulud: "sulod", abut: "abot", hangtud: "hangtod", tibuuk: "tibuok", sabut: "sabot", diyos: "dios",
  gayud: "gyud", jud: "gyud", gud: "gyud", gyod: "gyud", gayod: "gyud", kon: "kung", kun: "kung",
  sunud: "sunod", tinuud: "tinuod", daku: "dako", nasod: "nasud", lalake: "lalaki", lisod: "lisud",
  tarung: "tarong", sayup: "sayop", tigom: "tigum", tanum: "tanom", sya: "siya", pod: "usab", pud: "usab",
  sad: "usab", sab: "usab", wa: "wala", walay: "wala", di: "dili", naton: "nato", namon: "namo", aton: "ato",
  laum: "laom", daug: "daog", kompaniya: "kompanya", kostumer: "kustomer", dunay: "aduna", duna: "aduna",
  adunay: "aduna", naay: "naa", anaa: "naa", maoy: "mao", unsay: "unsa", unsang: "unsa", kining: "kini",
  ning: "kini", kanang: "kana", akon: "akoa", murag: "mura", bisag: "bisan", lng: "lang", nalang: "lang",
  hibaw: "hibalo", seguro: "siguro", tibook: "tibuok", mubu: "mubo", gahom: "gahum", looy: "luoy",
  libut: "libot", barug: "barog", syudad: "siyudad", ciudad: "siyudad", kusug: "kusog", kuwarta: "kwarta",
  polis: "pulis", biblia: "bibliya", eskuyla: "eskwela", daut: "daot", hesus: "jesus", amon: "amo",
  kaau: "kaayo", dli: "dili", dire: "diri", morag: "mura", mora: "mura", iyaha: "iya", ilaha: "ila",
  imoha: "imo", tuiga: "tuig", kula: "kulang", kinsay: "kinsa", customer: "kustomer",
};
// Words the analyzer takes to a root they have grown away from (mahimo "can" is not himo "to make";
// kinabuhi "life" is not buhi "alive"), or to the wrong root (kan-on, cooked rice, is not kani, this).
const OWN = {
  mahimo: "mahimo", mahimong: "mahimo", kinabuhi: "kinabuhi", kinabuhing: "kinabuhi", kalibutan: "kalibutan",
  kalibotan: "kalibutan", tinuod: "tinuod", tinuud: "tinuod", pagkatinuod: "tinuod", katinuod: "tinuod",
  katinuud: "tinuod", katungod: "katungod", katungdanan: "katungod", pinulongan: "pinulongan",
  pinulongang: "pinulongan", panglawas: "panglawas", sakyanan: "sakyanan", magtutudlo: "magtutudlo",
  kinaiyahan: "kinaiyahan", kalihokan: "kalihokan", kalihukan: "kalihokan", kagamhanan: "kagamhanan",
  "kan-on": "kan-on", "kan-anan": "kaon", natawo: "natawo", matawo: "natawo", pagkatawo: "natawo",
  "tinun-an": "tinun-an", simbahan: "simbahan", simbahang: "simbahan", tindahan: "tindahan",
  higdaan: "higdaan", higdaanan: "higdaan", dalaga: "dalaga", magulang: "magulang", utang: "utang",
  utanon: "utanon", unlan: "unlan", "nakat-onan": "kat-on", "makat-onan": "kat-on", kapuslanan: "pulos",
  hukmanan: "hukom", kawatan: "kawat", pipila: "pipila", bintana: "bintana",
  pantalon: "pantalon", kabayo: "kabayo", pagtuo: "tuo", nagtuo: "tuo", motuo: "tuo", pagtoo: "tuo",
  paingon: "paingon",
};
const PIECES = [["pakita", "pakita"], ["padayon", "padayon"], ["bantay", "bantay"]]; // a form with this in it

function lemmaOf(form) {
  if (OWN[form]) return OWN[form];
  for (const [piece, lemma] of PIECES) if (form.includes(piece)) return lemma;
  let lemma = cebuanoRoot(form, table);
  if (lemma === "kita" && form !== "kita" && form !== "kitang") lemma = "makita"; // to see, not "we"
  if (lemma === "wala" && /^(?:na|ma|pagka|ka)wala/.test(form)) lemma = "mawala"; // to be lost
  return SAME[lemma] || lemma;
}

const byRoot = new Map();
table.lemmas.slice(0, FORMS).forEach((form, i) => {
  const lemma = lemmaOf(form);
  let e = byRoot.get(lemma);
  if (!e) byRoot.set(lemma, (e = { lemma, freq: 0, forms: [] }));
  e.freq += 1 / (i + 1);
  e.forms.push([form, i + 1]);
});
const ranked = [...byRoot.values()].sort((x, y) => y.freq - x.freq).slice(0, 3000)
  .map((e, i) => ({ rank: i + 1, lemma: e.lemma, freq: Number((e.freq * 1000).toPrecision(4)), forms: e.forms.slice(0, 8) }));
mkdirSync(join(here, "..", "build"), { recursive: true });
writeFileSync(join(here, "..", "build", "ceb-ranked.json"), JSON.stringify(ranked, null, 1));
console.log(`${byRoot.size} roots from ${FORMS} forms; top ${ranked.length} -> tools/course/build/ceb-ranked.json`);
