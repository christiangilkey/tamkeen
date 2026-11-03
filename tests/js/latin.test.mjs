// Run with: node --test tests/js/
// Latin words: forms to their dictionary form (puellārum is puella, amāvisset is amō, est is sum), with or without
// macrons, j or i, v or u; -que, -ne and -ve written onto a word; and the word popup's built-in dictionary. These read
// the real word table and meanings (docs/lexicon/la-lemmas.json.gz, la-meanings.json.gz, made by
// tools/build_latin.py and tools/build_meanings.py).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { LemmaTable } from "../../web/js/lexicon/romance.js";
import { latinKey, latinLemma, latinLexeme, withoutEnclitic } from "../../web/js/lexicon/latin.js";
import { answerFrom, lookUp, matchKey, wordKeys } from "../../web/js/lexicon/meaningdata.js";
import { lexemeOf, lexemesFor, usesDictionaries } from "../../web/js/lexicon/words.js";
import { LANGUAGES, LATIN_LANGUAGES, detectLanguage } from "../../web/js/languages.js";
import { UI_LANGUAGES } from "../../web/js/i18n.js";
import { schemaFor, systemPrompt } from "../../web/js/definer.js";

const load = (name) => JSON.parse(gunzipSync(readFileSync(new URL(`../../docs/lexicon/${name}`, import.meta.url))).toString("utf8"));
const table = new LemmaTable(load("la-lemmas.json.gz"));
const meanings = [load("la-meanings.json.gz")];
const lemma = (w) => latinLexeme(w, table).lemma;
/** What the word popup shows for a word, from the built-in dictionary (as web/js/meanings.js asks it). */
function popup(word) {
  const keys = wordKeys(word, "la", (f) => lexemeOf(f, "la", [table])?.lemma);
  const found = lookUp(meanings, keys, word, "la", {});
  return found && answerFrom(found, word, "la", { source: found.source });
}

test("Latin is a language to learn, not a language for the app's own words", () => {
  assert.equal(LANGUAGES.la.name, "Latin");
  assert.equal(LANGUAGES.la.native, "Latīna");
  assert.equal(LANGUAGES.la.reading, "replace", "the popup shows the word with its macrons");
  assert.ok(LATIN_LANGUAGES.includes("la"));
  assert.ok(!UI_LANGUAGES.la);
  assert.equal(detectLanguage("Gallia est omnis dīvīsa in partēs trēs", "la"), "la");
  assert.ok(usesDictionaries("la"));
  // the AI popup is told it is teaching Latin, and to write the word with its macrons
  assert.match(JSON.stringify(schemaFor("la")), /macrons/);
  assert.match(systemPrompt("English", "la"), /expert Latin teacher/);
});

test("macrons, accents, j and v, æ and œ don't make another word", () => {
  for (const [a, b] of [["amō", "amo"], ["Dóminus", "dominus"], ["poëta", "poeta"], ["jam", "iam"], ["vir", "uir"],
    ["Iūlius", "julius"], ["cæli", "caeli"], ["cœpit", "coepit"], ["AMŌ", "amo"], ["amō", "amo"]]) {
    assert.equal(latinKey(a), latinKey(b), `${a} = ${b}`);
    assert.equal(matchKey(a, "la"), latinKey(b), `${a} (popup)`);
  }
  assert.equal(latinKey("liber"), latinKey("līber"), "(liber 'book' and līber 'free' are one spelling)");
});

