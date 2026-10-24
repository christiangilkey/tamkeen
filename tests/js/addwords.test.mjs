// "Add words" (web/js/addwords.js): reading a pasted list, typing always winning over what the app
// fills in, finding words already saved or typed twice, the AI's batches and reading its answers.
// The screen is components/wordbuilder.js; the servers' side is tests/test_add_words.py.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AI_CHUNK, BATCH_SCHEMA, CHOICES, DEFAULT_CHOICES, MAX_ROWS, addable, batchPrompt, cardOf, chunks, cleanChoices, duplicates, edited,
  fillIn, filled, hasValue, isOwn, jsonIn, needs, needsAny, parseList, pool, readBatch, splitLine, typed, wordKey,
} from "../../web/js/addwords.js";
import { normalize } from "../../mobile/src/js/shared-logic.js";

// ----- a pasted list -----

test("each separator gives word, meaning, sentence and translation", () => {
  assert.deepEqual(splitLine("casa"), ["casa", "", "", ""]);
  assert.deepEqual(splitLine("casa – house"), ["casa", "house", "", ""], "an en dash");
  assert.deepEqual(splitLine("casa — house"), ["casa", "house", "", ""], "an em dash");
  assert.deepEqual(splitLine("casa–house"), ["casa", "house", "", ""], "a dash without spaces");
  assert.deepEqual(splitLine("casa - house"), ["casa", "house", "", ""], "a hyphen with spaces round it");
  assert.deepEqual(splitLine("well-known"), ["well-known", "", "", ""], "a hyphen inside a word is no separator");
  assert.deepEqual(splitLine("mesa = table"), ["mesa", "table", "", ""]);
  assert.deepEqual(splitLine("mesa=table"), ["mesa", "table", "", ""]);
  assert.deepEqual(splitLine("libro; book; Leo un libro.; I'm reading a book."), ["libro", "book", "Leo un libro.", "I'm reading a book."]);
  assert.deepEqual(splitLine("libro\tbook\tLeo un libro.\tI'm reading a book."), ["libro", "book", "Leo un libro.", "I'm reading a book."], "a spreadsheet row");
  assert.deepEqual(splitLine("libro\t\tLeo un libro."), ["libro", "", "Leo un libro.", ""], "an empty column stays empty");
  assert.deepEqual(splitLine("palabra – book; volume"), ["palabra", "book; volume", "", ""], "after a dash the rest is the meaning");
  assert.deepEqual(splitLine("palabra; a = b"), ["palabra", "a = b", "", ""], "the first separator decides");
});

test("list marks, quotes from a spreadsheet and line ends are tidied", () => {
  assert.deepEqual(splitLine("1. casa – house"), ["casa", "house", "", ""]);
  assert.deepEqual(splitLine("12) casa"), ["casa", "", "", ""]);
  assert.deepEqual(splitLine("• casa = house"), ["casa", "house", "", ""]);
  assert.deepEqual(splitLine("- casa"), ["casa", "", "", ""]);
  assert.deepEqual(splitLine("casa – house\r"), ["casa", "house", "", ""]);
  assert.deepEqual(splitLine("\"a, b\"\t\"say \"\"hi\"\"\""), ["a, b", "say \"hi\"", "", ""], "a spreadsheet's quotes");
  assert.deepEqual(splitLine("   "), ["", "", "", ""]);
});

test("right-to-left words: Arabic and Persian, and the Arabic semicolon", () => {
  assert.deepEqual(splitLine("كتاب – book"), ["كتاب", "book", "", ""]);
  assert.deepEqual(splitLine("كِتَابٌ = book"), ["كِتَابٌ", "book", "", ""], "vowel marks are kept as typed");
  assert.deepEqual(splitLine("كتاب؛ book؛ قرأت كتابا جديدا."), ["كتاب", "book", "قرأت كتابا جديدا.", ""]);
  assert.deepEqual(splitLine("كتاب\tbook\tقرأت كتابا.\tI read a book."), ["كتاب", "book", "قرأت كتابا.", "I read a book."]);
  assert.deepEqual(splitLine("کتاب – book"), ["کتاب", "book", "", ""], "Persian");
});

