// Run with: node --test tests/js/
// The language table and the rules that differ per language: telling languages apart, spacing,
// real words for Japanese/Chinese, and what the AI teacher is told.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LANGUAGES, LANGUAGE_CODES, detectLanguage, episodeLanguage, gap, joinWords, langAttrs, regroupWords,
  setStudyLanguage, studyLanguage, hasStudyLanguage, vocabFromDefinition,
} from "../../web/js/languages.js";
import { cacheKey, define, markWord, schemaFor, systemPrompt, SCHEMA } from "../../web/js/definer.js";
import { endsSentence, EDGE_PUNCT } from "../../web/js/wordlookup.js";

test("fifteen languages, each with everything the screens need", () => {
  assert.deepEqual(LANGUAGE_CODES, ["es", "ar", "fr", "ja", "zh", "ru", "it", "tl", "pt", "ca", "ceb", "th", "de", "fa", "hi", "en"]);
  for (const code of LANGUAGE_CODES) {
    const L = LANGUAGES[code];
    for (const key of ["name", "native", "hello", "hi", "search", "word", "sample", "pageSample", "standard", "note"]) {
      assert.ok(L[key], `${code}.${key}`);
    }
    assert.equal(L.greet.length, 3);
    assert.ok(L.test.marked.includes(`⟦${L.test.word}⟧`), `${code} test sentence marks its word`);
    assert.equal(L.dir, code === "ar" || code === "fa" ? "rtl" : "ltr");
  }
  assert.equal(langAttrs("ar"), 'lang="ar" dir="rtl"');
  assert.equal(langAttrs("ja"), 'lang="ja" dir="ltr"');
  assert.equal(langAttrs("nonsense"), 'lang="en" dir="ltr"');
});

test("the study language is unset until chosen, and Arabic stands in until then", () => {
  setStudyLanguage("");
  assert.equal(hasStudyLanguage(), false);
  assert.equal(studyLanguage(), "ar");
  setStudyLanguage("klingon");
  assert.equal(hasStudyLanguage(), false);
  setStudyLanguage("fr");
  assert.equal(studyLanguage(), "fr");
  // Things transcribed before languages existed are Arabic, whatever is being studied now.
  assert.equal(episodeLanguage({ language: null }), "ar");
  assert.equal(episodeLanguage({ language: "zh" }), "zh");
  setStudyLanguage("");
});

test("languages are told apart by their letters", () => {
  assert.equal(detectLanguage("مرحبا بكم", "es"), "ar");
  assert.equal(detectLanguage("Привет, мир", "ar"), "ru");
  assert.equal(detectLanguage("今日はいい天気ですね", "ar"), "ja");
  assert.equal(detectLanguage("今天天气很好", "ar"), "zh");
  assert.equal(detectLanguage("東京", "ja"), "ja", "kanji alone belong to Japanese when that is being studied");
  assert.equal(detectLanguage("Bonjour tout le monde", "fr"), "fr");
  assert.equal(detectLanguage("Hola a todos", "es"), "es");
  assert.equal(detectLanguage("Hello there", "ar"), "en", "Latin text is not Arabic");
  assert.equal(detectLanguage("123 …", "ru"), "ru", "nothing to judge by: the study language");
});

test("words are joined with spaces, except in Japanese and Chinese", () => {
  assert.equal(joinWords(["Hola,", "¿qué", "tal?"], "es"), "Hola, ¿qué tal?");
  assert.equal(joinWords(["انتي", "جديدة", "هون؟"], "ar"), "انتي جديدة هون؟");
  assert.equal(joinWords(["今天", "天气", "很", "好。"], "zh"), "今天天气很好。");
  assert.equal(joinWords(["我", "在", "New", "York", "工作。"], "zh"), "我在New York工作。");
  assert.equal(gap("Hello,", "world", "ja"), " ");
  assert.equal(markWord(["他", "很", "靠谱。"], 2, 2, "zh"), "他很⟦靠谱。⟧");
  assert.equal(markWord(["Ну", "ладно,", "пойдём."], 1, 1, "ru"), "Ну ⟦ладно,⟧ пойдём.");
  assert.equal(markWord(["a", "b", "c"], 0, 1), "⟦a b⟧ c", "the default (Arabic) spacing is unchanged");
});

