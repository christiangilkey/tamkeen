// Vocab → Ask by voice (web/js/voiceask.js, components/voiceask.js): "How do I say colorful in Spanish?", then
// "add it". The owner, 2026-11-17: a microphone right of Add words, as versatile as possible, without API keys.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const va = await import("../../web/js/voiceask.js");
const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

test("the question is read: what to say, in which language, and whether to add it", () => {
  const q = (s) => { const r = va.readQuestion(s); return [r.kind, r.phrase, r.lang, r.add]; };
  assert.deepEqual(q("How do I say colorful in Spanish?"), ["say", "colorful", "es", false]);
  assert.deepEqual(q("how do you say I'm hungry in French"), ["say", "i'm hungry", "fr", false]);
  assert.deepEqual(q("Okay, how would I say good morning"), ["say", "good morning", "", false]);
  assert.deepEqual(q("the Spanish word for fork"), ["say", "fork", "es", false]);
  assert.deepEqual(q("Spanish for dog"), ["say", "dog", "es", false]);
  assert.deepEqual(q("What's colorful in Spanish"), ["say", "colorful", "es", false]);
  assert.deepEqual(q("how is thank you said in Japanese"), ["say", "thank you", "ja", false]);
  assert.deepEqual(q("Translate to eat into German"), ["say", "to eat", "de", false]);
  assert.deepEqual(q("how do I say “the word cat” in Mandarin"), ["say", "cat", "zh", false]);
  assert.deepEqual(q("colorful"), ["say", "colorful", "", false]);
  assert.deepEqual(q("what is love"), ["say", "what is love", "", false], "no language named: the whole of it");
  // what it means
  assert.deepEqual(q("What does bonito mean?"), ["mean", "bonito", "", false]);
  assert.deepEqual(q("what's the meaning of ahorita"), ["mean", "ahorita", "", false]);
  assert.deepEqual(q("what's bonito in English"), ["mean", "bonito", "", false]);
  // adding
  assert.deepEqual(q("add it"), ["add", "", "", true]);
  assert.deepEqual(q("Yes, add that to my cards"), ["add", "", "", true]);
  assert.deepEqual(q("make it a card"), ["add", "", "", true]);
  assert.deepEqual(q("How do I say fork in Spanish and add it"), ["say", "fork", "es", true]);
  assert.equal(va.readQuestion("add them all").all, true);
  assert.equal(va.readQuestion("add it").all, false);
  assert.equal(va.readQuestion("").kind, "none");
  assert.equal(va.readQuestion("um").kind, "none");
});

test("English spellings both ways, and a meaning cut into its senses", () => {
  assert.deepEqual(va.spellings("colorful"), ["colorful", "colourful"]);
  assert.deepEqual(va.spellings("Colour"), ["colour", "color"]);
  assert.ok(va.spellings("the centre").includes("the center"));
  assert.ok(va.spellings("realize").includes("realise"));
  assert.deepEqual(va.spellings("for"), ["for"]);
  assert.deepEqual(va.spellings("door"), ["door"]);
  assert.deepEqual(va.senses("vibrant, eye-catching (of colours); showy"), ["vibrant", "eye-catching", "showy"]);
  assert.deepEqual(va.senses("colored/coloured"), ["colored", "coloured"]);
  assert.equal(va.shortGloss("dog (the species Canis familiaris)"), "dog");
  assert.ok(va.shortGloss("a ".repeat(60)).length <= 81);
});

// A small meanings file in the shape of docs/lexicon/<lang>-meanings.json.gz (tools/build_meanings.py).
const FILE = { lang: "es", source: "Wiktionary", forms: {}, words: {
  perro: [["perro", "noun", ["dog (the species Canis familiaris)", "clothes peg", "lazy person"], ""]],
  tuso: [["tuso", "noun", ["dog"], ""]],
  can: [["can", "noun", ["dog, hound"], ""]],
  perruno: [["perruno", "adj", ["doglike"], ""]],
  comer: [["comer", "verb", ["to eat", "to have lunch"], ""]],
  comida: [["comida", "noun", ["food", "meal; something to eat"], ""]],
  hola: [["hola", "intj", ["hello, hi"], ""]],
  "sí": [["sí", "particle", ["yes"], ""], ["sí", "intj", ["hello? (answering the phone)"], ""]],
  variopinto: [["variopinto", "adj", ["multicoloured, colorful"], ""]],
  tal: [["Tal", "name", ["dog"], ""]],
  eat: [["EAT", "noun", ["EAT"], ""]],
  "tengo hambre": [["tengo hambre", "phrase", ["I'm hungry"], ""]],
} };

