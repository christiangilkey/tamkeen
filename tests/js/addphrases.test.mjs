// "Add words" with phrases (web/js/addwords.js, lexicon/exampledata.js, review/freemnemonic.js): what a card is
// (a word, a phrase, or a phrase that is a sentence already), whether the Mnemonic maker suits it, its meaning word
// by word, the AI's question for it, and real sentences that contain it (against the files in docs/lexicon).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import {
  MNEMONIC_WORDS, SENTENCE_WORDS, bareText, batchPrompt, coreText, entryKind, firstSense, isPhrase, mnemonicFits, parseList,
  readBatch, usableSense, wordByWord, wordsIn,
} from "../../web/js/addwords.js";
import { ExamplePack, markTranslation, wordsOf } from "../../web/js/lexicon/exampledata.js";
import { KeywordList, meaningPicture, sceneFor } from "../../web/js/review/freemnemonic.js";

const read = (name) => JSON.parse(gunzipSync(readFileSync(new URL(`../../docs/lexicon/${name}`, import.meta.url))));
const packs = {};
const pack = (lang) => (packs[lang] ||= new ExamplePack(read(`${lang}-examples.json.gz`), lang));

// ----- what a card is -----

test("a card of several words is a phrase; little words round one word don't make it one", () => {
  for (const [text, lang] of [["por favor", "es"], ["darse cuenta de", "es"], ["¿cómo estás?", "es"], ["كيف حالك", "ar"],
    ["إن شاء الله", "ar"], ["s'il vous plaît", "fr"], ["guten Morgen", "de"], ["谢谢你", "zh"]]) {
    assert.equal(isPhrase(text, lang), true, `${text} is a phrase`);
  }
  for (const [text, lang] of [["casa", "es"], ["el perro", "es"], ["der Hund, -e", "de"], ["to go", "en"], ["الكتاب", "ar"],
    ["well-known", "en"], ["l'école", "fr"], ["ang bahay", "tl"], ["ขอบคุณครับ", "th"], ["勉強する", "ja"], ["amo, amare, amavi, amatum", "la"],
    ["говорить / сказать", "ru"], ["", "es"]]) {
    assert.equal(isPhrase(text, lang), false, `${text} is one word`);
  }
  assert.equal(coreText("der Hund, -e", "de"), "Hund");
  assert.equal(coreText("por favor", "es"), "por favor");
  assert.deepEqual(wordsIn("¿cómo estás?", "es"), ["cómo", "estás"], "the punctuation round each word is left off");
  assert.equal(bareText("¿cómo estás?"), "cómo estás");
  assert.equal(bareText("كيف حالك؟"), "كيف حالك");
});

test("a phrase that is a sentence already: it ends as one does, or it is long", () => {
  assert.equal(SENTENCE_WORDS, 5);
  assert.equal(entryKind("casa", "es"), "word");
  assert.equal(entryKind("por favor", "es"), "phrase");
  assert.equal(entryKind("darse cuenta de", "es"), "phrase");
  assert.equal(entryKind("de vez en cuando", "es"), "phrase", "four words, no full stop: a set phrase");
  assert.equal(entryKind("más vale tarde que nunca", "es"), "sentence", "five words");
  assert.equal(entryKind("¿cómo estás?", "es"), "sentence", "a question");
  assert.equal(entryKind("¡Qué bonito día", "es"), "sentence", "¡ opens a sentence");
  assert.equal(entryKind("Me llamo Ana.", "es"), "sentence");
  assert.equal(entryKind("\"Ich bin müde.\"", "de"), "sentence", "quotes after the full stop");
  assert.equal(entryKind("كيف حالك؟", "ar"), "sentence", "the Arabic question mark");
  assert.equal(entryKind("كيف حالك", "ar"), "phrase");
  assert.equal(entryKind("एक मिनट रुको।", "hi"), "sentence", "Hindi's full stop");
  assert.equal(entryKind("a ver si…", "es"), "phrase", "an ellipsis is no full stop");
  assert.equal(entryKind("¿Qué?", "es"), "word", "one word stays a word, whatever its marks");
  assert.equal(entryKind("谢谢你", "zh"), "phrase");
  assert.equal(entryKind("我每天早上七点钟起床", "zh"), "sentence", "Chinese counts letters: ten or more");
  assert.equal(entryKind("静かにしてください。", "ja"), "sentence", "。");
});

test("the Mnemonic maker suits words and phrases of up to three words (a few letters in Chinese, Japanese, Thai)", () => {
  assert.equal(MNEMONIC_WORDS, 3);
  for (const [text, lang] of [["casa", "es"], ["por favor", "es"], ["darse cuenta de", "es"], ["إن شاء الله", "ar"],
    ["el perro", "es"], ["一路平安", "zh"], ["ありがとうございます", "ja"], ["ขอบคุณครับ", "th"]]) {
    assert.equal(mnemonicFits(text, lang), true, `${text} gets a mnemonic`);
  }
  for (const [text, lang] of [["de vez en cuando", "es"], ["más vale tarde que nunca", "es"], ["أنا بخير والحمد لله", "ar"],
    ["你叫什么名字", "zh"], ["ยินดีที่ได้รู้จักครับ", "th"]]) {
    assert.equal(mnemonicFits(text, lang), false, `${text} is too long for one`);
  }
});

