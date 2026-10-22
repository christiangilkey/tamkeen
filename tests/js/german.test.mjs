// Run with: node --test tests/js/
// German words: forms to their dictionary form with capitals kept, ß / ss / ae spellings, separable verbs
// (fängt … an is anfangen) and compound words taken apart. These read the real word table and meanings
// (docs/lexicon/de-lemmas.json.gz, de-meanings.json.gz, made by tools/build_lemmas.py and build_meanings.py).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { LemmaTable } from "../../web/js/lexicon/romance.js";
import {
  compoundLemma, compoundParts, germanLemma, germanLexemes, germanWord, separablePairs, startsSentence, tableKnows,
} from "../../web/js/lexicon/german.js";
import { answerFrom, germanLookUp, matchKey } from "../../web/js/lexicon/meaningdata.js";
import { lexemeOf, lexemesFor, usesDictionaries } from "../../web/js/lexicon/words.js";
import { LANGUAGES, LATIN_LANGUAGES, detectLanguage } from "../../web/js/languages.js";

const load = (name) => JSON.parse(gunzipSync(readFileSync(new URL(`../../docs/lexicon/${name}`, import.meta.url))).toString("utf8"));
const table = new LemmaTable(load("de-lemmas.json.gz"));
const meanings = [load("de-meanings.json.gz")];
const lemmas = (sentence) => germanLexemes(sentence.split(" "), table).map((x) => (x ? x.lemma : null));

test("German is taught and spoken: Latin letters, a word table, its own name", () => {
  assert.equal(LANGUAGES.de.name, "German");
  assert.ok(LATIN_LANGUAGES.includes("de"));
  assert.equal(detectLanguage("Das ist eine gute Frage, oder?", "de"), "de");
  assert.ok(usesDictionaries("de"));
  assert.ok(table.ranked, "the table's dictionary forms come commonest first");
  assert.ok(table.lemmas.indexOf("und") < 10 && table.lemmas.indexOf("Haus") < 1000);
});

test("a word as the table knows it: punctuation off, capitals kept, joined es off", () => {
  assert.equal(germanWord("„Häuser,"), "Häuser");
  assert.equal(germanWord("gibt's"), "gibt");
  assert.equal(germanWord("geht’s?"), "geht");
  assert.equal(germanWord("'s"), "es");
  assert.equal(germanWord("'ne"), "ein");
});

test("forms to their dictionary form, nouns with their capital", () => {
  const one = (w, initial = false) => germanLemma(w, table, initial);
  assert.equal(one("fängt"), "fangen");
  assert.equal(one("Häuser"), "Haus");
  assert.equal(one("Kindern"), "Kind");
  assert.equal(one("ging"), "gehen");
  assert.equal(one("gewesen"), "sein");
  assert.equal(one("größer"), "groß");
  assert.equal(one("angefangen"), "anfangen");
  assert.equal(one("anzufangen"), "anfangen");
  assert.equal(one("gibt's"), "geben");
  assert.equal(one("häuser"), "Haus", "a noun written in small letters (automatic captions) still finds its word");
});

test("ß and ss: today's spelling, the one from before 1996, Switzerland's, and ae/oe/ue for umlauts", () => {
  const one = (w) => germanLemma(w, table, false);
  for (const w of ["musste", "mußte"]) assert.equal(one(w), "müssen", w);
  assert.equal(one("daß"), "dass");
  assert.equal(one("dass"), "dass", "a word that never changes form is its own dictionary form");
  assert.equal(one("Fluß"), "Fluss", "the dictionary form is in today's spelling");
  assert.equal(one("rauh"), "rau");
  assert.equal(one("Strasse"), "Straße", "Switzerland writes ss: Straße keeps its ß");
  assert.equal(one("gross"), "groß");
  assert.equal(one("fuer"), "für");
  assert.equal(one("Muenchner"), "Münchner");
  assert.equal(one("Feuer"), "Feuer", "a real ue stays");
});

