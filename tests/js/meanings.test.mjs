// No AI: the built-in dictionary (web/js/lexicon/meaningdata.js) with the real files from
// docs/lexicon (tools/build_meanings.py).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { answerFrom, arabicVariants, cebuanoStems, cebuanoVariants, commonness, findIn, lookUp, matchKey, ordinary, wordKeys } from "../../web/js/lexicon/meaningdata.js";

const file = (lang) => JSON.parse(gunzipSync(readFileSync(new URL(`../../docs/lexicon/${lang}-meanings.json.gz`, import.meta.url))).toString("utf8"));
const look = (data, word, lang, extra = []) => {
  const found = findIn(data, [matchKey(word, lang), ...extra]);
  return found && answerFrom(found, word, lang);
};

test("words are matched the way the files were made", () => {
  assert.equal(matchKey("الكِتَابُ", "ar"), "الكتاب");
  assert.equal(matchKey("مدرسة", "ar"), "مدرسه");
  assert.equal(matchKey("أكل", "ar"), "اكل");
  assert.equal(matchKey("говори́ла", "ru"), "говорила");
  assert.equal(matchKey("Ещё", "ru"), "еще");
  assert.equal(matchKey("Casa", "es"), "casa");
  assert.equal(matchKey("食べる", "ja"), "食べる");
});

test("Arabic: the little words around a word are tried off", () => {
  const v = arabicVariants(matchKey("وبالكتاب", "ar"));
  assert.ok(v.includes("كتاب"));
  assert.ok(arabicVariants(matchKey("مدرستي", "ar")).includes("مدرسه"));
});

test("Arabic: a word, its vowels and root, and a dialect word", () => {
  const ar = file("ar");
  const book = look(ar, "كتاب", "ar");
  assert.equal(book.meaning, "book");
  assert.equal(book.vocalized, "كِتَاب");
  const school = look(ar, "مدرستي", "ar", arabicVariants(matchKey("مدرستي", "ar")));
  assert.match(school.meaning, /school/);
  const what = look(ar, "شو", "ar");
  assert.ok(what, "شو is in the file");
  assert.match(what.dialect, /Arabic/);
});

test("Spanish: a verb form leads to its verb, and says which form it is", () => {
  const es = file("es");
  const a = look(es, "hablo", "es");
  assert.equal(a.lemma, "hablar");
  assert.match(a.morphology, /first-person singular/);
  assert.match(a.meaning, /speak|talk/);
  assert.match(look(es, "lo siento", "es").meaning, /sorry/i);
});

test("English: ordinary words before names, phrasal verbs as a whole", () => {
  const en = file("en");
  const went = look(en, "went", "en");
  assert.equal(went.lemma, "go");
  assert.notEqual(went.pos, "name");
  assert.ok(look(en, "give up", "en"));
});

test("Chinese: simplified spelling finds the entry; pinyin comes along", () => {
  const zh = file("zh");
  const study = look(zh, "学习", "zh");
  assert.match(study.meaning, /study|learn/);
  assert.equal(study.vocalized, "xuéxí");
});

test("Japanese: today's kana reading", () => {
  const school = look(file("ja"), "学校", "ja");
  assert.equal(school.vocalized, "がっこう");
});

test("Russian and Tagalog", () => {
  assert.match(look(file("ru"), "говорила", "ru").meaning, /speak|talk|say/);
  assert.match(look(file("tl"), "bahay", "tl").meaning, /house/);
});

test("Arabic: the CAMeL glosses cover words Wiktionary lacks, Egyptian ones marked", () => {
  const camel = file("ar-camel");
  const now = look(camel, "دلوقتي", "ar");
  assert.equal(now.meaning, "now");
  assert.equal(now.dialect, "Egyptian Arabic");
  assert.match(look(camel, "استقلال", "ar").meaning, /independence/);
  for (const groups of Object.values(camel.words)) for (const g of groups) assert.ok(!g[2].includes("TBA"));
});

test("Portuguese, Catalan and Thai", () => {
  assert.match(look(file("pt"), "casa", "pt").meaning, /house|home/);
  assert.match(look(file("ca"), "casa", "ca").meaning, /house|home/);
  assert.match(look(file("th"), "บ้าน", "th").meaning, /house|home/);
});

