// "Add words" → Scan (web/js/scanwords.js): reading the AI's answer, turning what Tesseract read into
// the text of a pasted list, the photo's size, which reader reads it, and the files to download.
// Run with: node --test tests/js/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  AI_SIDE, OCR_BYTES, OCR_LANGS, SCAN_SCHEMA, VISION, chooseReader, fitSize, itemsToPaste, markOddOnes, ocrLines, ocrList,
  ocrNames, ocrPaste, ocrPair, ownLanguage, readScan, readingScore, scanPrompt, tesseractLangs, worthAnotherLook,
} from "../../web/js/scanwords.js";
import { parseList } from "../../web/js/addwords.js";
import { askJson } from "../../web/js/definer.js";

// ---------------------------------------------------------------- the photo's size

test("fitSize: the longest side made to fit, the shape kept, never made bigger", () => {
  assert.deepEqual(fitSize(4000, 3000, 1600), { width: 1600, height: 1200, scale: 0.4 });
  assert.deepEqual(fitSize(3000, 4000, 1600), { width: 1200, height: 1600, scale: 0.4 });
  assert.deepEqual(fitSize(800, 600, 1600), { width: 800, height: 600, scale: 1 });
  assert.equal(fitSize(1600, 1600, 1600).scale, 1);
  const odd = fitSize(4032, 3024, AI_SIDE);  // a 12-megapixel phone photo
  assert.equal(odd.width, 1600);
  assert.equal(odd.height, 1200);
  assert.deepEqual(fitSize(10000, 3, 100), { width: 100, height: 1, scale: 0.01 }, "never 0 pixels");
  assert.deepEqual(fitSize(0, 100, 1600), { width: 0, height: 0, scale: 0 });
  assert.deepEqual(fitSize(NaN, 100, 1600), { width: 0, height: 0, scale: 0 });
  assert.deepEqual(fitSize(100, 100, 0), { width: 0, height: 0, scale: 0 });
});

// ---------------------------------------------------------------- which reader

test("chooseReader: the AI when it can see pictures, else this device", () => {
  const ai = { hasKey: true, provider: "claude", online: true, deviceOk: true };
  assert.deepEqual(chooseReader(ai), { reader: "ai", ai: true, why: "ai" });
  for (const provider of ["claude", "gemini", "openai", "grok"]) assert.equal(chooseReader({ ...ai, provider }).reader, "ai", provider);
  assert.deepEqual(chooseReader({ ...ai, prefer: "device" }), { reader: "device", ai: true, why: "chosen" });
  assert.deepEqual(chooseReader({ ...ai, aiOff: true }), { reader: "device", ai: false, why: "aioff" });
  assert.deepEqual(chooseReader({ ...ai, hasKey: false }), { reader: "device", ai: false, why: "nokey" });
  assert.deepEqual(chooseReader({ ...ai, provider: "someone" }), { reader: "device", ai: false, why: "novision" });
  assert.deepEqual(chooseReader({ ...ai, online: false }), { reader: "device", ai: false, why: "offline" });
  // No WebAssembly here: the AI even when this device was chosen; nothing at all without the AI.
  assert.equal(chooseReader({ ...ai, deviceOk: false, prefer: "device" }).reader, "ai");
  assert.deepEqual(chooseReader({ ...ai, deviceOk: false, hasKey: false }), { reader: "none", ai: false, why: "nodevice" });
  assert.equal(chooseReader().reader, "device", "nothing set up: this device");
  assert.deepEqual(Object.keys(VISION).sort(), ["claude", "gemini", "grok", "openai"]);
});

// ---------------------------------------------------------------- the AI's answer

test("scanPrompt: the language, exact copying, nothing made up, strict JSON", () => {
  const p = scanPrompt({ study: "Arabic" });
  assert.match(p.system, /learner of Arabic/);
  assert.match(p.system, /vowel marks, accents/);
  assert.match(p.system, /Never make up a meaning/);
  assert.match(p.system, /handwritten/);
  assert.match(p.system, /single word/);
  assert.match(p.system, /headings, page numbers/);
  assert.match(p.user, /Arabic/);
  assert.equal(p.schema, SCAN_SCHEMA);
  assert.deepEqual(SCAN_SCHEMA.properties.items.items.required, ["word", "meaning", "sentence", "sentence_translation"]);
  assert.equal(SCAN_SCHEMA.properties.items.items.additionalProperties, false);
});