test("sentence ends and edge punctuation in every script", () => {
  for (const w of ["fin.", "¿sí?", "هون؟", "好。", "ですか？", "нет!", "«oui.»", "です。」"]) assert.ok(endsSentence(w), w);
  for (const w of ["hola,", "今天", "и"]) assert.ok(!endsSentence(w), w);
  const strip = (w) => w.replace(EDGE_PUNCT, "");
  assert.equal(strip("«bonjour,"), "bonjour");
  assert.equal(strip("¿qué?"), "qué");
  assert.equal(strip("「東京」。"), "東京");
  assert.equal(strip("l'homme"), "l'homme", "punctuation inside a word stays");
});

test("Japanese/Chinese: speech pieces become real words with sensible times", () => {
  // Whisper returns Chinese a character or two at a time.
  const pieces = ["今", "天", "天", "气", "很", "好。", "我", "们", "去", "公", "园", "吧！"];
  const W = { text: pieces, start: pieces.map((_, i) => i), end: pieces.map((_, i) => i + 1),
              seg: pieces.map((_, i) => (i < 6 ? 0 : 1)) };
  const out = regroupWords(W, "zh");
  assert.ok(out.text.length < pieces.length, "characters were merged into words");
  assert.ok(out.text.includes("今天") && out.text.includes("天气"), out.text.join("|"));
  assert.equal(out.text.join(""), pieces.join(""), "no text lost or added");
  assert.ok(out.text.some((t) => t.endsWith("好。")) && out.text.includes("吧！"), "punctuation stays attached to its word");
  const first = out.text.indexOf("今天");
  assert.equal(out.start[first], 0);
  assert.equal(out.end[first], 2);
  for (let i = 0; i < out.text.length; i++) {
    assert.ok(out.end[i] > out.start[i], "every word has a length in time");
    if (i) assert.ok(out.start[i] >= out.start[i - 1], "words stay in time order");
  }
  assert.deepEqual([...new Set(out.seg)], [0, 1], "words never cross a line");
});

test("Japanese/Chinese: the line's own text restores spaces and unbroken names", () => {
  const pieces = ["我", "用", "i", "Phone", "在", "New", "York", "。"];
  const W = { text: pieces, start: pieces.map((_, i) => i), end: pieces.map((_, i) => i + 1), seg: pieces.map(() => 0) };
  const out = regroupWords(W, "zh", true, () => "我用iPhone在New York。");
  assert.ok(out.text.includes("iPhone"), out.text.join("|"));
  assert.ok(out.text.includes("New") && out.text.some((t) => t.startsWith("York")), out.text.join("|"));
  assert.equal(joinWords(out.text, "zh"), "我用iPhone在New York。");
  const iphone = out.text.indexOf("iPhone");
  assert.equal(out.start[iphone], 2);
  assert.equal(out.end[iphone], 4);
});

test("Japanese/Chinese: an imported page's unbroken sentence is split into words", () => {
  const W = { text: ["コーヒーは世界で人気のある飲み物です。", "Tokyo", "Tower"], start: [0, 1, 2], end: [1, 2, 3], seg: [0, 0, 0] };
  const out = regroupWords(W, "ja", false);
  assert.ok(out.text.length > 5, out.text.join("|"));
  assert.ok(out.text.includes("コーヒー"), out.text.join("|"));
  assert.deepEqual(out.text.slice(-2), ["Tokyo", "Tower"]);
  assert.equal(joinWords(out.text, "ja"), "コーヒーは世界で人気のある飲み物です。Tokyo Tower");
  assert.ok(out.start[1] > 0 && out.end[1] <= 1, "positions are spread inside the original piece");
});

test("other languages are left exactly as stored", () => {
  const W = { text: ["Hola,", "mundo."], start: [0, 1], end: [1, 2], seg: [0, 0] };
  assert.equal(regroupWords(W, "es"), W);
  assert.equal(regroupWords(W, "ar"), W);
});

