// Real example sentences from the learner's own library, for the word editor's Sentence tool with no AI
// (web/js/review/librarysentence.js), and the examples file's phrase search letting a phrase's words lose
// Arabic's little words in front (web/js/lexicon/exampledata.js phraseIn).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  MAX_WORDS, librarySentences, mainWordOf, mainWordsOf, mergeFinds, searchQueries, sentenceWith, sentencesOf, unmarked,
} from "../../web/js/review/librarysentence.js";
import { ExamplePack } from "../../web/js/lexicon/exampledata.js";

const root = new URL("../../", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");

test("a phrase's main word: its longest word that isn't a little word", () => {
  assert.equal(mainWordOf("وتاهوا في بيداء", "ar"), "وتاهوا", "the longest (6 letters), not في");
  assert.equal(mainWordOf("وَتَاهُوا فِي بَيْدَاءَ", "ar"), "وتاهوا", "vowel marks don't count");
  assert.equal(mainWordOf("في البيت", "ar"), "البيت");
  assert.equal(mainWordOf("por favor", "es"), "favor");
  assert.equal(mainWordOf("بيداء", "ar"), "", "a single word has no main word of its own");
  assert.deepEqual(mainWordsOf("وتاهوا في بيداء", "ar"), ["وتاهوا", "بيداء"], "every word but the little ones, longest first");
  assert.deepEqual(mainWordsOf("por favor", "es"), ["favor"], "por is a little word");
  assert.equal(mainWordOf("お願いします", "ja"), "", "Japanese is searched inside the sentence");
});

test("what the library search is asked: the phrase without the و on its first word, then its main word", () => {
  assert.deepEqual(searchQueries("وَتَاهُوا فِي بَيْدَاءَ", "ar"), ["تاهوا في بيداء", "تاهوا", "بيداء"]);
  assert.deepEqual(searchQueries("por favor", "es"), ["por favor", "favor"]);
  assert.deepEqual(searchQueries("كتاب", "ar"), ["كتاب"]);
  assert.deepEqual(searchQueries("ولد", "ar"), ["ولد"], "و kept when what is left would be too short");
  assert.deepEqual(searchQueries("  ", "ar"), []);
});

test("vowel marks are taken off; a text is cut into sentences", () => {
  assert.equal(unmarked("بَيْدَاءَ"), "بيداء");
  assert.deepEqual(sentencesOf("Hola. ¿Qué tal? Bien!\nAdiós"), ["Hola.", "¿Qué tal?", "Bien!", "Adiós"]);
  assert.deepEqual(sentencesOf("ذهبوا. ثم رجعوا؟ نعم"), ["ذهبوا.", "ثم رجعوا؟", "نعم"]);
});

test("the sentence with the phrase: marks, و and ال in front allowed; a long paragraph cut round it", () => {
  const book = "كان القوم في رخاء. فخرجوا من ديارهم وتاهوا في البيداء أربعين سنة. ثم عادوا.";
  assert.deepEqual(sentenceWith(book, "وَتَاهُوا فِي بَيْدَاءَ", "ar"), { text: "فخرجوا من ديارهم وتاهوا في البيداء أربعين سنة.", main: false });
  assert.deepEqual(sentenceWith("ثم تاهوا في بيداء واسعة.", "وتاهوا في بيداء", "ar"), { text: "ثم تاهوا في بيداء واسعة.", main: false },
    "the phrase's own و needn't be in the text");
  const other = sentenceWith("وقد تاهوا طويلا في الصحراء.", "وتاهوا في بيداء", "ar");
  assert.deepEqual(other, { text: "وقد تاهوا طويلا في الصحراء.", main: true, mark: "وتاهوا" }, "only a main word: offered, marked main");
  assert.deepEqual(sentenceWith("الخيل والليل والبيداء تعرفني.", "وتاهوا في بيداء", "ar"),
    { text: "الخيل والليل والبيداء تعرفني.", main: true, mark: "بيداء" }, "the next main word when the first is nowhere");
  assert.equal(sentenceWith("البيداء واسعة. وقد تاهوا.", "وتاهوا في بيداء", "ar").mark, "وتاهوا", "the most important main word wins");
  assert.equal(sentenceWith("لا شيء هنا.", "وتاهوا في بيداء", "ar"), null);
  const long = Array.from({ length: 60 }, (_, i) => `w${i}`);
  long[40] = "favor";
  const cut = sentenceWith(long.join(" "), "favor", "es");
  assert.ok(cut.text.startsWith("… w28 ") && cut.text.endsWith(" w52 …"), cut.text);
  assert.ok(cut.text.split(" ").length <= MAX_WORDS);
  assert.deepEqual(sentenceWith("Pásame la sal, por favor.", "por favor", "es"), { text: "Pásame la sal, por favor.", main: false });
  assert.deepEqual(sentenceWith("静かにお願いします。", "お願いします", "ja"), { text: "静かにお願いします。", main: false });
});

test("library finds: the card's own source first, the whole phrase before its main word, repeats and skipped left out", () => {
  const v = { text: "وتاهوا في بيداء", episode_id: 7, episode_title: "مقدمة ابن خلدون" };
  const hits = [
    { episode_id: 3, episode_title: "حلقة", text: "قالوا إنهم تاهوا في بيداء لا نهاية لها." },
    { episode_id: 9, episode_title: "رواية", text: "وتاهوا كثيرا." },
    { episode_id: 7, episode_title: "مقدمة ابن خلدون", text: "فخرجوا من ديارهم وتاهوا في البيداء أربعين سنة." },
    { episode_id: 3, episode_title: "حلقة", text: "قالوا إنهم تاهوا في بيداء لا نهاية لها." },
  ];
  const got = librarySentences(hits, v, "ar");
  assert.deepEqual(got.map((x) => [x.title, x.own, x.main]), [["مقدمة ابن خلدون", true, false], ["حلقة", false, false], ["رواية", false, true]]);
  assert.equal(got[0].source, "library");
  assert.equal(got[0].translation, "");
  assert.equal(got[2].mark, "وتاهوا", "a main-word find says which word to light up");
  const skipped = librarySentences(hits, v, "ar", { skip: [got[0].sentence] });
  assert.equal(skipped.length, 2);
  // A card that keeps only the source's title (no episode): that title counts as its own.
  const byTitle = librarySentences(hits, { text: v.text, episode_title: "حلقة" }, "ar");
  assert.equal(byTitle[0].title, "حلقة");
  assert.equal(byTitle[0].own, true);
  assert.deepEqual(librarySentences(hits, { text: "" }, "ar"), []);
});

test("the order to step through: whole phrase (library, then the file), then main word only (library, then the file)", () => {
  const lib = [{ sentence: "أ", main: false }, { sentence: "ب", main: true }];
  const file = [{ sentence: "ج", main: false }, { sentence: "دَ", main: true }, { sentence: "د", main: true }, { sentence: "أ", main: false }];
  assert.deepEqual(mergeFinds(lib, file).map((x) => x.sentence), ["أ", "ج", "ب", "دَ"]);
  // A file's main-word find must really have that word: بَيْدَ ("but") isn't بيداء ("desert").
  const fileFinds = [
    { sentence: "الخيل والليل والبيداء تعرفني", main: true, mark: "بيداء" },
    { sentence: "هو كثير المال بيد أنه بخيل", main: true, mark: "بيداء" },
  ];
  assert.deepEqual(mergeFinds([], fileFinds, "ar").map((x) => x.sentence), ["الخيل والليل والبيداء تعرفني"]);
});

test("the examples file's phrase search: the phrase's own و needn't be in the sentence", () => {
  const p = new ExamplePack({ sentences: [["ثم تاهوا في بيداء واسعة.", "Then they wandered in a vast desert.", "t1"]], words: {} }, "ar");
  const found = p.find("وتاهوا في بيداء");
  assert.equal(found.length, 1);
  assert.equal(found[0].text, "ثم تاهوا في بيداء واسعة.");
});

test("wiring: the Sentence tool steps through every find, with a pill for where each is from", () => {
  const sf = read("web/js/review/sentencefind.js");
  assert.match(sf, /export async function findSentences\(/);
  assert.match(sf, /api\(`\/search\?q=\$\{encodeURIComponent\(q\)\}/, "the library search, on every version");
  assert.match(sf, /mergeFinds\(library, file\.list, lang\)/);
  const wt = read("web/js/components/wordtools.js");
  assert.match(wt, /finds = await findSentences\(v, lang\)/);
  assert.match(wt, /at = \(at \+ 1\) % finds\.length/, "Another one steps on, round to the first");
  assert.match(wt, /class="rv-mn-mark vi-sent-src"/, "the same pill as the Mnemonic maker's source");
  assert.match(wt, /t\("From your library: \{0\}", FSI \+ \(got\.title/, "the title kept apart (an Arabic title among English words)");
  const ex = read("web/js/examples.js");
  assert.match(ex, /freeExamples\(word, lang, \{ mainWord: false, \.\.\.opts, count: 1 \}\)/,
    "Add words fills new cards only with sentences that have the whole phrase");
  // the phone has the same library search route
  assert.match(read("mobile/src/js/backend.js"), /\["GET", \/\^\\\/search\$\//);
});