test("readScan: JSON wrapped in words and fences, missing fields, list marks", () => {
  const text = 'Sure! Here it is:\n```json\n{"items": [{"word": "1. la casa", "meaning": "the house"}, {"word": "el perro"},'
    + ' {"word": "comer", "meaning": "to eat", "sentence": "Vamos a comer.", "sentence_translation": "Let\'s eat."}, {"meaning": "no word"}]}\n```\nAnything else?';
  const r = readScan(text);
  assert.deepEqual(r.cards, [
    { text: "la casa", meaning: "the house", sentence: "", translation: "" },
    { text: "el perro", meaning: "", sentence: "", translation: "" },
    { text: "comer", meaning: "to eat", sentence: "Vamos a comer.", translation: "Let's eat." },
  ]);
  assert.equal(r.total, 3);
  assert.equal(r.cut, false);
});

test("readScan: other shapes the model may answer with", () => {
  const one = (x) => readScan(x).cards.map((c) => [c.text, c.meaning]);
  assert.deepEqual(one({ items: [] }), []);
  assert.deepEqual(one('{"items": []}'), []);
  assert.deepEqual(one([{ word: "kitab", meaning: "book" }]), [["kitab", "book"]], "a bare list");
  assert.deepEqual(one({ words: [{ word: "a" , meaning: "x" }] }), [["a", "x"]]);
  assert.deepEqual(one({ word: "مطبخ", meaning: "kitchen" }), [["مطبخ", "kitchen"]], "a single entry on its own");
  assert.deepEqual(one('["casa", "perro"]'), [["casa", ""], ["perro", ""]], "plain words");
  assert.deepEqual(one([["casa", "house"]]), [["casa", "house"]], "pairs");
  assert.deepEqual(one("كِتَابٌ"), [["كِتَابٌ", ""]], "just one word, vowel marks kept");
  assert.deepEqual(one("I couldn't find any words: the photo is blurry."), [], "a sentence is not a word");
  assert.deepEqual(one(""), []);
  assert.deepEqual(one(null), []);
  // "translation" with no sentence is the word's meaning; with one, the sentence's.
  assert.deepEqual(readScan([{ word: "gato", translation: "cat" }]).cards[0], { text: "gato", meaning: "cat", sentence: "", translation: "" });
  assert.deepEqual(readScan([{ word: "gato", meaning: "cat", sentence: "El gato duerme.", translation: "The cat sleeps." }]).cards[0],
    { text: "gato", meaning: "cat", sentence: "El gato duerme.", translation: "The cat sleeps." });
  // Quotes and ⟦ ⟧ marks round what the model wrote go; accents and marks stay.
  assert.deepEqual(readScan([{ word: "“¿Qué tal?”", meaning: "⟦how are you⟧" }]).cards[0].text, "¿Qué tal?");
  assert.equal(readScan([{ word: "“¿Qué tal?”", meaning: "⟦how are you⟧" }]).cards[0].meaning, "how are you");
  // At most 100 cards.
  const many = readScan({ items: Array.from({ length: 130 }, (_, i) => ({ word: `w${i}` })) });
  assert.equal(many.cards.length, 100);
  assert.equal(many.total, 130);
  assert.equal(many.cut, true);
});

