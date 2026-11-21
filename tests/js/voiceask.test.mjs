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

test("the box shows what to say, for the language studied, and readQuestion understands every example", async () => {
  const zlib = await import("node:zlib");
  const md = await import("../../web/js/lexicon/meaningdata.js");
  const { LANGUAGES } = await import("../../web/js/languages.js");
  for (const code of Object.keys(LANGUAGES)) {
    const ex = va.askExamples(code);
    if (code === "en") { assert.deepEqual(ex.map((e) => va.readQuestion(e.text).kind), ["mean", "add"]); continue; }
    const [say, mean] = ex;
    assert.deepEqual(va.readQuestion(say.text), { kind: "say", phrase: "colorful", lang: code, add: false, all: false }, say.text);
    assert.equal(va.readQuestion(mean.text).kind, "mean", mean.text);
    assert.equal(va.readQuestion(mean.text).phrase, mean.word);
    assert.equal(va.readQuestion(ex[ex.length - 1].text).kind, "add");
    const file = JSON.parse(zlib.gunzipSync(readFileSync(new URL(`../../docs/lexicon/${code}-meanings.json.gz`, import.meta.url))).toString("utf8"));
    assert.ok(md.lookUp([file], md.wordKeys(mean.word, code, null), mean.word, code, {}), `${mean.word} is in the ${code} dictionary`);
  }
  assert.equal(va.askExamples("pt")[0].text, "How do I say colorful in Portuguese?");
  assert.equal(va.askExamples("ceb")[0].text, "How do I say colorful in Bisaya?");
  const ui = readFileSync(new URL("../../web/js/components/voiceask.js", import.meta.url), "utf8");
  assert.match(ui, /<ul class="vq-ex-list">\$\{examples\.map\(exampleHtml\)\.join\(""\)\}<\/ul>/, "shown when the box opens");
  assert.match(ui, /input\.value = examples\[Number\(b\.dataset\.i\)\]\.text; input\.focus\(\);/, "a tap puts it in the box");
  assert.match(ui, /\$\("\.vq-examples"\)\.hidden = true;/, "out of the way once there is an answer");
});

// ---------------------------------------------------------------- in the learner's own language (prototype voice_ask_native)
// The owner, 2026-11-21: Ask by voice understands questions in all the app's languages, in the learner's own (the app's)
// language: "¿cómo se dice perro en árabe?", "ما معنى …", "add it" said in it; the examples in it too. Anything bigger
// to download only for a learner whose own language it is.

test("every app language: its examples are understood, and say the language studied by its name in that language", async () => {
  const { NATIVE } = await import("../../web/js/voiceask-native.js");
  const { UI_LANGUAGE_CODES } = await import("../../web/js/i18n.js");
  const { LANGUAGES } = await import("../../web/js/languages.js");
  assert.deepEqual(Object.keys(NATIVE).sort(), UI_LANGUAGE_CODES.filter((c) => c !== "en").sort(), "a table for every app language but English");
  for (const ui of Object.keys(NATIVE)) {
    assert.deepEqual(Object.keys(NATIVE[ui].names).sort(), Object.keys(LANGUAGES).sort(), `${ui} names every language studied`);
    for (const study of Object.keys(LANGUAGES)) {
      const ex = va.askExamples(study, ui);
      const [say, mean] = ex;
      if (study !== ui) {
        assert.deepEqual(va.readQuestion(say.text, ui).kind, "say", say.text);
        assert.equal(va.readQuestion(say.text, ui).phrase, NATIVE[ui].ex.dog, say.text);
        assert.equal(va.readQuestion(say.text, ui).lang, study, say.text);
        assert.equal(va.readQuestion(mean.text, ui).kind, "mean", mean.text);
        assert.equal(va.readQuestion(mean.text, ui).phrase, mean.word, mean.text);
      }
      assert.equal(va.readQuestion(ex[ex.length - 1].text, ui).kind, "add", ex[ex.length - 1].text);
    }
  }
  assert.equal(va.askExamples("ar", "es")[0].text, "¿Cómo se dice perro en árabe?");
  assert.equal(va.askExamples("es", "ar")[1].text, "ما معنى bonito؟");
  assert.equal(va.askExamples("es", "de")[0].text, "Wie sagt man Hund auf Spanisch?", "German's language names with their capital");
  assert.deepEqual(va.askExamples("es", "es").map((e) => e.text), ["añádelo"], "nothing to translate into one's own language");
  assert.equal(va.askExamples("es")[0].text, "How do I say colorful in Spanish?", "English as before without the app's language");
});