// ----- a meaning word by word -----

const DICT = { "darse cuenta": "to notice, to realize", "de": "of, from", "por": "for, by", "favor": "favour (kindness)", "إن": "if",
  "شاء": "to want, to wish", "الله": "God", "谢谢": "to thank", "你": "you" };
const fake = (seen) => async (text, several) => { seen.push([text, several]); return DICT[text] || ""; };

test("word by word: the longest run with an entry of its own first, then single words, each its first sense", async () => {
  const seen = [];
  const got = await wordByWord(["darse", "cuenta", "de"], fake(seen), { lang: "es" });
  assert.equal(got.literal, "to notice + of");
  assert.deepEqual(got.parts, [{ text: "darse cuenta", meaning: "to notice" }, { text: "de", meaning: "of" }]);
  assert.ok(!seen.some(([t]) => t === "darse cuenta de"), "the whole phrase is never asked again");
  assert.deepEqual(seen.filter(([, several]) => several).map(([t]) => t), ["darse cuenta"], "runs are asked as phrases (exact entries)");
  assert.equal((await wordByWord(["por", "favor"], fake([]), { lang: "es" })).literal, "for + favour", "notes in brackets left off");
  assert.equal((await wordByWord(["إن", "شاء", "الله"], fake([]), { lang: "ar" })).literal, "if + to want + God");
  assert.equal((await wordByWord(["谢谢", "你"], fake([]), { lang: "zh", all: true })).literal, "to thank + you");
});

test("word by word needs most words found; a word not found stands as written", async () => {
  const got = await wordByWord(["por", "favor", "Tom"], fake([]), { lang: "es" });
  assert.equal(got.literal, "for + favour + Tom", "two of three found: enough");
  assert.equal(got.found, 2);
  assert.equal(await wordByWord(["por", "xx", "yy"], fake([]), { lang: "es" }), null, "one of three: not enough");
  assert.equal(await wordByWord(["谢谢", "zz"], fake([]), { lang: "zh", all: true }), null, "Chinese, Japanese, Thai: every piece");
  assert.equal(await wordByWord(["por"], fake([]), { lang: "es" }), null, "one word is no phrase");
  const failing = async () => { throw new Error("offline"); };
  assert.equal(await wordByWord(["por", "favor"], failing, { lang: "es" }), null, "a lookup that fails counts as not found");
  assert.equal(firstSense("to notice, to realize; to see"), "to notice");
  assert.equal(firstSense("(informal) mate"), "mate");
});

test("a word's sense for a phrase: not a letter's name, nor only another spelling", () => {
  assert.equal(usableSense(["The name of the Latin script letter D", "of, from (prep)"]), "of");
  assert.equal(usableSense(["alternative form of hacer", "to do"]), "to do");
  assert.equal(usableSense(["abbreviation of usted"]), "");
  assert.equal(usableSense(["Used other than figuratively or idiomatically: see لِـ", "for"]), "for");
  assert.equal(usableSense(["house"]), "house");
  assert.equal(usableSense([]), "");
});

// ----- the AI, the list -----

test("the AI is told which entries are phrases, and to explain them as one unit", () => {
  const items = [
    { word: "casa", meaning: "", sentence: "", want: { meaning: true, sentence: true, translation: true } },
    { word: "darse cuenta de", meaning: "", sentence: "", phrase: true, want: { meaning: true, sentence: true, translation: true } },
    { word: "¿cómo estás?", meaning: "", sentence: "¿cómo estás?", phrase: true, want: { meaning: true, sentence: false, translation: true } },
  ];
  const q = batchPrompt(items, { study: "Spanish", speaks: "English" });
  const lines = q.user.split("\n");
  assert.equal(lines[0], "1. word: casa | fill in: meaning, sentence, translation");
  assert.equal(lines[1], "2. phrase: darse cuenta de | fill in: meaning, sentence, translation");
  assert.equal(lines[2], "3. phrase: ¿cómo estás? | fill in: meaning, translation | sentence: ¿cómo estás?", "a sentence already: only translated");
  assert.match(q.system, /"phrase:" line is several words learned together/);
  assert.match(q.system, /as one unit/);
  assert.match(q.system, /never its words translated one by one/);
  assert.doesNotMatch(batchPrompt([items[0]], { study: "Spanish" }).system, /phrase:/, "no phrase note without a phrase");
  const answer = { cards: [{ word: "casa", meaning: "house", sentence: "Mi casa es tuya.", translation: "My ⟦house⟧ is yours." },
    { word: "Darse cuenta de", meaning: "to realize", sentence: "Me di cuenta de mi error.", translation: "I ⟦realized⟧ my mistake." },
    { word: "¿Cómo estás?", meaning: "how are you?", sentence: "", translation: "⟦How are you?⟧" }] };
  const read = readBatch(answer, items);
  assert.equal(read[1].meaning, "to realize", "matched whatever its capitals");
  assert.equal(read[2].translation, "⟦How are you?⟧");
  assert.equal(read[2].sentence, "", "not asked for");
});