test("askJson sends the photo to each provider the way it takes pictures", async () => {
  const answers = {
    claude: { stop_reason: "end_turn", content: [{ type: "text", text: '{"items": [{"word": "casa"}]}' }] },
    gemini: { candidates: [{ content: { parts: [{ text: '{"items": [{"word": "casa"}]}' }] } }] },
    openai: { choices: [{ message: { content: '{"items": [{"word": "casa"}]}' } }] },
    grok: { choices: [{ message: { content: '{"items": [{"word": "casa"}]}' } }] },
  };
  const images = [{ mime: "image/jpeg", data: "QUJD" }];
  for (const provider of Object.keys(answers)) {
    const calls = [];
    const transport = async (req) => { calls.push(req); return { status: 200, text: JSON.stringify(answers[provider]) }; };
    const out = await askJson({ provider, key: "k", model: "m" }, { ...scanPrompt({ study: "Spanish" }), images, maxTokens: 12000 }, transport);
    assert.deepEqual(readScan(out).cards.map((c) => c.text), ["casa"], provider);
    const body = calls[0].body;
    if (provider === "claude") {
      assert.equal(body.max_tokens, 12000);
      const content = body.messages[0].content;
      assert.deepEqual(content[0], { type: "image", source: { type: "base64", media_type: "image/jpeg", data: "QUJD" } });
      assert.equal(content[1].type, "text");
    } else if (provider === "gemini") {
      const parts = body.contents[0].parts;
      assert.deepEqual(parts[0], { inline_data: { mime_type: "image/jpeg", data: "QUJD" } });
      assert.match(parts[1].text, /Spanish/);
    } else {
      const content = body.messages[1].content;
      assert.equal(content[0].type, "text");
      assert.deepEqual(content[1], { type: "image_url", image_url: { url: "data:image/jpeg;base64,QUJD", detail: "high" } });
    }
  }
  // Without pictures, the question is plain text as before.
  const calls = [];
  await askJson({ provider: "claude", key: "k", model: "m" }, { system: "s", user: "u", schema: SCAN_SCHEMA },
    async (req) => { calls.push(req); return { status: 200, text: JSON.stringify(answers.claude) }; });
  assert.equal(calls[0].body.messages[0].content, "u");
  assert.equal(calls[0].body.max_tokens, 4000);
});

test("askJson: a provider that refuses the picture is retried plainly, then fails with its status", async () => {
  const calls = [];
  const transport = async (req) => { calls.push(req); return { status: 400, text: '{"error": {"message": "Image input is not supported"}}' }; };
  await assert.rejects(askJson({ provider: "grok", key: "k", model: "m" }, { ...scanPrompt(), images: [{ mime: "image/jpeg", data: "QQ==" }] }, transport),
    (err) => err.status === 400);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].body.messages[1].content[1].image_url, { url: "data:image/jpeg;base64,QQ==" }, "the plain retry leaves out detail");
});

// ---------------------------------------------------------------- what Tesseract read

/** Tesseract's answer for lines of words: [[ [text, x0, x1, confidence?], ... ], y0, height]. */
function tess(lines) {
  return {
    blocks: lines.map(([words, y0, h = 30]) => ({
      paragraphs: [{ lines: [{ words: words.map(([text, x0, x1, confidence = 95]) => ({ text, confidence, bbox: { x0, x1, y0, y1: y0 + h } })) }] }],
    })),
  };
}

test("ocrPaste: columns read one at a time become word – meaning lines", () => {
  // Tesseract read the words' column, then the meanings' column, as separate blocks.
  const data = tess([
    [[["Unidad", 120, 300], ["3:", 310, 350], ["En", 360, 420], ["casa", 430, 560]], 60, 50],  // the heading, bigger
    [[["1.", 120, 150], ["la", 160, 200], ["casa", 210, 300]], 170],
    [[["2.", 120, 150], ["el", 160, 190], ["perro", 200, 300]], 240],
    [[["3.", 120, 150], ["el", 160, 190], ["jardín", 200, 320]], 310],
    [[["12", 680, 720]], 820],  // the page number
    [[["the", 720, 780], ["house", 790, 900]], 165],
    [[["the", 720, 780], ["dog", 790, 860]], 236],
    [[["the", 720, 780], ["garden", 790, 920]], 306],
  ]);
  assert.equal(ocrPaste(data), "1. la casa – the house\n2. el perro – the dog\n3. el jardín – the garden");
  assert.deepEqual(parseList(ocrPaste(data), { lang: "es" }).cards.map((c) => [c.text, c.meaning]),
    [["la casa", "the house"], ["el perro", "the dog"], ["el jardín", "the garden"]]);
});

test("ocrPaste: a wide gap inside a line is a column; ordinary spaces are not", () => {
  const data = tess([
    [[["la", 100, 130], ["casa", 140, 220], ["the", 700, 760], ["house", 770, 880]], 100],
    [[["el", 100, 130], ["perro", 140, 240], ["the", 700, 760], ["dog", 770, 840]], 160],
    [[["Vamos", 100, 200], ["a", 210, 225], ["la", 235, 265], ["playa", 275, 370]], 220],
  ]);
  assert.equal(ocrPaste(data), "la casa – the house\nel perro – the dog\nVamos a la playa");
});