test("questions people say, in their own language", () => {
  const q = (ui, s) => { const r = va.readQuestion(s, ui); return [r.kind, r.phrase, r.lang, r.add]; };
  // the owner's examples
  assert.deepEqual(q("es", "¿cómo se dice perro en árabe?"), ["say", "perro", "ar", false]);
  assert.deepEqual(q("ar", "ما معنى bonito"), ["mean", "bonito", "", false]);
  assert.deepEqual(q("es", "añádelo"), ["add", "", "", true]);
  // more ways
  assert.deepEqual(q("es", "como se dice perro en arabe"), ["say", "perro", "ar", false], "without the accents");
  assert.deepEqual(q("es", "¿Cómo se dice tenedor en francés y añádelo?"), ["say", "tenedor", "fr", true]);
  assert.deepEqual(q("es", "oye, ¿cuál es la palabra para tenedor en alemán?"), ["say", "tenedor", "de", false]);
  assert.deepEqual(q("es", "¿qué es bonito en español?"), ["mean", "bonito", "", false], "a word of one's own language: what it means");
  assert.deepEqual(q("es", "sí, añádelo"), ["add", "", "", true]);
  assert.equal(va.readQuestion("agrégalos", "es").all, true);
  assert.deepEqual(q("ar", "كيف اقول كلب بالانجليزي"), ["say", "كلب", "en", false]);
  assert.deepEqual(q("ar", "ترجم كلب إلى الفرنسية"), ["say", "كلب", "fr", false]);
  assert.deepEqual(q("ar", "وأضفها"), ["add", "", "", true]);
  assert.deepEqual(q("fr", "c'est quoi chien en espagnol"), ["say", "chien", "es", false]);
  assert.deepEqual(q("fr", "bonito ça veut dire quoi"), ["mean", "bonito", "", false]);
  assert.deepEqual(q("de", "wie kann ich Hund auf Arabisch sagen"), ["say", "Hund", "ar", false], "the word in its own capital");
  assert.deepEqual(q("it", "aggiungili tutti"), ["add", "", "", true]);
  assert.equal(va.readQuestion("aggiungili tutti", "it").all, true);
  assert.deepEqual(q("pt", "como é cachorro em inglês"), ["say", "cachorro", "en", false]);
  assert.deepEqual(q("ca", "com es diu gos a l'anglès"), ["say", "gos", "en", false]);
  assert.deepEqual(q("ru", "как будет собака на английском"), ["say", "собака", "en", false]);
  assert.equal(va.readQuestion("добавь", "ru").all, false, "добавь has оба in it, but isn't “both”");
  assert.deepEqual(q("fa", "چطور بگم سگ به انگلیسی"), ["say", "سگ", "en", false]);
  assert.deepEqual(q("fa", "جميل یعنی چی؟"), ["mean", "جميل", "", false], "an Arabic word keeps its Arabic letters");
  assert.deepEqual(q("hi", "कुत्ते को अंग्रेज़ी में क्या कहते हैं?"), ["say", "कुत्ते", "en", false]);
  assert.deepEqual(q("ja", "犬って英語でなんて言うの"), ["say", "犬", "en", false]);
  assert.deepEqual(q("zh", "狗用英語怎麼說"), ["say", "狗", "en", false], "traditional characters too");
  assert.deepEqual(q("zh", "西班牙语怎么说狗"), ["say", "狗", "es", false]);
  assert.deepEqual(q("ko", "개는 영어로 뭐라고 해요?"), ["say", "개", "en", false]);
  assert.deepEqual(va.readQuestion("아이를 영어로 어떻게 말해요", "ko").phrase, "아이");
  assert.deepEqual(va.readQuestion("개를 영어로 어떻게 말해요", "ko").alts, ["개를"], "the word with its ending kept as a second try");
  assert.deepEqual(q("th", "หมาภาษาอังกฤษเรียกว่าอะไรครับ"), ["say", "หมา", "en", false]);
  assert.deepEqual(q("tl", "paano po sabihin ang aso sa english"), ["say", "aso", "en", false]);
  assert.deepEqual(q("ceb", "unsay iro sa english"), ["say", "iro", "en", false]);
  assert.deepEqual(q("ceb", "unsa ang kahulogan sa bonito"), ["mean", "bonito", "", false]);
  // English is still understood whatever the app's language; a bare word is the word
  assert.deepEqual(q("es", "How do I say colorful in Spanish?"), ["say", "colorful", "es", false]);
  assert.deepEqual(q("tl", "add it"), ["add", "", "", true]);
  assert.deepEqual(q("es", "perro"), ["say", "perro", "", false]);
});

