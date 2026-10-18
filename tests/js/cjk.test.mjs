// Run with: node --test tests/js/
// Japanese and Chinese: splitting text into real words, dictionary forms, furigana, pinyin and
// simplified/traditional characters. Reads the real dictionaries in docs/lexicon/.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { JapaneseDictionary, tokenize } from "../../web/js/lexicon/kuromoji.js";
import { furigana, hiragana, japaneseLexeme, japaneseWords } from "../../web/js/lexicon/japanese.js";
import { ChineseDictionary, chineseLexeme, chineseWords, pinyinSyllables, toneMark } from "../../web/js/lexicon/chinese.js";
import { lexemesFor, usesDictionaries } from "../../web/js/lexicon/words.js";
import { regroupWords, setWordSplitter } from "../../web/js/languages.js";

const file = (name) => gunzipSync(readFileSync(new URL(`../../docs/lexicon/${name}`, import.meta.url)));
const ja = new JapaneseDictionary(file("ja-ipadic.bin.gz"));
const zh = new ChineseDictionary(JSON.parse(file("zh-cedict.json.gz")));

const words = (text) => japaneseWords(ja, text).filter((w) => w.kind !== "punct");
const cut = (text) => chineseWords(zh, text).filter((w) => w.lemma).map((w) => w.text);

test("the Japanese tokenizer covers the whole text, with readings and dictionary forms", () => {
  const text = "昨日は友達とラーメンを食べました。iPhone 15を買った";
  const tokens = tokenize(ja, text);
  assert.equal(tokens.map((t) => t.surface).join(""), text);
  for (const t of tokens) assert.equal(text.slice(t.start, t.start + t.surface.length), t.surface);
  const eat = tokens.find((t) => t.surface === "食べ");
  assert.deepEqual([eat.pos, eat.basic, eat.reading], ["動詞", "食べる", "タベ"]);
  assert.equal(tokens.find((t) => t.surface === "ラーメン").reading, "ラーメン");
});

test("a verb or adjective and its endings are one Japanese word, known by its dictionary form", () => {
  assert.deepEqual(words("昨日は友達とラーメンを食べました。").map((w) => w.text), ["昨日", "は", "友達", "と", "ラーメン", "を", "食べました"]);
  for (const [text, lemma] of [["食べた", "食べる"], ["食べます", "食べる"], ["食べている", "食べる"], ["食べませんでした", "食べる"],
    ["飲みたくなかった", "飲む"], ["行かなければならない", "行く"], ["住んでいます", "住む"], ["高かった", "高い"], ["読まれる", "読む"]]) {
    const found = words(text);
    assert.equal(found.length, 1, `${text}: ${found.map((w) => w.text)}`);
    assert.equal(found[0].lemma, lemma, text);
  }
  // Particles and the copula after a noun stay words of their own; prefixes and suffixes join.
  assert.deepEqual(words("学生です").map((w) => w.text), ["学生", "です"]);
  assert.deepEqual(words("日本人の田中さんはお茶が好き").map((w) => w.text), ["日本人", "の", "田中さん", "は", "お茶", "が", "好き"]);
});

test("Japanese seen words: every form counts as the dictionary form", () => {
  const key = (w) => japaneseLexeme(w, ja).key;
  assert.equal(key("食べた"), "ja|食べる|x");
  assert.equal(key("食べます。"), "ja|食べる|x");
  assert.equal(key("食べる"), "ja|食べる|x", "a word already in its dictionary form keeps the key it always had");
  assert.equal(key("ラーメン"), "ja|ラーメン|x");
  assert.equal(japaneseLexeme("。", ja), null);
  assert.deepEqual(lexemesFor(["食べました", "を"], "ja", [ja]).map((x) => x.key), ["ja|食べる|x", "ja|を|x"]);
  assert.deepEqual(lexemesFor(["食べました"], "ja", []).map((x) => x.key), ["ja|食べました|x"], "no dictionary: by spelling, as before");
  assert.ok(usesDictionaries("ja") && usesDictionaries("zh"));
});