test("a pasted list keeps phrases whole, separators and all", () => {
  const { cards } = parseList("por favor – please\n¿cómo estás? = how are you?\nsí, claro; yes, of course\nإن شاء الله – God willing\nde vez en cuando", { lang: "es" });
  assert.deepEqual(cards.map((c) => c.text), ["por favor", "¿cómo estás?", "sí, claro", "إن شاء الله", "de vez en cuando"]);
  assert.deepEqual(cards.map((c) => c.meaning), ["please", "how are you?", "yes, of course", "God willing", ""]);
  const ar = parseList("God willing – إن شاء الله", { lang: "ar" }).cards[0];
  assert.equal(ar.text, "إن شاء الله", "turned round by its script");
});

// ----- real sentences that contain a phrase -----

test("the sentence finder finds sentences with the whole phrase, its words one after another", () => {
  const es = pack("es");
  const has = (list, re) => list.length && list.every((x) => re.test(x.text));
  assert.ok(has(es.find("de vez en cuando", { meaning: "from time to time" }), /de vez en cuando/i));
  assert.ok(has(es.find("por favor", { meaning: "please" }), /por favor/i));
  assert.ok(has(es.find("buenos días", { meaning: "good morning" }).slice(0, 2), /buenos días/i));
  const found = es.find("darse cuenta de", { meaning: "to realize", count: 1 });
  assert.match(found[0].text, /darse cuenta de/);
  const ar = pack("ar").find("كيف حالك", { meaning: "how are you" });
  assert.ok(ar.length >= 2 && ar.every((x) => /كيف حال/.test(x.text.replace(/[ً-ْ]/g, ""))), "Arabic, with or without vowel marks");
  assert.ok(pack("ar").find("إن شاء الله").length >= 2);
  assert.ok(pack("fr").find("s'il vous plaît").every((x) => /s'il vous plaît/i.test(x.text)));
  assert.ok(pack("ja").find("お願いします。").length, "Japanese: inside the sentence, the full stop round it left off");
  assert.deepEqual(es.find("zzz qqq"), [], "nothing made up");
  assert.deepEqual(wordsOf("¿Cómo estás?", "es").k, ["cómo", "estás"]);
});

test("a phrase's words may take other forms when the word tables are here", () => {
  const es = pack("es");
  const forms = { tomando: "tomar", tomar: "tomar", toma: "tomar", tomó: "tomar" };
  const lemmaOf = (w) => forms[w] || w;
  const found = es.find("tomar el pelo", { lemmaOf, count: 3 });
  assert.ok(found.length && found.every((x) => /tom\S* el pelo/i.test(x.text)), found.map((x) => x.text).join(" | "));
});

test("a phrase's meaning that ends as a question is marked whole in the translation", () => {
  assert.equal(markTranslation("Hey John, how are you?", "how are you? (when addressing a male)"), "Hey John, ⟦how are you⟧?");
  assert.equal(markTranslation("I would like a table, please.", "please"), "I would like a table, ⟦please⟧.");
  assert.equal(markTranslation("Good morning, sir!", "good morning!"), "⟦Good morning⟧, sir!");
});

test("a sentence the file has gives its own translation", () => {
  assert.equal(pack("es").translationOf("¿qué hora es?"), "What time is it?", "whatever the capitals");
  assert.equal(pack("es").translationOf("Qué hora es"), "What time is it?", "or the punctuation");
  assert.equal(pack("ar").translationOf("ما اسمك؟"), "What is your name?", "Arabic, its vowel marks left out");
  assert.equal(pack("es").translationOf("qué hora"), "", "only the very sentence");
  assert.equal(pack("es").translationOf("zzz qqq"), "");
});

// ----- a phrase's meaning in a mnemonic picture -----

test("a phrase's meaning is pictured being said, not as a thing", () => {
  const list = new KeywordList(read("en-keywords.json.gz"));
  const said = meaningPicture("please", list, "phrase");
  assert.equal(said.pos, "said");
  assert.equal(meaningPicture("how are you?", list, "intj").pos, "said");
  assert.equal(meaningPicture("however", list, "adv").pos, "said");
  assert.equal(meaningPicture("to realize", list, "phrase").pos, "verb", "a phrase that means doing something is a verb");
  assert.equal(meaningPicture("house", list, "").pos, "noun", "a word is as before");
  const line = sceneFor({ word: "banana", pos: "n", kind: "food" }, meaningPicture("you're welcome", list, "phrase"), "de nada");
  assert.match(line, /BANANA/);
  assert.match(line, /“you're welcome”/);
  assert.doesNotMatch(line, /a you're welcome/);
});