test("a word of one's own language in English, by that language's own dictionary", () => {
  const es = { lang: "es", source: "Wiktionary", forms: {}, words: {
    perro: [["perro", "noun", ["dog (the species Canis familiaris)", "clothes peg"], ""]],
    cachorro: [["cachorro", "noun", ["puppy (a young dog)", "dog (of any age)"], ""]],
  }, english: { dog: [["perro", "noun", "animal"], ["cachorro", "noun", "animal"]], puppy: [["cachorro", "noun", "young dog"]] } };
  assert.equal(va.toEnglish([es], "perro", "es")[0], "dog");
  assert.equal(va.toEnglish([es], "Perro", "es")[0], "dog");
  assert.deepEqual(va.toEnglish([es], "cachorro", "es").slice(0, 2).sort(), ["dog", "puppy"]);
  assert.deepEqual(va.toEnglish([es], "gato", "es"), []);
});

test("the real dictionaries: every app language's example word is found in English, and perro becomes كلب", async () => {
  const zlib = await import("node:zlib");
  const md = await import("../../web/js/lexicon/meaningdata.js");
  const { NATIVE } = await import("../../web/js/voiceask-native.js");
  const load = (code) => md.keyedTables(JSON.parse(zlib.gunzipSync(readFileSync(new URL(`../../docs/lexicon/${code}-meanings.json.gz`, import.meta.url))).toString("utf8")));
  const ar = [load("ar")];
  for (const ui of Object.keys(NATIVE)) {
    const own = ui === "ar" ? ar : [load(ui)];
    const english = va.toEnglish(own, NATIVE[ui].ex.dog, ui);
    assert.equal(english[0], NATIVE[ui].ex.en || "dog", `${ui}: ${NATIVE[ui].ex.dog}`);
  }
  const es = [load("es")];
  assert.equal(md.matchKey(va.translationsFor(ar, va.toEnglish(es, "perro", "es")[0], "ar")[0].word, "ar"), "كلب");
  assert.equal(va.toEnglish(es, "buenos días", "es")[0], "good morning");
});

test("the box: the app's language only in prototype mode, the own-language dictionary only for its own speakers", () => {
  const box = read("web/js/components/voiceask.js");
  assert.match(box, /const native = own !== "en" && hasNative\(own\) && feature\("voice_ask_native"\);/, "English speakers: nothing new");
  assert.match(box, /const examples = askExamples\(study, ui\);/);
  assert.match(box, /const q = readQuestion\(text, ui\);/);
  // the own language's dictionary: only in fromOwnLanguage, only when there is no AI and the question is in that language
  assert.equal((box.match(/dictionaryFiles\(ui/g) || []).length, 1);
  assert.match(box, /const mine = await dictionaryFiles\(ui, \{ tables: false \}\);/, "its meanings alone");
  assert.match(box, /if \(native && lang !== ui\) \{\s+const bridged = await fromOwnLanguage\(\[phrase, \.\.\.alts\], lang\);/);
  const howTo = box.slice(box.indexOf("async function howToSay("));
  assert.ok(howTo.indexOf("if (aiReady())") < howTo.indexOf("fromOwnLanguage("), "an AI answers first: nothing downloaded then");
  assert.match(read("web/js/meanings.js"), /export async function downloadMeanings\(lang, \{ tables = true \} = \{\}\) \{[\s\S]{0,200}if \(!tables\) return st;/);
  assert.match(read("web/js/prototype.js"), /voice_ask_native: \{[^}]*released: false/);
  assert.match(read("mobile/scripts/build-www.mjs"), /"js\/voiceask-native\.js"/);
});