test("forms find their dictionary form", () => {
  const cases = {
    puellarum: "puella", puellīs: "puella", amāvisset: "amō", amavit: "amō", amatus: "amō", amantibus: "amō",
    fuit: "sum", est: "sum", erant: "sum", fore: "sum", potuisset: "possum", ierunt: "eō", tulit: "ferō", latum: "ferō",
    dixit: "dīcō", ceperunt: "capiō", inquit: "inquam", vēnit: "veniō", hominum: "homo", militum: "mīles", urbem: "urbs",
    rem: "rēs", cuius: "quī", illud: "ille", eam: "is", mihi: "ego", Caesaris: "Caesar", Romae: "Rōma", Galliam: "Gallia",
    // a spelling two words share goes to the commoner (or the hand-checked) one
    legi: "lēx", regi: "rēx", canes: "canis", bella: "bellum", amor: "amor", quoque: "quoque", ita: "ita", magis: "magis",
    ibi: "ibi", fere: "fere", loco: "locus", fato: "fātum", sublatus: "tollō", duas: "duo", de: "dē", a: "ab", e: "ex",
  };
  for (const [form, want] of Object.entries(cases)) assert.equal(lemma(form), want, form);
  // written either way, one word
  assert.equal(lemma("jam"), "iam");
  assert.equal(lemma("uiri"), "vir");
  assert.equal(lemma("Dóminus"), "dominus");
  assert.equal(lemma("puellārum"), "puella");
});

test("-que, -ne and -ve come off when the word isn't known with them", () => {
  assert.equal(withoutEnclitic("senatusque"), "senatus");
  assert.equal(withoutEnclitic("uidesne"), "uides");
  assert.equal(withoutEnclitic("ne"), "", "(not the little word itself)");
  assert.equal(lemma("senatusque"), "senātus");
  assert.equal(lemma("virumque"), "vir");
  assert.equal(lemma("vidēsne"), "videō");
  // words that end that way of themselves stay themselves
  for (const w of ["atque", "itaque", "neque", "usque", "bene", "sine"]) assert.equal(lemma(w), w);
  assert.equal(latinLemma("plusve", table), "plūs");
});

test("seen words: one key per dictionary word, whatever the form or spelling", () => {
  const keys = lexemesFor("Arma virumque canō Trōiae quī prīmus ab ōrīs".split(" "), "la", [table]).map((x) => x.key);
  assert.deepEqual(keys, ["la|arma|x", "la|uir|x", "la|cano|x", "la|troia|x", "la|qui|x", "la|primus|x", "la|ab|x", "la|os|x"]);
  assert.equal(lexemeOf("amāvit", "la", [table]).key, lexemeOf("amo", "la", [table]).key);
  assert.equal(lexemeOf("uidi", "la", [table]).key, lexemeOf("vidēre", "la", [table]).key);
  // without the table (not downloaded yet): known by spelling, still without macrons
  assert.deepEqual(lexemeOf("Amō", "la"), { key: "la|amo|x", lemma: "amō", pos: "", root: "" });
  assert.equal(lexemeOf("…", "la"), null);
  assert.ok(table.ranked && table.lemmas.indexOf("sum") < 5 && table.lemmas.indexOf("puella") < 2000);
});

test("the word popup's built-in dictionary: the meaning, the form, the word with its macrons", () => {
  let a = popup("amavit");
  assert.equal(a.vocalized, "amāvit");
  assert.equal(a.lemma, "amō");
  assert.match(a.meaning, /^to love/);
  assert.match(a.morphology, /perfect active indicative/);
  a = popup("puellarum");
  assert.equal(a.vocalized, "puellārum");
  assert.match(a.meaning, /^girl/);
  assert.match(a.morphology, /genitive plural/);
  a = popup("est");
  assert.equal(a.lemma, "sum");
  assert.match(a.meaning, /^to be/);
  a = popup("legi");
  assert.equal(a.lemma, "lēx");
  // -que: the word without it, and which form that is
  a = popup("puellasque");
  assert.equal(a.lemma, "puella");
  assert.match(a.morphology, /accusative plural/);
  // names the word table reads as names come first (Gaul, not gallium); Troiae is Troy's genitive
  assert.match(popup("Gallia").meaning, /^Gaul/);
  assert.match(popup("Troiae").meaning, /^Troy/);
  assert.match(popup("Romae").meaning, /^Rome/);
  // a word with no macron is shown with its own (canō); one that needs none stays as it is
  assert.equal(popup("cano").vocalized, "canō");
  assert.match(popup("ita").meaning, /^so/);
  assert.match(popup("Dóminus").meaning, /master/);
});