test("ocrPaste: Arabic words on the right, their meanings on the left; direction marks dropped", () => {
  const data = tess([
    [[["book", 140, 230], ["‏كتاب‎", 1200, 1280]], 100],
    [[["school", 140, 250], ["‏مدرسة‎", 1190, 1280]], 180],
  ]);
  assert.equal(ocrPaste(data), "book – كتاب\nschool – مدرسة");
  assert.deepEqual(parseList(ocrPaste(data), { lang: "ar" }).cards.map((c) => [c.text, c.meaning]), [["كتاب", "book"], ["مدرسة", "school"]],
    "parseList turns the line round");
  // All Arabic: read right to left.
  const both = tess([[[["مدرسة", 100, 200], ["بيت", 900, 960]], 100]]);
  assert.equal(ocrPaste(both), "بيت – مدرسة");
});

test("ocrPaste: three columns are tabs; two pairs side by side are two cards; whole cards side by side stay apart", () => {
  const three = tess([[[["comer", 100, 200], ["to", 500, 530], ["eat", 540, 600], ["Vamos", 900, 1000], ["a", 1010, 1020], ["comer", 1030, 1130]], 100]]);
  assert.equal(ocrPaste(three), "comer\tto eat\tVamos a comer");
  const pairs = tess([[[["casa", 100, 180], ["house", 300, 400], ["perro", 700, 800], ["dog", 900, 960]], 100]]);
  assert.equal(ocrPaste(pairs), "casa – house\nperro – dog");
  const cards = tess([
    [[["casa", 100, 180], ["-", 190, 200], ["house", 210, 300]], 100],
    [[["perro", 700, 800], ["=", 810, 820], ["dog", 830, 900]], 102],
  ]);
  assert.equal(ocrPaste(cards), "casa - house\nperro = dog");
});

test("ocrPaste: a colon after the word, Chinese and Japanese spaces, no letters, plain text", () => {
  assert.equal(ocrPaste(tess([[[["casa:", 100, 190], ["house", 200, 300]], 100]])), "casa – house");
  assert.equal(ocrPaste(tess([[[["学", 100, 130], ["校", 135, 165], ["school", 600, 700]], 100]])), "学校 – school");
  assert.equal(ocrPaste(tess([[[["ね", 100, 130], ["こ", 135, 165]], 100]])), "ねこ");
  assert.equal(ocrPaste(tess([[[["—", 100, 130], ["42", 140, 170]], 100]])), "");
  assert.equal(ocrPaste({ text: "casa – house\n\n  perro  \n" }), "casa – house\nperro");
  assert.equal(ocrPaste(null), "");
  assert.deepEqual(ocrLines({ text: "a‏" }).map((l) => l.text), ["a"]);
});

test("ocrList: barely readable lines go, unsure ones are marked, shadows aren't words", () => {
  const data = tess([
    [[["casa", 100, 180, 96], ["house", 600, 700, 95]], 100],
    [[["prro", 100, 180, 62], ["dog", 600, 660, 93]], 160],           // a word it wasn't sure of
    [[["%#", 100, 180, 20], ["xx", 600, 660, 30]], 220],               // noise
    [[["[rl", 100, 130, 80], ["ry", 140, 160, 80], ["a", 170, 180, 80], ["0", 190, 200, 80], ["5", 210, 220, 80]], 280],  // a pattern
  ]);
  assert.deepEqual(ocrList(data), [{ text: "casa – house", doubt: false }, { text: "prro – dog", doubt: true }]);
  // Stricter: every word sure (the second look, when the first found nothing).
  assert.deepEqual(ocrList(data, { minConfidence: 70, minWord: 75 }).map((l) => l.text), ["casa – house"]);
});

test("readingScore and worthAnotherLook: when to read the page again another way", () => {
  const ar = [{ text: "كتاب – book", doubt: false }, { text: "قلم – pen", doubt: false }];
  const noArabic = [{ text: "book", doubt: false }, { text: "pen", doubt: false }];
  assert.ok(readingScore(ar, "ar") > readingScore(noArabic, "ar"));
  assert.equal(readingScore([{ text: "ab", doubt: true }], "es"), 1, "an unsure line counts half");
  assert.equal(worthAnotherLook([], "es"), true);
  assert.equal(worthAnotherLook(ar, "ar"), false);
  assert.equal(worthAnotherLook(noArabic, "ar"), true, "the language's own script is missing");
  assert.equal(worthAnotherLook([{ text: "casa" }, { text: "perro" }], "es"), true, "no meanings beside the words");
  assert.equal(worthAnotherLook([{ text: "casa – house", doubt: true }, { text: "perro – dog" }], "es"), true, "hard to read");
  assert.equal(worthAnotherLook([{ text: "casa – house" }, { text: "perro – dog" }], "es"), false);
});