test("furigana only over the kanji", () => {
  assert.deepEqual(furigana("食べ", "タベ"), [["食", "た"], ["べ", ""]]);
  assert.deepEqual(furigana("今日", "キョウ"), [["今日", "きょう"]]);
  assert.deepEqual(furigana("取り消し", "トリケシ"), [["取", "と"], ["り", ""], ["消", "け"], ["し", ""]]);
  assert.deepEqual(furigana("ラーメン", "ラーメン"), [["ラーメン", ""]], "no kanji, no furigana");
  assert.deepEqual(furigana("お茶", "オチャ"), [["お", ""], ["茶", "ちゃ"]]);
  assert.equal(hiragana("タベル"), "たべる");
  const reading = (w) => words(w)[0].parts.map((p) => p.reading).join("");
  assert.equal(reading("日本"), "にほん", "the everyday reading, not IPADIC's にっぽん");
});

test("Chinese is cut into the likeliest words, with pinyin", () => {
  assert.deepEqual(cut("我们在学习中文。"), ["我们", "在", "学习", "中文"]);
  assert.deepEqual(cut("咖啡是世界上最受欢迎的饮料之一"), ["咖啡", "是", "世界", "上", "最", "受欢迎", "的", "饮料", "之一"]);
  assert.deepEqual(cut("研究生命的起源"), ["研究", "生命", "的", "起源"]);
  assert.deepEqual(cut("我昨天买了一个iPhone 15"), ["我", "昨天", "买", "了", "一个", "iPhone", "15"]);
  const w = chineseWords(zh, "学习了");
  assert.deepEqual(w.map((x) => [x.text, x.pinyin]), [["学习", "xue2 xi2"], ["了", "le5"]]);
  // The cut covers the text: every word's index points at it.
  const text = "他說：「你好！」";
  for (const x of chineseWords(zh, text)) assert.equal(text.slice(x.index, x.index + x.text.length), x.text);
});

test("simplified and traditional characters are the same Chinese word, shown either way", () => {
  assert.deepEqual(cut("我們在學習中文"), ["我們", "在", "學習", "中文"]);
  assert.equal(chineseLexeme("學習", zh).key, "zh|学习|x");
  assert.equal(chineseLexeme("学习，", zh).key, "zh|学习|x");
  assert.equal(zh.display("学习", "traditional"), "學習");
  assert.equal(zh.display("頭髮", "simplified"), "头发");
  assert.equal(zh.display("头发", "traditional"), "頭髮", "the word decides: 发 is 髮 in hair, 發 elsewhere");
  assert.equal(zh.display("发现", "traditional"), "發現");
  assert.equal(zh.display("咖啡豆", "traditional"), "咖啡豆", "not a rare variant");
  assert.equal(zh.display("學習", "traditional"), "學習");
  assert.equal(zh.display("學習", ""), "學習", "as written");
});

test("pinyin with tone marks", () => {
  assert.deepEqual(["hao3", "xue2", "lu:4", "lü4", "gui4", "liu2", "zhe5", "er2", "ai4", "zhou1"].map((s) => toneMark(s.replace("u:", "ü")).text),
    ["hǎo", "xué", "lǜ", "lǜ", "guì", "liú", "zhe", "ér", "ài", "zhōu"]);
  assert.deepEqual(pinyinSyllables("ni3 hao3").map((s) => [s.text, s.tone]), [["nǐ", 3], ["hǎo", 3]]);
});

test("transcripts and pages are split with the dictionary once it is loaded", () => {
  // Speech recognition hands Japanese over a few characters at a time.
  const W = { text: ["昨日", "は友", "達と", "ラーメンを", "食べ", "ました。"], start: [0, 1, 2, 3, 4, 5], end: [1, 2, 3, 4, 5, 6], seg: [0, 0, 0, 0, 0, 0] };
  setWordSplitter("ja", { split: (text) => japaneseWords(ja, text).map((w) => ({ index: w.index, segment: w.text })) });
  try {
    const out = regroupWords(W, "ja");
    assert.deepEqual(out.text, ["昨日", "は", "友達", "と", "ラーメン", "を", "食べました。"]);
    assert.equal(out.start[6], 4, "the word's time starts where its first piece does");
    assert.equal(out.end[6], 6);
  } finally {
    setWordSplitter("ja", null);
  }
  // Chinese in traditional characters, shown in simplified when the learner chose that.
  setWordSplitter("zh", { split: (text) => chineseWords(zh, text).map((w) => ({ index: w.index, segment: w.text })),
    show: (word) => zh.display(word, "simplified") });
  try {
    const out = regroupWords({ text: ["我們在學習"], start: [0], end: [5], seg: [0] }, "zh");
    assert.deepEqual(out.text, ["我们", "在", "学习"]);
  } finally {
    setWordSplitter("zh", null);
  }
});