test("a list: blank lines skipped, a line written the other way round turned round, at most 100", () => {
  const ar = parseList("كتاب – book\n\nbook – مدرسة\nقلم\n", { lang: "ar" });
  assert.deepEqual(ar.cards.map((c) => [c.text, c.meaning]), [["كتاب", "book"], ["مدرسة", "book"], ["قلم", ""]]);
  assert.equal(ar.total, 3);
  assert.equal(ar.cut, false);
  const es = parseList("house – casa", { lang: "es" });
  assert.equal(es.cards[0].text, "house", "the same letters: nothing to tell which is which, so left as typed");
  const ru = parseList("book – книга", { lang: "ru" });
  assert.equal(ru.cards[0].text, "книга");
  const many = parseList(Array.from({ length: 105 }, (_, i) => `palabra${i} – word ${i}`).join("\n"), { lang: "es" });
  assert.equal(many.cards.length, MAX_ROWS);
  assert.equal(many.total, 105);
  assert.equal(many.cut, true);
  const sheet = parseList("libro\tbook\r\nmesa\ttable\r\n", { lang: "es" });
  assert.deepEqual(sheet.cards.map((c) => c.meaning), ["book", "table"], "rows pasted from a spreadsheet (Windows line ends)");
  const onlyMeaning = parseList(" – house", { lang: "es" });
  assert.equal(onlyMeaning.cards[0].text, "house", "a line with nothing before its dash still gives a word");
});

// ----- typing always wins -----

test("the app fills only empty fields or its own; what was typed is never replaced", () => {
  assert.deepEqual(fillIn(typed(""), "book"), filled("book"), "empty: filled in");
  assert.deepEqual(fillIn(filled("book"), "volume"), filled("volume"), "the app's own: replaced");
  assert.deepEqual(fillIn(typed("tome"), "book"), typed("tome"), "typed: kept");
  assert.deepEqual(fillIn(filled("book"), ""), filled("book"), "nothing new: what is there stays");
  assert.deepEqual(fillIn(typed("  "), "book"), filled("book"), "only spaces typed counts as empty");
  const mine = edited("my own");
  assert.equal(isOwn(mine), true);
  assert.equal(isOwn(filled("x")), false);
  assert.equal(isOwn(edited("")), false, "an emptied field can be filled again");
  assert.equal(hasValue(filled(" x ")), true);
});

test("what still needs filling in follows the choices", () => {
  const blank = { meaning: typed(""), sentence: typed(""), translation: typed("") };
  assert.deepEqual(needs(blank, DEFAULT_CHOICES), { meaning: true, sentence: true, translation: true });
  assert.deepEqual(needs(blank, { ...DEFAULT_CHOICES, meaning: "type", sentence: "none" }), { meaning: false, sentence: false, translation: false });
  assert.deepEqual(needs({ ...blank, sentence: typed("Leo un libro.") }, DEFAULT_CHOICES), { meaning: true, sentence: false, translation: true },
    "a sentence of the learner's own is translated for them");
  assert.deepEqual(needs({ ...blank, sentence: typed("Leo."), translation: typed("I read.") }, { ...DEFAULT_CHOICES, meaning: "type" }),
    { meaning: false, sentence: false, translation: false });
  assert.deepEqual(needs(blank, { ...DEFAULT_CHOICES, sentence: "type" }), { meaning: true, sentence: false, translation: false });
  assert.equal(needsAny({ meaning: filled("book"), sentence: filled("x"), translation: filled("y") }, DEFAULT_CHOICES), false);
});

test("choices kept on the device are made safe", () => {
  assert.deepEqual(cleanChoices(null), DEFAULT_CHOICES);
  assert.deepEqual(cleanChoices({ meaning: "type", sentence: "none", audio: "own", folder: "d123" }), { meaning: "type", sentence: "none", audio: "own", folder: "d123" });
  assert.deepEqual(cleanChoices({ meaning: "nonsense", audio: 3 }), DEFAULT_CHOICES);
  for (const [key, list] of Object.entries(CHOICES)) assert.ok(list.includes(DEFAULT_CHOICES[key]), key);
});

// ----- repeats -----

