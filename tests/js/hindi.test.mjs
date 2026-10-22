// Run with: node --test tests/js/
// Hindi (web/js/lexicon/hindi.js): words kept whole with their vowel signs, how they are said (the
// readings drawn over Hindi text), which dictionary word a form belongs to, and the word popup's
// meanings. Reads the real tables in docs/lexicon/ (tools/build_hindi.py, tools/build_meanings.py).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { HindiReadings, hasDevanagari, hindiCandidates, hindiKey, hindiLemma, hindiLexeme, hindiReading, hindiWord, romanize } from "../../web/js/lexicon/hindi.js";
import { LemmaTable } from "../../web/js/lexicon/romance.js";
import { lexemesFor } from "../../web/js/lexicon/words.js";
import { answerFrom, lookUp, matchKey, wordKeys } from "../../web/js/lexicon/meaningdata.js";
import { detectLanguage, LANGUAGES } from "../../web/js/languages.js";
import { EDGE_PUNCT } from "../../web/js/wordlookup.js";

const file = (name) => JSON.parse(gunzipSync(readFileSync(new URL(`../../docs/lexicon/${name}`, import.meta.url))).toString("utf8"));
const table = new LemmaTable(file("hi-lemmas.json.gz"));
const meanings = file("hi-meanings.json.gz");

test("a word stays whole: vowel signs, conjuncts, nukta and virama are part of it", () => {
  for (const w of ["किताब", "क्षत्रिय", "ज़िंदगी", "प्रधानमंत्री", "उन्होंने", "हूँ", "दुःख"]) {
    assert.equal(hindiWord(w), w);
    assert.equal(w.replace(EDGE_PUNCT, ""), w, `${w}: no part of it is punctuation`);
    assert.equal(lexemesFor([w], "hi", [table])[0].lemma.length > 0, true);
  }
  // punctuation round a word, the full stop । included, comes off
  assert.deepEqual(["“नमस्ते!”", "किताब।", "(हिन्दी)", "हाँ॥", "क्या?"].map(hindiWord), ["नमस्ते", "किताब", "हिन्दी", "हाँ", "क्या"]);
  // numbers are no words
  assert.equal(hindiLexeme("१२३"), null);
  assert.ok(hasDevanagari("hello नमस्ते") && !hasDevanagari("hello"));
});

test("readings: long vowels, retroflex sounds, nasal vowels, and the a that isn't said", () => {
  const cases = {
    "नमस्ते": "namaste", "कमरा": "kamrā", "समझना": "samajhnā", "हैं": "haĩ", "हूँ": "hū̃", "मैं": "maĩ", "में": "mẽ",
    "ज्ञान": "gyān", "हिंदी": "hindī", "ज़िंदगी": "zindagī", "किताब": "kitāb", "लड़का": "laṛkā", "अच्छा": "achchhā",
    "भारत": "bhārat", "दोस्त": "dost", "करना": "karnā", "क्या": "kyā", "बहुत": "bahut", "संगीत": "saṅgīt", "आपका": "āpkā",
    "चाहिए": "chāhie", "मित्र": "mitra", "राज्य": "rājya", "उन्होंने": "unhõne", "मैंने": "maĩne", "ठंडा": "ṭhaṇḍā",
    "संबंध": "sambandh", "करेंगे": "kareṅge", "क्षेत्र": "kshetra", "फ़िल्म": "film", "ऑफ़िस": "ôfis",
  };
  for (const [word, reading] of Object.entries(cases)) assert.equal(romanize(word), reading, word);
  // a line, word by word; punctuation left out, Latin words left as they are
  assert.equal(hindiReading("मैं घर जा रहा हूँ।"), "maĩ ghar jā rahā hū̃");
  assert.equal(hindiReading("आप कैसे हैं? OK"), "āp kaise haĩ OK");
  assert.equal(hindiReading("hello"), "");
});

test("the word table's readings (Wiktionary's, where the rule says otherwise) win", () => {
  const readings = new HindiReadings(table);
  const own = Object.entries(table.readings);
  assert.ok(own.length > 5000);
  for (const [word, reading] of own.slice(0, 50)) assert.equal(readings.word(word), reading, word);
  assert.ok(own.some(([word, reading]) => romanize(word) !== reading), "they differ from the rule");
  // without the table, the rule
  assert.equal(new HindiReadings().word("नमस्ते"), "namaste");
  assert.equal(readings.reading("मैं घर जा रहा हूँ।"), "maĩ ghar jā rahā hū̃");
});

test("spellings people write two ways are one word", () => {
  for (const [a, b] of [["ज़रूर", "जरूर"], ["हूँ", "हूं"], ["गये", "गए"], ["नयी", "नई"], ["लिये", "लिए"], ["हिन्दी", "हिंदी"],
    ["सम्बन्ध", "संबंध"], ["ठण्डा", "ठंडा"], ["गङ्गा", "गंगा"], ["क़लम", "कलम"]]) {
    assert.equal(hindiKey(a), hindiKey(b), `${a} ${b}`);
  }
  // and nothing else is folded: न्य, न्म, म्ह keep their letters
  for (const w of ["अन्य", "जन्म", "तुम्हारा", "उन्होंने"]) assert.equal(hindiKey(w), w);
  assert.equal(hindiKey("क\u{94D}\u{200D}ष"), "क्ष", "a zero-width joiner only changes the drawing");
  assert.equal(matchKey("ज़रूर", "hi"), "जरूर");
});

