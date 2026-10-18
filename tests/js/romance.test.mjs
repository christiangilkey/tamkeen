// Run with: node --test tests/js/
// Spanish, French and Italian seen words: every form of a word must come out as one lexeme.
// These use a small hand-made word table; tests/js/lexicon.test.mjs checks the real ones.
import { test } from "node:test";
import assert from "node:assert/strict";
import { LemmaTable, cleanWord, romanceLexeme, withoutPronouns } from "../../web/js/lexicon/romance.js";
import { lexemeOf, lexemesFor, usesDictionaries, needsDictionaries } from "../../web/js/lexicon/words.js";

function table(lang, pairs, lemmas = []) {
  const all = [...new Set([...Object.values(pairs), ...lemmas])];
  const forms = Object.fromEntries(Object.entries(pairs).map(([f, l]) => [f, all.indexOf(l)]));
  return new LemmaTable({ format: 1, kind: "lemmas", name: lang, lang, lemmas: all, forms });
}

const es = table("es", {
  hablas: "hablar", hablaste: "hablar", hablemos: "hablar", habla: "hablar", hablando: "hablar",
  da: "dar", di: "dar", comiendo: "comer", libros: "libro", ligas: "liga", liguemos: "ligar", ligaste: "ligar",
  casas: "casa", está: "estar", estás: "estar", sentad: "sentar", sentemos: "sentar", vamos: "ir", come: "comer",
}, ["decir", "pelo", "esta", "liga", "ligar", "hacer", "pedir"]);
const fr = table("fr", { ai: "avoir", est: "être", donne: "donner", dis: "dire", allez: "aller", hommes: "homme" },
  ["homme", "aujourd'hui", "peut-être", "il"]);
const it = table("it", { "po'": "poco", mangiando: "mangiare", parlami: "parlare", parliamo: "parlare" },
  ["mangiare", "dire", "dare", "anno", "porre", "fare", "di", "da"]);
const key = (word, lang, t) => romanceLexeme(word, lang, t).key;

test("Spanish conjugations, subjunctive and imperative are one verb", () => {
  for (const w of ["hablar", "hablas", "Hablaste", "hablemos,", "¡Habla!", "hablando"]) assert.equal(key(w, "es", es), "es|hablar|x", w);
  assert.equal(key("liguemos", "es", es), "es|ligar|x");
  assert.equal(key("ligaste", "es", es), "es|ligar|x");
  assert.equal(key("ligas", "es", es), "es|liga|x", "a spelling with two readings takes the table's choice");
  assert.equal(key("libros", "es", es), "es|libro|x");
  assert.notEqual(key("está", "es", es), key("esta", "es", es), "accents are kept: está is estar, esta is not");
});

test("Spanish pronouns joined to a verb come off: dámelo is dar", () => {
  assert.equal(key("dámelo", "es", es), "es|dar|x");
  assert.equal(key("Decirle", "es", es), "es|decir|x");
  assert.equal(key("comiéndoselo", "es", es), "es|comer|x");
  assert.equal(key("cómetelo", "es", es), "es|comer|x");
  assert.equal(key("díselo", "es", es), "es|decir|x", "di + se + lo is the command of decir, not 'I gave'");
  assert.equal(key("hazlo", "es", es), "es|hacer|x");
  assert.equal(key("vámonos", "es", es), "es|ir|x", "vamos loses its -s before nos");
  assert.equal(key("sentaos", "es", es), "es|sentar|x", "sentad loses its -d before os");
  assert.equal(key("sentémonos", "es", es), "es|sentar|x");
  assert.equal(key("pelo", "es", es), "es|pelo|x", "a word the table knows is never cut up (pe + lo)");
  assert.equal(key("pidiéndoles", "es", es), "es|pidiéndoles|x", "only taken off when what is left is a known verb form");
});

test("French: elided words and pronouns after a command", () => {
  assert.equal(key("l'homme", "fr", fr), "fr|homme|x");
  assert.equal(key("L’homme", "fr", fr), "fr|homme|x", "curly apostrophe and capitals");
  assert.equal(key("hommes", "fr", fr), "fr|homme|x");
  assert.equal(key("j'ai", "fr", fr), "fr|avoir|x");
  assert.equal(key("c'est", "fr", fr), "fr|être|x");
  assert.equal(key("qu'il", "fr", fr), "fr|il|x");
  assert.equal(key("donne-moi", "fr", fr), "fr|donner|x");
  assert.equal(key("dis-le", "fr", fr), "fr|dire|x");
  assert.equal(key("allez-vous-en", "fr", fr), "fr|aller|x");
  assert.equal(key("aujourd'hui", "fr", fr), "fr|aujourd'hui|x", "not an elision");
  assert.equal(key("peut-être", "fr", fr), "fr|peut-être|x", "a word with a hyphen that the table knows stays whole");
});