test("Bisaya: o/u and e/i are one letter, so Wiktionary's and Wolff's spellings both find a word", () => {
  assert.equal(matchKey("Kaáyo", "ceb"), "kaayu");
  assert.equal(matchKey("kaayu", "ceb"), matchKey("kaayo", "ceb"));
  assert.match(look(file("ceb"), "balay", "ceb").meaning, /house/);
  const wolff = file("ceb-wolff");
  assert.match(wolff.source, /Wolff/);
  assert.match(look(wolff, "kaon", "ceb").meaning, /eat/);
  assert.match(look(wolff, "hatag", "ceb").meaning, /give/);
  assert.equal(look(wolff, "kaon", "ceb").model, "Wiktionary", "(the popup is told which dictionary; see meanings.js)");
  const told = answerFrom(findIn(wolff, [matchKey("hatag", "ceb")]), "hatag", "ceb", { source: wolff.source });
  assert.equal(told.model, "Wolff's Dictionary of Cebuano Visayan");
  assert.match(told.explanation, /Wolff/);
  // Wolff's three-vowel spelling is shown as Bisaya is written today (o in the last syllable).
  assert.ok(wolff.words[matchKey("kaon", "ceb")].some((g) => g[0] === "káon"), "Wolff's káun is shown káon");
  const k = (w) => matchKey(w, "ceb");
  assert.ok(cebuanoVariants(k("akong")).includes(k("ako")) && cebuanoVariants(k("maoy")).includes(k("mao")), "the linker and y come off");
});

test("a word that isn't there finds nothing", () => {
  assert.equal(findIn(file("tl"), ["qqqzzz"]), null);
});

test("number words have meanings in every language (tools/build_meanings.py --numbers)", () => {
  assert.match(look(file("es"), "tres", "es").meaning, /three/);
  assert.match(look(file("fr"), "deux", "fr").meaning, /two/);
  assert.match(look(file("ca"), "dues", "ca").meaning, /two/);
  assert.match(look(file("tl"), "dalawa", "tl").meaning, /two/);
  assert.match(look(file("en"), "million", "en").meaning, /1 000 000|million/);
  assert.match(look(file("fr"), "neuf", "fr").meaning, /nine/, "the number first when the word's other meanings are things");
  assert.match(look(file("fr"), "un", "fr").meaning, /\ba\b/, "a little word keeps its own meaning first");
});

test("a verb form before a rare noun spelled the same, when the word table says it is the verb", () => {
  const es = file("es");
  const put = findIn(es, ["pongo", "poner"]);
  assert.match(put.groups[0][2][0], /put/, "pongo is 'I put' before 'orangutan'");
  assert.match(put.formOf, /first-person singular/);
  assert.ok(put.groups.some((g) => /orangutan/.test(g[2][0])), "the noun is still there");
  assert.match(findIn(es, ["pongo"]).groups[0][2][0], /orangutan/, "without the word table, the word's own entry");
  assert.match(findIn(es, ["gracias", "gracia"]).groups[0][2][0], /thank/, "an exclamation keeps its own meaning");
  const ca = file("ca");
  assert.match(findIn(ca, ["faig", "fer"]).groups[0][2][0], /make|do/);
  assert.match(findIn(ca, ["sóc", "ser"]).groups[0][2][0], /\bbe\b/, "sóc -> soc -> ser: through the other spelling");
});

test("Spanish: the popup agrees with the word table, and says what form a word also is", () => {
  const es = file("es");
  const first = (keys) => findIn(es, keys).groups[0][0];
  const digo = findIn(es, ["digo", "decir"]);
  assert.equal(digo.groups[0][0], "decir", "digo is decir's 'I say' before the exclamation 'I mean'");
  assert.match(digo.formOf, /first-person singular present/);
  assert.ok(digo.groups.some((g) => /I mean/.test(g[2][0])), "the exclamation is still there");
  assert.equal(first(["vaya", "ir"]), "ir");
  assert.equal(first(["sepa", "saber"]), "saber");
  assert.match(findIn(es, ["cállate", "callar"]).groups[0][2][0], /shut up/, "a command with its pronoun keeps its own meaning");
  assert.equal(first(["podés", "poder"]), "poder", "no entry of its own: the word table's verb first, not podar");
  assert.equal(first(["idos", "ir"]), "ir", "not idus");
  const fuera = findIn(es, ["fuera", "ser"]);
  assert.match(fuera.groups[0][2][0], /outside/, "a word with ordinary meanings of its own keeps them first");
  assert.match(fuera.formOf, /^also .*imperfect subjunctive of ser/, "and says what form it also is");
  assert.match(findIn(es, ["pasa", "pasar"]).formOf, /^third-person singular present indicative$/);
  const answer = answerFrom(findIn(es, ["digo", "decir"]), "digo", "es");
  assert.equal(answer.lemma, "decir");
  assert.match(answer.morphology, /present indicative of decir/);
});