test("pronouns are each their own word, and a preposition with the article is the preposition", () => {
  const one = (w) => germanLemma(w, table, false);
  // (the word list folds them all into ich)
  assert.deepEqual(["mir", "mich", "dir", "ihm", "ihn", "uns", "euch", "ihnen", "wir", "sie"].map(one),
    ["ich", "ich", "du", "er", "er", "wir", "ihr", "sie", "wir", "sie"]);
  assert.equal(one("Sie"), "sie", "Sie said politely is still sie");
  assert.deepEqual(["im", "ins", "zum", "zur", "vom", "beim", "am"].map(one), ["in", "in", "zu", "zu", "von", "bei", "an"]);
  assert.deepEqual(["dein", "deine", "unsere", "eure", "ihren"].map(one), ["dein", "dein", "unser", "euer", "ihr"]);
});

test("capitals: a noun in the middle of a sentence, the other word at its start", () => {
  assert.deepEqual(lemmas("Wir essen heute. Das Essen ist fertig."), ["wir", "essen", "heute", "der", "Essen", "sein", "fertig"]);
  assert.equal(lemmas("Ich bin hier.")[0], "ich", "Ich at the start is ich, not das Ich");
  assert.equal(lemmas("Aber das stimmt.")[0], "aber");
  assert.equal(lemmas("Zeit ist Geld.")[0], "Zeit", "the noun, which Wiktionary's examples write far more than the preposition zeit");
  assert.ok(table.capsFirst.has("zeit") && !table.capsFirst.has("aber"));
  assert.ok(startsSentence(["Gut.", "Aber"], 1) && startsSentence(["„Aber"], 0) && !startsSentence(["das", "Aber"], 1));
  assert.equal(lexemeOf("Häuser", "de", [table]).key, "de|Haus|x", "a word on its own (a list word)");
});

test("separable verbs: the prefix at the end of the clause joins the verb", () => {
  assert.deepEqual(lemmas("Der Film fängt um acht Uhr an."), ["der", "Film", "anfangen", "um", "acht", "Uhr", "anfangen"]);
  const call = lemmas("Ich rufe dich morgen nach der Arbeit an, wenn ich Zeit habe.");
  assert.equal(call[1], "anrufen");
  assert.equal(call[7], "anrufen");
  assert.equal(call[11], "haben", "after the comma a new clause starts");
  assert.deepEqual(lemmas("Das Spiel findet am Samstag statt").slice(2), ["stattfinden", "an", "Samstag", "stattfinden"]);
  assert.deepEqual(lemmas("Sie sieht heute sehr gut aus und kommt morgen mit."),
    ["sie", "aussehen", "heute", "sehr", "gut", "aussehen", "und", "mitkommen", "morgen", "mitkommen"]);
  assert.equal(lemmas("Ich gebe nicht auf")[1], "aufgeben");
  assert.equal(lemmas("Er fängt den Ball.")[1], "fangen", "no prefix: the verb itself");
  assert.equal(lemmas("Er kommt aus Berlin.")[1], "kommen", "aus before a noun is a preposition");
  assert.equal(lemmas("Wir essen zusammen.")[1], "essen", "a rare verb (zusammenessen) isn't made up");
  assert.equal(lemmas("ich rufe dich an wenn ich kann")[1], "anrufen", "without punctuation (captions) a clause word ends it");
  const lex = germanLexemes("Wann fängt der Film an?".split(" "), table);
  assert.equal(lex[1].key, "de|anfangen|x");
  assert.equal(lex[1], lex[4], "both parts are one lexeme: seen together");
  assert.equal(lexemesFor("Er hängt mit Freunden rum.".split(" "), "de", [table])[1].lemma, "rumhängen");
  assert.equal(germanLemma("rumgehangen", table, false), "rumhängen", "a prefix joined on a form the table lacks");
  assert.deepEqual(separablePairs(["Er", "kommt", "an"], ["er", "kommen", "an"], (v) => v === "ankommen"), [[1, 2, "ankommen"]]);
});