test("Italian: elided words and pronouns joined to a verb", () => {
  assert.equal(key("dell'anno", "it", it), "it|anno|x");
  assert.equal(key("l'anno", "it", it), "it|anno|x");
  assert.equal(key("po'", "it", it), "it|poco|x", "po' keeps its apostrophe: it is the word");
  assert.equal(key("mangiarlo", "it", it), "it|mangiare|x");
  assert.equal(key("mangiandolo", "it", it), "it|mangiare|x");
  assert.equal(key("porlo", "it", it), "it|porre|x");
  assert.equal(key("dimmi", "it", it), "it|dire|x");
  assert.equal(key("dammelo", "it", it), "it|dare|x");
  assert.equal(key("fallo", "it", it), "it|fare|x");
  assert.equal(key("parlami", "it", it), "it|parlare|x");
  assert.equal(key("di", "it", it), "it|di|x", "on its own, di is the word 'of'");
});

test("without the table a word is its spelling, as before, but elisions still come off", () => {
  assert.equal(key("Hablas", "es"), "es|hablas|x");
  assert.equal(key("dámelo", "es"), "es|dámelo|x");
  assert.equal(key("l'homme", "fr"), "fr|homme|x");
  assert.equal(romanceLexeme("2024", "es"), null, "numbers aren't words");
  assert.equal(romanceLexeme("—", "fr"), null);
  // A word already in its dictionary form keeps the key it had before tables existed, so words
  // seen back then still count.
  assert.equal(key("hablar", "es", es), key("hablar", "es"));
});

test("the language plumbing", () => {
  assert.deepEqual(["ar", "es", "fr", "it", "ru", "ja"].map(usesDictionaries), [true, true, true, true, false, false]);
  assert.deepEqual(["ar", "es"].map(needsDictionaries), [true, false], "only Arabic waits for its dictionaries");
  assert.deepEqual(lexemesFor(["Hablas", "dámelo"], "es", [es]).map((x) => x.key), ["es|hablar|x", "es|dar|x"]);
  assert.deepEqual(lexemesFor(["Hablas"], "es", null).map((x) => x.key), ["es|hablas|x"]);
  assert.equal(lexemeOf("comiéndoselo", "es", [es]).lemma, "comer");
  assert.equal(cleanWord("«¿Qué?»", "es"), "qué");
  assert.ok(withoutPronouns("dámelo", "es").includes("da"), "dá + me + lo, accent dropped");
  assert.throws(() => new LemmaTable({ format: 2, kind: "lemmas" }));
});

// ---------- the real tables (docs/lexicon/<lang>-lemmas.json.gz, made by tools/build_lemmas.py) ----------
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const real = (lang) => new LemmaTable(JSON.parse(gunzipSync(readFileSync(fileURLToPath(new URL(`../../docs/lexicon/${lang}-lemmas.json.gz`, import.meta.url))))));
const lemmas = (lang, words) => { const t = real(lang); return words.split(" ").map((w) => romanceLexeme(w, lang, t).lemma); };

test("real Spanish table: conjugations, subjunctive, pronouns, plurals and gender", () => {
  assert.deepEqual(lemmas("es", "ligar liguemos ligué ligaste"), ["ligar", "ligar", "ligar", "ligar"]);
  assert.deepEqual(lemmas("es", "hable hablemos hablara hablase háblame"), Array(5).fill("hablar"));
  assert.deepEqual(lemmas("es", "dámelo decirle comiéndoselo díselo vámonos hazlo levantándome"),
    ["dar", "decir", "comer", "decir", "ir", "hacer", "levantar"]);
  assert.deepEqual(lemmas("es", "tengo tuve tendré hizo dijeron puedo quise voy íbamos"),
    ["tener", "tener", "tener", "hacer", "decir", "poder", "querer", "ir", "ir"]);
  assert.deepEqual(lemmas("es", "bonita bonitos niña niños perros grandes mejores"),
    ["bonito", "bonito", "niño", "niño", "perro", "grande", "mejor"]);
  assert.deepEqual(lemmas("es", "casa casas caso"), ["casa", "casa", "caso"], "a common word is never swallowed by a rarer verb");
  assert.notEqual(lemmas("es", "está")[0], lemmas("es", "esta")[0]);
});

test("real French and Italian tables", () => {
  assert.deepEqual(lemmas("fr", "suis était été allée beaux yeux j'ai c'est donne-moi mangeons chevaux aujourd'hui"),
    ["être", "être", "être", "aller", "beau", "oeil", "avoir", "être", "donner", "manger", "cheval", "aujourd'hui"]);
  assert.deepEqual(lemmas("it", "sono stata belle begli mangiarlo dimmi dammelo andiamo uomini dell'anno po' amiche"),
    ["essere", "essere", "bello", "bello", "mangiare", "dire", "dare", "andare", "uomo", "anno", "poco", "amico"]);
});