test("a Tagalog or Bisaya root found by taking affixes off: the verb before the pronoun", () => {
  const ceb = file("ceb");
  assert.match(findIn(ceb, [matchKey("nakita", "ceb"), matchKey("kita", "ceb")]).groups[0][2][0], /see/);
  const k = (w) => matchKey(w, "ceb");
  assert.match(findIn(ceb, [k("imong"), k("imong"), k("imo")]).groups[0][2][0], /2nd person|your/, "imong is imo with the linker");
  assert.match(findIn(file("tl"), ["nilang", "nila"]).groups[0][2][0], /their/, "nilang is nila, not indigo");
});

test("Tagalog and Bisaya gaps: prefixes, chat spellings, Tagalog and English words (build_meanings.py --fill)", () => {
  const tl = file("tl");
  const ceb = file("ceb");
  const k = (w) => matchKey(w, "ceb");
  assert.match(findIn(tl, ["mag"]).formOf, /prefix mag-/);
  assert.match(findIn(tl, ["nung"]).groups[0][2][0], /when/);
  assert.match(findIn(tl, ["ding"]).groups[0][2][0], /too|also/);
  const school = findIn(tl, ["school"]);
  assert.equal(String(school.groups[0][3]).split("|")[2], "English word", "marked as borrowed");
  assert.equal(school.groups.some(ordinary), false, "and so only a last resort");
  assert.match(findIn(ceb, [k("mas")]).groups[0][2][0], /more/);
  assert.match(findIn(ceb, [k("matag")]).groups[0][2][0], /each/);
  assert.equal(findIn(ceb, [k("bai")]), null, "English bae shares Bisaya bai's key, so it is not borrowed");
  // A borrowed meaning gives way to the word's own language reached another way.
  const data = { lang: "ceb", words: { x: [["x", "noun", ["English thing"], "||English word"]], y: [["y", "verb", ["Bisaya thing"], ""]] }, forms: {} };
  assert.equal(findIn(data, ["x", "y"]).key, "y");
  assert.equal(findIn(data, ["x"]).key, "x", "and is there when nothing else is");
});

test("Italian po', mo', di': the apostrophe is part of the word", () => {
  assert.deepEqual(wordKeys("po'", "it", () => "poco"), ["po'", "poco", "po"]);
  assert.deepEqual(wordKeys("po’,", "it", () => "poco"), ["po'", "poco", "po"], "curly apostrophe, a comma after it");
  assert.deepEqual(wordKeys("l'anno", "it", () => "anno"), ["l'anno", "anno"]);
  assert.deepEqual(wordKeys("Casa", "es", () => "casa"), ["casa"]);
  assert.match(look(file("it"), "po'", "it", ["poco"]).meaning, /little/);
});