test("words compare as the Vocab page's search does: vowel marks, alef forms, case, spaces", () => {
  assert.equal(wordKey("كِتَابٌ"), wordKey("كتاب"));
  assert.equal(wordKey("أكل"), wordKey("اكل"));
  assert.equal(wordKey("مدرسة"), wordKey("مدرسه"));
  assert.equal(wordKey("  Casa  "), wordKey("casa"));
  assert.equal(wordKey("¿casa?"), "casa", "punctuation round it");
  assert.equal(wordKey("кни́га"), wordKey("книга"), "a Russian stress mark");
  assert.equal(wordKey("ёлка"), wordKey("елка"));
  assert.notEqual(wordKey("más"), wordKey("mas"), "an accent that makes another word stays");
  assert.equal(wordKey("café"), wordKey("café"), "an accent typed as a separate mark is the same letter");
  assert.notEqual(wordKey("café"), wordKey("cafe"));
  assert.equal(wordKey("می‌خواهم"), wordKey("میخواهم"), "Persian half space");
  // The same as the app's own comparison (app/arabic.py normalize = the phone's shared-logic.js normalize).
  for (const w of ["كِتَابٌ", "أَكَلَ", "مُرْتَبِكَة", "Casa", "हूँ", "می‌خواهم"]) assert.equal(wordKey(w), normalize(w), w);
});

test("already saved, and the same word twice in one batch", () => {
  const dups = duplicates(["كتاب", "قلم", "كِتَابٌ", "", "Casa", "casa", "قلم"], ["كتاب", "mesa"]);
  assert.deepEqual(dups, [{ saved: true }, {}, { saved: true }, {}, {}, { sameAs: 4 }, { sameAs: 1 }]);
  const rows = ["كتاب", "قلم", "كِتَابٌ", "", "Casa", "casa", "قلم"].map((text) => ({ text }));
  assert.deepEqual(addable(rows, dups).map((r) => r.text), ["قلم", "Casa"], "repeats and empty rows are left out");
  rows[0].anyway = true;
  rows[5].anyway = true;
  assert.deepEqual(addable(rows, dups).map((r) => r.text), ["كتاب", "قلم", "Casa", "casa"], "unless Add anyway is ticked");
});

// ----- the AI: batches and answers -----

test("words go to the AI in batches of at most AI_CHUNK", () => {
  const words = Array.from({ length: 45 }, (_, i) => i);
  assert.equal(AI_CHUNK, 20);
  assert.deepEqual(chunks(words).map((c) => c.length), [20, 20, 5]);
  assert.deepEqual(chunks(words, 25).map((c) => c.length), [25, 20]);
  assert.deepEqual(chunks([], 20), []);
  assert.deepEqual(chunks([1, 2], 0), [[1], [2]]);
});

test("the question names every word, what to fill in and what the card already has", () => {
  const items = [
    { word: "libro", meaning: "", sentence: "", want: { meaning: true, sentence: true, translation: true } },
    { word: "mesa", meaning: "table", sentence: "", want: { meaning: false, sentence: true, translation: true } },
    { word: "silla", meaning: "chair", sentence: "Me siento en la silla.", want: { meaning: false, sentence: false, translation: true } },
  ];
  const q = batchPrompt(items, { study: "Spanish", speaks: "English" });
  assert.match(q.system, /Spanish/);
  assert.match(q.system, /beginner to intermediate/);
  // Sentences as natives use the word (the owner: "natural, makes sense, … as close to how a native speaker
  // would use it as possible"), checked by the model before it answers.
  assert.match(q.system, /native speakers really use it/);
  assert.match(q.system, /make complete sense on its own/);
  assert.match(q.system, /never translated word for word from English/);
  assert.match(q.system, /register and variety/);
  assert.match(q.system, /would a native speaker say it just like this/);
  assert.match(q.system, /JSON only/);
  assert.match(q.system, /⟦ ⟧/);
  const lines = q.user.split("\n");
  assert.equal(lines.length, 3);
  assert.equal(lines[0], "1. word: libro | fill in: meaning, sentence, translation");
  assert.equal(lines[1], "2. word: mesa | fill in: sentence, translation | meaning: table");
  assert.equal(lines[2], "3. word: silla | fill in: translation | meaning: chair | sentence: Me siento en la silla.");
  // A strict schema (OpenAI's strict mode): every property required, nothing else allowed, at each level.
  const card = BATCH_SCHEMA.properties.cards.items;
  assert.equal(BATCH_SCHEMA.additionalProperties, false);
  assert.equal(card.additionalProperties, false);
  assert.deepEqual([...card.required].sort(), Object.keys(card.properties).sort());
  assert.deepEqual(q.schema, BATCH_SCHEMA);
});