test("the AI teacher is told which language it is teaching", async () => {
  assert.deepEqual(schemaFor("ar"), SCHEMA);
  assert.deepEqual(schemaFor(undefined), SCHEMA, "no language recorded means Arabic");
  assert.deepEqual(Object.keys(schemaFor("ja").properties), Object.keys(SCHEMA.properties), "same fields for every language");
  assert.match(schemaFor("ja").properties.vocalized.description, /hiragana/);
  assert.match(schemaFor("zh").properties.vocalized.description, /[Pp]inyin/);
  assert.match(schemaFor("ru").properties.vocalized.description, /stress/);
  assert.match(systemPrompt("English", "es"), /expert Spanish teacher/);
  assert.match(systemPrompt("German", "fr"), /in German\./);
  assert.doesNotMatch(systemPrompt("English", "fr"), /Arabic/);

  let sent = null;
  const transport = async (req) => { sent = req; return { status: 200, text: JSON.stringify({ content: [{ type: "text", text: "{\"meaning\":\"reliable\"}" }] }) }; };
  const d = await define({ provider: "claude", key: "k", model: "claude-opus-5-5", language: "English" },
    { ...LANGUAGES.zh.test, lang: "zh" }, transport);
  assert.equal(d.meaning, "reliable");
  assert.match(sent.body.system, /expert Chinese teacher/);
  assert.deepEqual(sent.body.output_config.format.schema, schemaFor("zh"));
});

test("saved answers: Arabic keys unchanged, other languages kept apart", async () => {
  const old = await cacheKey("هون", "انتي جديدة ⟦هون⟧؟", "English");
  assert.equal(await cacheKey("هون", "انتي جديدة ⟦هون⟧؟", "English", "ar"), old);
  assert.equal(await cacheKey("هون", "انتي جديدة ⟦هون⟧؟", "English", undefined), old);
  assert.notEqual(await cacheKey("pan", "el ⟦pan⟧", "English", "es"), await cacheKey("pan", "el ⟦pan⟧", "English", "fr"));
});

test("saving a looked-up word: Arabic keeps its vowels, others note the reading", () => {
  assert.deepEqual(vocabFromDefinition(null, "hola", "es"), { text: "hola", meaning: "", notes: "", translation: "" });
  const ar = vocabFromDefinition({ vocalized: "هَوْن", lemma: "هون", root: "ه و ن", pos: "adverb", meaning: "here", dialect_note: "" }, "هون", "ar");
  assert.equal(ar.text, "هَوْن");
  assert.equal(ar.notes, "Dictionary form: هون · Root: ه و ن · adverb");
  const zh = vocabFromDefinition({ vocalized: "kàopǔ", lemma: "靠谱", root: "靠 rely + 谱 score", pos: "adjective", meaning: "reliable", dialect_note: "colloquial" }, "靠谱", "zh");
  assert.equal(zh.text, "靠谱");
  assert.equal(zh.notes, "Reading: kàopǔ · Dictionary form: 靠谱 · Characters: 靠 rely + 谱 score · adjective · colloquial");
});

test("saving a looked-up word keeps its sentence translation, marked where the word is", () => {
  const saved = (def) => vocabFromDefinition({ vocalized: "", lemma: "", root: "", pos: "", dialect_note: "", ...def }, "w", "es").translation;
  assert.equal(saved({ meaning: "confused", sentence_translation: "The girl was confused by the question.",
    translation_marked: "The girl was ⟦confused⟧ by the question." }), "The girl was ⟦confused⟧ by the question.");
  // An answer saved before the AI marked its translation: the meaning is looked for in it.
  assert.equal(saved({ meaning: "Here", sentence_translation: "Are you new here?" }), "Are you new ⟦here⟧?");
  assert.equal(saved({ meaning: "a+b (c)", sentence_translation: "It says a+b (c)." }), "It says ⟦a+b (c)⟧.");
  // Not found as whole words, or found more than once: kept unmarked rather than guessed.
  assert.equal(saved({ meaning: "the", sentence_translation: "Then there were others." }), "Then there were others.");
  assert.equal(saved({ meaning: "big", sentence_translation: "The big dog saw the big cat." }), "The big dog saw the big cat.");
  assert.equal(saved({ meaning: "to write", sentence_translation: "He wrote it." }), "He wrote it.");
  assert.equal(saved({ meaning: "", sentence_translation: "" }), "");
});

test("Italian and Tagalog: Latin letters count as the language being studied", () => {
  assert.equal(detectLanguage("Ci vediamo magari domani.", "it"), "it");
  assert.equal(detectLanguage("Hindi ako nakapunta kasi umulan.", "tl"), "tl");
  assert.equal(detectLanguage("Hindi ako nakapunta kasi umulan.", "ar"), "en", "Latin text while studying Arabic is not Tagalog");
  for (const code of ["it", "tl"]) {
    const prompt = systemPrompt("en", code);
    assert.match(prompt, code === "it" ? /Italian/ : /Tagalog/);
    assert.ok(schemaFor(code), `${code} has an answer shape`);
  }
});