test("Chinese single characters have their everyday meaning first; Japanese spellings find each other", () => {
  const zh = file("zh");
  assert.match(look(zh, "的", "zh").meaning, /genitive|possess/, "的: de, the possessive, before dí 'bright'");
  assert.match(look(zh, "都", "zh").meaning, /^all/, "都: dōu 'all' before dū 'capital'");
  assert.match(look(zh, "我", "zh").meaning, /\bI\b/);
  assert.match(look(zh, "还", "zh").meaning, /still/, "还 is 還 (still), before the old form it also is");
  assert.match(look(zh, "这", "zh").meaning, /this/);
  // The modern sense before the literary or original one (CC-CEDICT's order, for single characters).
  for (const [w, sense] of [["是", /^to be/], ["和", /^and/], ["就", /^then/], ["会", /can/], ["后", /behind/], ["当", /to be/],
    ["月", /^moon/], ["但", /^but/], ["从", /^from/], ["快", /fast|quick/], ["等", /wait/], ["了", /perfective|completion/]]) {
    assert.match(look(zh, w, "zh").meaning, sense, w);
  }
  // Grammar words and others whose everyday sense CC-CEDICT itself lists late (EVERYDAY_ZH in build_meanings.py).
  for (const [w, sense] of [["被", /passive/], ["跟", /^with/], ["才", /^only after; only then/], ["里", /^in; inside/],
    ["不", /^not/], ["以", /^by; with/], ["让", /let/], ["给", /^to give/], ["别", /don't/], ["太", /^too/],
    ["听", /^to listen/], ["心", /^heart/], ["马", /^horse/], ["您", /^you/], ["话", /^words/]]) {
    assert.match(look(zh, w, "zh").meaning, sense, w);
  }
  // Words of two or more characters keep Wiktionary's order, their usual meaning first.
  assert.match(look(zh, "告诉", "zh", ["告訴"]).meaning, /tell/);
  assert.match(look(zh, "一起", "zh", ["一起"]).meaning, /together/);
  const ja = file("ja");
  assert.match(look(ja, "まだ", "ja").meaning, /not yet|still/, "まだ: see 未だ");
  assert.match(look(ja, "分かる", "ja").meaning, /understand/, "分かる: see わかる");
  assert.match(look(ja, "ください", "ja").meaning, /下さる|please/, "ください: see 下さい");
  // A kana spelling that is many words: the commonest written one, none too rare, not a single kana.
  assert.match(look(ja, "なん", "ja").meaning, /what/, "なん: 何, not 男");
  assert.match(look(ja, "みる", "ja").meaning, /see|look/, "みる: 見る, not ミル");
  assert.equal(look(ja, "ませ", "ja"), null, "ませ is not 釻 'hanging ring' (the app then looks up ます)");
  assert.equal(look(ja, "お", "ja"), null, "a single kana points nowhere");
  assert.match(look(ja, "生き", "ja").meaning, /living|alive/, "生き: the いき entries written 生き, not 息 'breath'");
  assert.match(look(ja, "口", "ja").meaning, /mouth/, "a topic label (Buddhism) is not an old sense");
});

// The popup's lookup for Bisaya, as web/js/meanings.js runs it: Wolff's dictionary first, then Wiktionary.
const bisaya = () => {
  const files = [file("ceb-wolff"), file("ceb")];
  const list = JSON.parse(gunzipSync(readFileSync(new URL("../../docs/lexicon/ceb-roots.json.gz", import.meta.url))).toString("utf8"));
  const rank = commonness(list.lemmas);
  return (word) => lookUp(files, wordKeys(word, "ceb"), word, "ceb", { rank });
};

test("Bisaya: a root the dictionaries have, with the affixes off, when they lack the word itself", () => {
  const k = (w) => matchKey(w, "ceb");
  const has = (...roots) => (x) => roots.map(k).includes(x);
  assert.equal(cebuanoStems(k("moagi"), has("agi"))[0].key, k("agi"), "a 3-letter root beginning with a vowel");
  assert.equal(cebuanoStems(k("gipugngan"), has("pugong"))[0].key, k("pugong"), "ng is one sound");
  assert.equal(cebuanoStems(k("sudlan"), has("sulod"))[0].key, k("sulod"), "the dropped vowel back, the consonants swapped");
  assert.equal(cebuanoStems(k("mamalit"), has("palit"))[0].key, k("palit"), "maN- swallows the p");
  assert.equal(cebuanoStems(k("magtutudlo"), has("tudlo"))[0].key, k("tudlo"), "the repeated syllable");
  assert.deepEqual(cebuanoStems(k("bayan"), has("bay")), [], "no 3-letter root beginning with a consonant");
  assert.deepEqual(cebuanoStems(k("lokasyon"), has("lukas")), [], "a Spanish word is no root + suffix");
  assert.deepEqual(cebuanoStems(k("pagsumite"), has("siti")), [], "a short root only one affix away");
  const rank = (x) => ({ [k("bayad")]: 10, [k("bayod")]: 900 })[x] ?? Infinity;
  assert.equal(cebuanoStems(k("bayran"), has("bayad", "bayod"), rank)[0].key, k("bayad"), "of two roots as long, the commoner");

  const look = bisaya();
  const moagi = look("moagi");
  assert.equal(moagi.key, k("agi"));
  assert.match(moagi.groups[0][2][0], /go by|pass/, "a verb form: the root's verb meaning, not Wolff's first agi, 'oh my!'");
  assert.match(moagi.formOf, /^form of /);
  assert.match(look("naila").groups[0][2][0], /identify|recogni|know/, "ila the verb, not ila 'theirs'");
  assert.match(look("halayo").groups[0][2][0], /far|distant/);
  assert.match(look("mamalit").groups[0][2][0], /buy/);
  assert.match(look("bayran").groups[0][2][0], /pay/);
  assert.match(look("nagkalain-laing").groups[0][2][0], /other|different/, "the linker off first");
  assert.equal(look("kaon").formOf, "", "a word the dictionary has is found as before");
});

test("Bisaya: Wolff's words listed by their affix, translation tables, English words (tools/build_*.py)", () => {
  const look = bisaya();
  const household = look("panimalay");
  assert.match(household.groups[0][2][0], /household/, "paniN- under balay, spelled out");
  assert.equal(String(household.groups[0][3]).split("|")[0], "balay", "with its root");
  assert.match(look("kalahian").groups[0][2][0], /difference/, "from the English entry's translation table");
  const the = look("the");
  assert.equal(String(the.groups[0][3]).split("|")[2], "English word", "an English word whose key a rarer typing slip shares");
  const post = look("mopost");
  assert.equal(post.formOf, "mo- + post", "a Bisaya prefix on an English verb");
  assert.equal(post.groups[0][1], "verb");
  assert.equal(look("milan"), null, "not mi- + LAN");
});