test("forms lead to their dictionary word, with the table", () => {
  const cases = {
    "लड़कों": "लड़का", "लड़के": "लड़का", "बच्चों": "बच्चा", "लड़कियाँ": "लड़की", "किताबें": "किताब", "बड़ी": "बड़ा",
    "किया": "करना", "गए": "जाना", "गयी": "जाना", "गया": "जाना", "जाने": "जाना", "लगा": "लगना", "दिया": "देना",
    "करूँगा": "करना", "पढ़ेंगे": "पढ़ना", "खाया": "खाना", "करते": "करना", "बोलती": "बोलना", "जाकर": "जाना", "सकते": "सकना",
    "है": "होना", "था": "होना", "हुईं": "होना", "समझाते": "समझाना", "की": "का", "के": "का", "सभी": "सब", "सी": "सा",
    "हिन्दी": "हिंदी", "सम्बन्ध": "संबंध",
  };
  for (const [form, lemma] of Object.entries(cases)) assert.equal(hindiLemma(form, table), lemma, form);
  // words of their own that look like another word's form stay themselves
  for (const w of ["पानी", "पिता", "माता", "भाई", "बहन", "लड़का", "लड़की", "सही", "भाग", "जल", "सर", "धरती", "लिए"]) {
    assert.equal(hindiLemma(w, table), w, w);
  }
  // a form the table doesn't know has its ending taken off
  assert.ok(hindiCandidates("समझाते").includes("समझाना"));
  assert.ok(hindiCandidates("लड़कों").includes("लड़का"));
});

test("without the table: the spelling, and the irregular verbs", () => {
  assert.equal(hindiLemma("किया", null), "करना");
  assert.equal(hindiLemma("गए", null), "जाना");
  assert.equal(hindiLemma("है", null), "होना");
  assert.equal(hindiLemma("लड़कों", null), "लड़कों");
});

test("seen words: every form of a word is the one word", () => {
  const keys = (words) => lexemesFor(words, "hi", [table]).map((x) => x.key);
  const [boys, boysObl, boy] = keys(["लड़के", "लड़कों", "लड़का"]);
  assert.equal(boys, boy);
  assert.equal(boysObl, boy);
  assert.equal(new Set(keys(["किया", "करता", "करूँगा", "करना"])).size, 1);
  assert.equal(new Set(keys(["हिन्दी", "हिंदी"])).size, 1);
  assert.notEqual(...keys(["लड़का", "लड़की"]), "a girl is not a boy");
  assert.ok(keys(["नमस्ते"])[0].startsWith("hi|") && keys(["नमस्ते"])[0].split("|").length === 3);
});

test("the word popup's meanings: a form shows its word, a word of its own shows itself", () => {
  const lemmaOf = (w) => hindiLemma(w, table);
  const look = (word) => {
    const found = lookUp([meanings], wordKeys(word, "hi", lemmaOf), word, "hi");
    return found && answerFrom(found, word, "hi", { source: found.source });
  };
  const boys = look("लड़कों");
  assert.equal(boys.lemma, "लड़का");
  assert.match(boys.meaning, /boy/);
  assert.match(boys.morphology, /oblique plural/);
  assert.match(look("किया").meaning, /to do/);
  assert.match(look("दिया").meaning, /to give/, "दिया is 'gave' before 'lamp'");
  assert.match(look("लगा").meaning, /to seem|to be attached|to stick/, "लगना's, not the stem of लगाना");
  assert.match(look("पानी").meaning, /water/, "not पाना's 'get', whatever the endings suggest");
  assert.match(look("पिता").meaning, /father/);
  assert.match(look("और").meaning, /^and/);
  assert.match(look("अगर").meaning, /^if/);
  assert.match(look("समय").meaning, /^time/);
  assert.match(look("के लिए").meaning, /for/);
  assert.match(look("लिए").meaning, /for/, "the last word of के लिए has its meaning");
  assert.match(look("समझाते").meaning, /explain/);
  // no "nuqtaless form of" for a word written without its nukta: the word's meanings
  assert.doesNotMatch(look("काफी").meaning, /nuqtaless/);
  assert.match(look("ज़रूर").meaning, /certainly/);
  assert.match(look("जरूर").meaning, /certainly/);
});

test("Hindi text is told from other languages by its writing", () => {
  assert.equal(detectLanguage("मैं घर जा रहा हूँ"), "hi");
  assert.equal(LANGUAGES.hi.native, "हिन्दी");
  assert.ok(hasDevanagari(LANGUAGES.hi.test.marked));
});