test("Brazilian Portuguese, Catalan and Bisaya: Latin letters count as the language being studied", () => {
  assert.equal(detectLanguage("Beleza, a gente se vê amanhã.", "pt"), "pt");
  assert.equal(detectLanguage("Doncs no ho sé, la veritat.", "ca"), "ca");
  assert.equal(detectLanguage("Ambot lang, basin ugma pa siya moabot.", "ceb"), "ceb");
  assert.equal(detectLanguage("Ambot lang, basin ugma pa siya moabot.", "th"), "en", "Latin text while studying Thai is not Bisaya");
  for (const [code, name] of [["pt", /Brazilian Portuguese/], ["ca", /Catalan/], ["ceb", /Cebuano \(Bisaya\)/], ["th", /Thai/]]) {
    assert.match(systemPrompt("en", code), name);
    assert.ok(schemaFor(code), `${code} has an answer shape`);
  }
});

test("Thai: told by its letters, written without spaces, and split into words by the device", () => {
  assert.equal(detectLanguage("เดี๋ยวโทรกลับนะ", "es"), "th");
  assert.equal(detectLanguage("เดี๋ยวโทรกลับนะ"), "th");
  assert.equal(LANGUAGES.th.unspaced, true);
  assert.equal(gap("เดี๋ยว", "โทร", "th"), "");
  assert.equal(joinWords(["ภาษา", "ไทย", "Tamkeen", "app"], "th"), "ภาษาไทยTamkeen app");
  // Speech recognition hands Thai over a few letters at a time: they become real words.
  const W = { start: [0, 0.2, 0.4, 0.6], end: [0.2, 0.4, 0.6, 0.8], seg: [0, 0, 0, 0], text: ["สวัส", "ดี", "ครั", "บ"] };
  const out = regroupWords(W, "th");
  assert.equal(out.text.join(""), "สวัสดีครับ");
  assert.ok(out.text.length < 4, `regrouped: ${out.text.join("|")}`);
});

test("Thai: everyday words the device's word breaker cuts in pieces are joined back", () => {
  const page = (text) => regroupWords({ start: [0], end: [1], seg: [0], text: [text] }, "th", false).text;
  // โรงพยาบาล (hospital) is โรง + พยาบาล to the breaker, ผลกระทบ (impact) ผลก + ระ + ทบ.
  // (The space between the two phrases stays with the word before it, so the page still reads in phrases.)
  assert.deepEqual(page("แม่ไปโรงพยาบาล ผลกระทบยังคงอยู่"), ["แม่", "ไป", "โรงพยาบาล ", "ผลกระทบ", "ยังคง", "อยู่"]);
  assert.equal(joinWords(page("แม่ไปโรงพยาบาล ผลกระทบยังคงอยู่"), "th"), "แม่ไปโรงพยาบาล ผลกระทบยังคงอยู่");
  assert.deepEqual(page("ผู้หญิงตัดสินใจเดินทางไปต่างประเทศ"), ["ผู้หญิง", "ตัดสินใจ", "เดินทาง", "ไป", "ต่างประเทศ"]);
  // Usually two words in running text, so not joined: "the person who is in the house".
  assert.deepEqual(page("คนที่อยู่ในบ้าน"), ["คน", "ที่", "อยู่", "ใน", "บ้าน"]);
  // A transcript's few-letter pieces, cut in the middle of a word and of a vowel sign.
  const p = ["นา", "ยกร", "ั", "ฐมนต", "รี", "เด", "ินท", "า", "งไป"];
  const out = regroupWords({ start: p.map((_, i) => i), end: p.map((_, i) => i + 1), seg: p.map(() => 0), text: p }, "th");
  assert.deepEqual(out.text, ["นายกรัฐมนตรี", "เดินทาง", "ไป"]);
  assert.equal(out.start[1], 5, "a joined word starts where its first piece does");
});

test("English can be learned too: Latin letters count as English, and the AI teacher knows it", () => {
  assert.equal(detectLanguage("I'm gonna call you later, okay?", "en"), "en");
  assert.equal(detectLanguage("Te llamo ahorita, vale?", "es"), "es");
  const prompt = systemPrompt("Spanish", "en");
  assert.match(prompt, /English/);
  assert.ok(schemaFor("en"), "en has an answer shape");
});