test("the JSON is found whatever comes round it", () => {
  assert.deepEqual(jsonIn('{"cards": []}'), { cards: [] });
  assert.deepEqual(jsonIn('Here you are:\n```json\n{"cards": [{"word": "a"}]}\n```\nHope it helps!'), { cards: [{ word: "a" }] });
  assert.deepEqual(jsonIn('Sure! {"cards": [{"word": "a"}]} Anything else?'), { cards: [{ word: "a" }] });
  assert.deepEqual(jsonIn('[{"word": "a"}]'), [{ word: "a" }]);
  assert.equal(jsonIn("no json here"), null);
  assert.equal(jsonIn('{"cards": [ broken'), null);
});

test("the answer is matched to the words, by word first, then by place", () => {
  const items = ["كتاب", "قلم", "مدرسة"].map((word) => ({ word, want: { meaning: true, sentence: true, translation: true } }));
  const answer = `Here are the cards:
{"cards": [
  {"word": "قَلَمٌ", "meaning": "pen", "sentence": "عندي قلم.", "translation": "I have a ⟦pen⟧."},
  {"word": "كتاب", "meaning": "\\"book\\"", "sentence": "هذا كتاب.", "translation": "This is a ⟦book."},
  {"word": "", "meaning": "school", "sentence": "", "translation": ""}
]}`;
  const got = readBatch(answer, items);
  assert.deepEqual(got[0], { meaning: "book", sentence: "هذا كتاب.", translation: "This is a book." }, "unpaired marks are taken off; quotes round it too");
  assert.deepEqual(got[1], { meaning: "pen", sentence: "عندي قلم.", translation: "I have a ⟦pen⟧." }, "found by its word, vowel marks and all");
  assert.deepEqual(got[2], { meaning: "school", sentence: "", translation: "" }, "an entry with no word takes its place in the order");
  assert.deepEqual(readBatch({ cards: [{ word: "x", meaning: "y" }] }, [{ word: "z", want: { meaning: true } }]), [{ meaning: "y", sentence: "", translation: "" }],
    "the only entry, for a word written differently, fills the only word");
  assert.deepEqual(readBatch({ cards: [{ word: "قلم", meaning: "pen" }] }, items), [null, { meaning: "pen", sentence: "", translation: "" }, null],
    "a word the answer has nothing for is null");
  assert.deepEqual(readBatch("nonsense", items), [null, null, null]);
  assert.deepEqual(readBatch([{ word: "كتاب", meaning: "book", sentence: "s", translation: "t" }], [{ word: "كتاب", want: { meaning: false, sentence: false, translation: true } }]),
    [{ meaning: "", sentence: "", translation: "t" }], "only what was asked for is used (a list on its own is read too)");
});

// ----- what is saved -----

test("a row becomes the card the server saves", () => {
  const row = { text: " libro ", meaning: filled("book"), sentence: typed("Leo un libro."), translation: filled("I'm reading a ⟦book⟧."), notes: "m." };
  assert.deepEqual(cardOf(row, { choices: DEFAULT_CHOICES, folder: "d1" }),
    { text: "libro", meaning: "book", sentence: "Leo un libro.", translation: "I'm reading a ⟦book⟧.", notes: "m.", folders: ["d1"] });
  assert.deepEqual(cardOf(row, { choices: { ...DEFAULT_CHOICES, sentence: "none" } }),
    { text: "libro", meaning: "book", sentence: "", translation: "", notes: "m.", folders: [] }, "No sentence: none is saved");
});

test("work runs a few at a time, and one failing doesn't stop the rest", async () => {
  let running = 0, most = 0;
  const out = await pool([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
    running++;
    most = Math.max(most, running);
    await new Promise((r) => setTimeout(r, 5));
    running--;
    if (n === 4) throw new Error("four");
    return n * 10;
  });
  assert.equal(most, 3);
  assert.deepEqual(out.map((x) => x.value ?? x.error.message), [10, 20, 30, "four", 50, 60, 70]);
  assert.deepEqual(await pool([], 3, async () => 1), []);
});
