// No AI: the built-in dictionary (web/js/lexicon/meaningdata.js) with the real files from
// docs/lexicon (tools/build_meanings.py).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { answerFrom, arabicVariants, findIn, matchKey } from "../../web/js/lexicon/meaningdata.js";

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

test("a word that isn't there finds nothing", () => {
  assert.equal(findIn(file("tl"), ["qqqzzz"]), null);
});
