// Step 2 of the Japanese basics course's word list, as tools/course/rank.mjs is for Arabic: the forms
// counted by forms_ja.py, grouped by dictionary word with the tokenizer the app uses for Japanese
// (web/js/lexicon/kuromoji.js and IPADIC, docs/lexicon/ja-ipadic.bin.gz): 言っ, 言い and 言わ all count
// for 言う. Ranked by how common each dictionary word is in all its forms together.
//
//   node tools/course/ja/rank_ja.mjs   ->  tools/course/build/ja-ranked.json
//     [{rank, lemma, reading, pos, sub, freq, forms: [[form, freq], ...]}, ...]  (the top 3000)
//
// Kana and kanji spellings of one word (いう and 言う, こと and 事) stay apart here: which one a
// learner should see is chosen by hand, in tools/course/ja/words.json.
import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { JapaneseDictionary, tokenize } from "../../../web/js/lexicon/kuromoji.js";
import { japaneseWords, hiragana } from "../../../web/js/lexicon/japanese.js";

const here = dirname(fileURLToPath(import.meta.url));
const build = join(here, "..", "build");
const root = join(here, "..", "..", "..");
const forms = JSON.parse(readFileSync(join(build, "ja-forms.json"), "utf8"));
const dict = new JapaneseDictionary(gunzipSync(readFileSync(join(root, "docs", "lexicon", "ja-ipadic.bin.gz"))));

const POS = { 名詞: "noun", 動詞: "verb", 形容詞: "adj", 副詞: "adv", 助詞: "part", 助動詞: "aux", 連体詞: "adnom",
  接続詞: "conj", 感動詞: "interj", 接頭詞: "prefix", 記号: "symbol", フィラー: "filler" };

const reading = (text) => tokenize(dict, text).map((t) => hiragana(t.reading || t.surface)).join("");

// A verb's stem alone looks like a noun to the tokenizer (思い, 教え, 始め), but in text it is mostly the
// verb (思います, 教えて): a form with a kanji, ending in kana, that reads as a verb before ます is counted
// for the verb. (Kana-only forms are left alone: ため, とき and うち would turn into verbs they aren't.)
const STEM = /[一-鿿々].*[ぁ-ゖ]$/u;
function asVerb(form) {
  if (!STEM.test(form)) return null;
  const [t] = tokenize(dict, form + "ます");
  return t && t.surface === form && t.pos === "動詞" && t.pos1 === "自立" ? t : null;
}

const byKey = new Map();
for (const [form, freq] of forms) {
  const words = japaneseWords(dict, form).filter((w) => w.kind !== "punct");
  if (words.length !== 1) continue; // not one word to the tokenizer (rare: wordfreq's forms are MeCab's words)
  let { lemma } = words[0];
  const tokens = tokenize(dict, form);
  let main = tokens.find((t) => t.pos !== "接頭詞") || tokens[0];
  const verb = tokens.length === 1 && main.pos === "名詞" && main.pos1 === "一般" ? asVerb(form) : null;
  if (verb) { main = verb; lemma = verb.basic; }
  const pos = POS[main.pos] || main.pos;
  const key = `${lemma}|${pos}`;
  let e = byKey.get(key);
  if (!e) byKey.set(key, (e = { lemma, reading: reading(lemma), pos, sub: main.pos1, freq: 0, forms: [] }));
  e.freq += freq;
  e.forms.push([form, freq]);
}

const ranked = [...byKey.values()].sort((x, y) => y.freq - x.freq).slice(0, 3000)
  .map((e, i) => ({ rank: i + 1, ...e, freq: Number(e.freq.toPrecision(4)), forms: e.forms.slice(0, 6).map(([f, n]) => [f, Number(n.toPrecision(3))]) }));
writeFileSync(join(build, "ja-ranked.json"), JSON.stringify(ranked, null, 1));
console.log(`${byKey.size} dictionary words from ${forms.length} forms; top ${ranked.length} -> build/ja-ranked.json`);