test("markOddOnes: a word not in the language's script, among ones that are, is marked", () => {
  const cards = [{ text: "дом" }, { text: "OKHO" }, { text: "улица" }];
  markOddOnes(cards, "ru");
  assert.deepEqual(cards.map((c) => !!c.doubt), [false, true, false]);
  const latin = [{ text: "casa" }, { text: "perro" }];
  markOddOnes(latin, "es");
  assert.ok(!latin.some((c) => c.doubt), "a language written in Latin letters: nothing to tell");
});

// ---------------------------------------------------------------- back to text

test("itemsToPaste: read back by parseList as the same cards", () => {
  const cards = [
    { text: "la casa", meaning: "the house", sentence: "", translation: "" },
    { text: "comer", meaning: "to eat", sentence: "Vamos a comer.", translation: "Let's eat." },
    { text: "el perro", meaning: "", sentence: "", translation: "" },
    { text: "libro", meaning: "book; volume", sentence: "", translation: "" },
    { text: "bien-estar", meaning: "well – being", sentence: "", translation: "" },
    { text: "كتاب", meaning: "book", sentence: "", translation: "" },
  ];
  const text = itemsToPaste(cards);
  assert.equal(text.split("\n")[0], "la casa – the house");
  assert.equal(text.split("\n")[1], "comer; to eat; Vamos a comer.; Let's eat.");
  assert.deepEqual(parseList(text, { lang: "es" }).cards, cards);
  assert.equal(itemsToPaste([]), "");
});

// ---------------------------------------------------------------- the files to download

test("OCR files: every language, its own and the learner's, the sizes published", () => {
  for (const code of ["ar", "es", "fr", "ja", "zh", "ru", "it", "tl", "pt", "ca", "ceb", "th", "de", "fa", "hi", "ko", "en"]) {
    assert.ok(OCR_LANGS[code] && OCR_LANGS[code].length, code);
  }
  assert.equal(ocrPair("es", "en"), "es+en");
  assert.equal(ocrPair("en", "en"), "en");
  assert.equal(ocrPair("es", "xx"), "es");
  assert.deepEqual(ocrNames("es+en"), ["ocr-core", "ocr-spa", "ocr-eng"]);
  assert.deepEqual(ocrNames("es en", "ocr-plain"), ["ocr-core-plain", "ocr-spa", "ocr-eng"], "a + that came as a space");
  assert.deepEqual(ocrNames("zh+en"), ["ocr-core", "ocr-chi_sim", "ocr-chi_tra", "ocr-eng"]);
  assert.deepEqual(ocrNames("xx"), []);
  assert.equal(tesseractLangs("zh+en"), "chi_sim+chi_tra+eng");
  assert.equal(tesseractLangs("zh+en", { zhScript: "traditional" }), "chi_tra+chi_sim+eng");
  assert.equal(tesseractLangs("ar+en"), "ara+eng");
  const index = JSON.parse(readFileSync(new URL("../../docs/lexicon/index.json", import.meta.url), "utf8"));
  for (const [name, bytes] of Object.entries(OCR_BYTES)) assert.equal(index.files[name] && index.files[name].bytes, bytes, name);
  const all = new Set(Object.values(OCR_LANGS).flat().map((c) => `ocr-${c}`));
  for (const name of all) assert.ok(OCR_BYTES[name], `${name} has a size`);
});

test("ownLanguage: the language meanings are written in, else the app's, else English", () => {
  const names = { en: { name: "English", native: "English" }, es: { name: "Spanish", native: "Español" },
    pt: { name: "Brazilian Portuguese", native: "Português (Brasil)" }, ceb: { name: "Bisaya (Cebuano)", native: "Binisaya" } };
  assert.equal(ownLanguage("Spanish", "en", names), "es");
  assert.equal(ownLanguage("español", "en", names), "es");
  assert.equal(ownLanguage("Portuguese", "en", names), "pt");
  assert.equal(ownLanguage("Cebuano", "en", names), "ceb");
  assert.equal(ownLanguage("Klingon", "es", names), "es");
  assert.equal(ownLanguage("", "xx", names), "en");
});