test("the dictionary the other way round: the everyday word first, verbs for “to”, no names or abbreviations", () => {
  const find = (q, common = []) => va.findTranslations([FILE], q, "es", { common }).map((x) => x.word);
  assert.equal(find("dog")[0], "perro", "the word with more meanings (a much-used word) first");
  assert.ok(!find("dog").includes("Tal"), "a proper name never");
  assert.ok(!find("dog").includes("perruno"), "doglike isn't dog");
  assert.equal(find("dog", ["can"])[0], "can", "one of the 1000 most common words first of all");
  assert.deepEqual(find("to eat"), ["comer"]);
  assert.equal(find("eat")[0], "comer");
  assert.ok(!find("eat").includes("EAT"), "an abbreviation never");
  assert.equal(find("hello")[0], "hola", "“hello?” on the phone comes after");
  assert.equal(find("colourful")[0], "variopinto");
  assert.deepEqual(find("I'm hungry"), ["tengo hambre"]);
  assert.deepEqual(find("spaceship"), []);
  const top = va.findTranslations([FILE], "dog", "es")[0];
  assert.equal(top.meaning, "dog", "the meaning that matched, short");
  assert.equal(top.pos, "noun");
});

test("Wiktionary's translation tables first, then the backwards search; readings and senses kept", () => {
  const file = { ...FILE, english: {
    dog: [["perro", "noun", "animal"], ["can", "noun", "animal"], ["vaca", "noun", "dull, unattractive girl"]],
    eat: [["comer", "verb", "to ingest — see also consume, ingest"]],
    "i'm hungry": [["tengo hambre", "phrase", "I'm hungry"]],
    "thank you": [["谢谢", "intj", "an expression of gratitude", "xièxie"]],
  } };
  const got = (q) => va.translationsFor([file], q, "es");
  assert.deepEqual(got("dog").map((x) => x.word).slice(0, 3), ["perro", "can", "vaca"], "the first sense's words, then one of the next");
  assert.ok(got("dog").some((x) => x.word === "tuso"), "the backwards search fills the rest");
  assert.equal(new Set(got("dog").map((x) => x.word)).size, got("dog").length, "no word twice");
  assert.deepEqual(got("dog")[0], { word: "perro", meaning: "dog", sense: "animal", pos: "noun", reading: "" });
  assert.equal(got("to eat")[0].word, "comer");
  assert.equal(got("to eat")[0].meaning, "to eat");
  assert.equal(got("to eat")[0].sense, "to ingest", "Wiktionary's cross-references go");
  assert.equal(got("I'm hungry")[0].sense, "", "a sense that only repeats what was asked goes");
  assert.equal(got("thank you")[0].reading, "xièxie");
  assert.equal(got("colourful")[0].word, "variopinto", "no table row: the backwards search alone");
  assert.equal(got("dog").length, 4);
});

test("with an AI: one small question, and its answer tidied", () => {
  const p = va.askPrompt({ phrase: "colorful", heard: "how do I say colorful in Spanish", language: "Spanish", explain: "English" });
  assert.match(p.system, /Spanish teacher/);
  assert.match(p.system, /misheard/);
  assert.match(p.user, /colorful/);
  assert.equal(p.schema, va.ASK_SCHEMA);
  assert.match(va.askPrompt({ phrase: "house", language: "Egyptian Arabic", vowels: true }).system, /full vowel marks/);
  assert.deepEqual(va.cleanAsk({ word: " colorido ", reading: "", meaning: "colorful", note: "", others: [{ word: "colorido", meaning: "x" }, { word: "vistoso", meaning: "showy" }, { word: "", meaning: "y" }] }),
    { word: "colorido", reading: "", meaning: "colorful", note: "", others: [{ word: "vistoso", meaning: "showy" }] });
  assert.equal(va.cleanAsk({ word: "" }), null);
  assert.equal(va.cleanAsk(null), null);
});