test("compound words the table doesn't have are taken apart into everyday words", () => {
  const parts = (w) => (compoundParts(w, tableKnows(table), (l) => table.lemmas.indexOf(l)) || []).map((p) => p.lemma);
  assert.deepEqual(parts("Handschuhfabriken"), ["Hand", "Schuh", "Fabrik"]);
  assert.deepEqual(parts("Ausbildungsplatz"), ["Ausbildung", "Platz"], "the joining s comes off");
  assert.deepEqual(parts("Küchentisch"), ["Küche", "Tisch"], "Tisch, not the verb tischen");
  assert.equal(germanLemma("Handschuhfabriken", table, false), "Handschuhfabrik", "the compound's own dictionary form");
  assert.equal(germanLemma("Bewerbungsunterlagen", table, false), "Bewerbungsunterlage");
  assert.equal(germanLemma("hellblaues", table, false), "hellblau");
  assert.equal(germanLemma("kindergarten", table, false), "Kindergarten", "in small letters: Garten, not garen 'they cooked'");
  assert.equal(germanLemma("E-Mail-Adressen", table, false), "E-Mail-Adresse", "hyphens stay");
  assert.equal(compoundLemma([{ text: "Erdbeer", lemma: "Erdbeere" }, { text: "kuchen", lemma: "Kuchen" }]), "Erdbeerkuchen");
  assert.equal(compoundParts("Haus", tableKnows(table)), null, "short words aren't split");
});

test("No AI: the meanings files are keyed with ß as ss, like tools/build_meanings.py", () => {
  assert.equal(matchKey("Straße", "de"), "strasse");
  assert.equal(matchKey("daß", "de"), "dass");
  assert.ok(meanings[0].words.dass && meanings[0].words.strasse && meanings[0].words.anfangen);
});

const popup = (sentence, t = table) => {
  const word = sentence.match(/⟦([^⟧]+)⟧/)[1];
  const found = germanLookUp(meanings, word, sentence, { table: t });
  return found && answerFrom(found, word, "de", { source: found.source });
};

test("No AI: tapping either part of a separable verb shows the verb", () => {
  for (const s of ["Der Film ⟦fängt⟧ um acht an.", "Der Film fängt um acht ⟦an⟧."]) {
    const a = popup(s);
    assert.equal(a.lemma, "anfangen", s);
    assert.match(a.meaning, /begin|start/);
    assert.equal(a.morphology, "fängt … an: third-person singular present of anfangen");
  }
  assert.equal(popup("Er ⟦fängt⟧ den Ball.").lemma, "fangen");
  assert.equal(popup("⟦Kommst⟧ du morgen mit?").lemma, "mitkommen");
  assert.equal(popup("Der Film ⟦fängt⟧ um acht an.", null).lemma, "anfangen", "without the word table too");
});

test("No AI: capitals and ß choose the entry; a compound shows its parts", () => {
  assert.equal(popup("Das ⟦Essen⟧ ist fertig.").pos, "noun");
  assert.equal(popup("Wir ⟦essen⟧ zusammen.").pos, "verb");
  assert.equal(popup("Der ⟦Weg⟧ ist weit.").pos, "noun");
  assert.equal(popup("Der Schlüssel ist ⟦weg⟧.").pos, "adv");
  assert.equal(popup("Wir gehen ⟦weg⟧.").lemma, "weggehen", "here weg is gehen's prefix");
  const street = popup("Die ⟦Strasse⟧ ist lang.");
  assert.match(street.meaning, /street/);
  assert.equal(street.lemma, "Straße");
  assert.match(popup("Die ⟦Maße⟧ stimmen.").meaning, /measure/);
  assert.match(popup("Die ⟦Masse⟧ ist groß.").meaning, /mass/);
  assert.equal(popup("⟦Daß⟧ er kommt!").lemma, "dass");
  assert.equal(popup("Die ⟦Häuser⟧ sind alt.").lemma, "Haus");
  const gloves = popup("Er schloss die ⟦Handschuhfabriken⟧.");
  assert.equal(gloves.root, "Handschuh + Fabrik");
  assert.equal(gloves.lemma, "Handschuhfabrik");
  assert.match(gloves.meaning, /glove.* \+ .*factory/);
  assert.equal(gloves.other_meanings.length, 2);
  assert.match(gloves.explanation, /compound/);
  assert.ok(popup("Er schloss die ⟦Handschuhfabriken⟧.", null), "the parts are found without the word table too");
});