test("hearing: the ways that need no key come first, typing is always there", () => {
  assert.deepEqual(va.hearingWays({ device: "windows", model: true, browser: true }), ["model", "browser"]);
  assert.deepEqual(va.hearingWays({ device: "android", browser: false, service: true }), ["native", "service"]);
  assert.deepEqual(va.hearingWays({ device: "web", browser: true, service: true }), ["browser", "service"]);
  assert.deepEqual(va.hearingWays({ device: "ios", browser: false, service: false }), []);
  assert.equal(va.hearingTag("en", "en-GB"), "en-GB");
  assert.equal(va.hearingTag("en", "fr-FR"), "en-US");
  assert.equal(va.hearingTag("tl"), "fil-PH");
});

test("the microphone sits right of Add words, and the box is wired up", () => {
  const vocab = read("web/js/pages/vocab.js");
  const add = vocab.indexOf('id="add-words"'), mic = vocab.indexOf('id="ask-voice"');
  assert.ok(add > 0 && mic > add && mic - add < 400, "right after Add words, in the same row");
  assert.match(vocab, /\$\("#ask-voice"\)\.onclick = \(\) => openVoiceAsk\(/);
  assert.match(vocab, /addCards: \(start, added\) => openAdd\("one", \{ start, addNow: true, added \}\)/, "cards made by Add words itself");
  const builder = read("web/js/components/wordbuilder.js");
  assert.match(builder, /start = null, addNow = false/);
  assert.match(builder, /if \(given\.length && addNow\) setTimeout\(\(\) => \$\("\.cb-add"\)\.click\(\), 0\);/);
  const box = read("web/js/components/voiceask.js");
  assert.match(box, /speechPlugin\.recognize\(/);
  assert.match(box, /window\.SpeechRecognition \|\| window\.webkitSpeechRecognition/);
  assert.match(box, /quiet: true/, "said once by itself, without a box about missing voices");
  const build = read("mobile/scripts/build-www.mjs");
  assert.match(build, /"js\/voiceask\.js"/);
  assert.match(build, /"js\/components\/voiceask\.js"/);
});

test("Android hears with its own speech recognition, no key", () => {
  const java = read("mobile/android/app/src/main/java/io/github/christiangilkey/arabicpodcaststudio/SpeechPlugin.java");
  assert.match(java, /public void recognize\(PluginCall call\)/);
  assert.match(java, /RecognizerIntent\.ACTION_RECOGNIZE_SPEECH/);
  assert.match(java, /@ActivityCallback\s+private void recognized\(PluginCall call, ActivityResult result\)/);
  assert.match(java, /"NO_RECOGNIZER"/);
  assert.match(read("mobile/android/app/src/main/AndroidManifest.xml"), /android\.speech\.action\.RECOGNIZE_SPEECH/);
});

test("the browser's microphone question comes first, and a blocked microphone gets the popup that says how to allow it", () => {
  const box = read("web/js/components/voiceask.js");
  assert.match(box, /async function byBrowser\(\) \{[\s\S]{0,700}navigator\.mediaDevices\.getUserMedia\(\{ audio: true \}\)/);
  assert.match(box, /else if \(failed === "not-allowed"\) reject\(micRefused\(\)\);/);
  assert.match(box, /if \(micBlocked\) offerFix\("mic"\);/);
});

test("a word typed without its accents finds the dictionary's spelling (the owner, 2026-11-18: vacio)", async () => {
  const md = await import("../../web/js/lexicon/meaningdata.js");
  const file = { lang: "es", source: "Wiktionary", forms: {}, words: {
    "vacío": [["vacío", "adj", ["empty, vacant"], ""]], "vació": [["vació", "verb", ["he emptied"], ""]], casa: [["casa", "noun", ["house"], ""]] } };
  assert.deepEqual(md.respellings([file], "vacio", "es"), ["vacío", "vació"]);
  assert.deepEqual(md.respellings([file], "Vacio", "es"), ["vacío", "vació"]);
  assert.deepEqual(md.respellings([file], "vacio", "ar"), [], "only languages whose spelling has accents");
  assert.deepEqual(md.respellings([file], "casa", "es"), [], "a word with no marks matches as typed already");
  const builder = read("web/js/components/wordbuilder.js");
  assert.match(builder, /if \(d\.spelled && d\.spelled !== r\.text\.trim\(\)\) \{\s+r\.text = d\.spelled;/);
});
