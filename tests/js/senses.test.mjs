// Add words → "Which meaning?" (prototype sense_choice: web/js/senses.js, components/sensechoice.js, wordbuilder.js).
// The owner, 2026-11-19: "If a student is inputting a word with multiple definitions, ask them what definition they'd
// like to use."
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import zlib from "node:zlib";

const se = await import("../../web/js/senses.js");
const aw = await import("../../web/js/addwords.js");
const { PROTOTYPES } = await import("../../web/js/prototype.js");
const md = await import("../../web/js/lexicon/meaningdata.js");
const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const dict = (lang) => [JSON.parse(zlib.gunzipSync(readFileSync(new URL(`../../docs/lexicon/${lang}-meanings.json.gz`, import.meta.url))).toString("utf8"))];

/** A word's senses as Add words finds them in the built-in dictionary (the whole answer, everyday meaning first). */
function sensesOf(word, lang) {
  const files = dict(lang);
  const found = md.lookUp(files, md.wordKeys(word, lang, null), word, lang, {});
  const a = md.answerFrom(md.commonestFirst(found, files, lang, word), word, lang, {});
  return se.distinctSenses(se.dictionarySenses(a.meaning, a.pos, a.other_meanings));
}

test("only senses that really differ: near-synonyms of one sense, grammar notes, letters and names are no choice", () => {
  assert.deepEqual(se.distinctSenses(["school, academy", "school", "teacher"]).map((s) => s.text), ["school, academy", "teacher"]);
  assert.deepEqual(se.distinctSenses(["time", "a while, period of time", "tense", "weather"]).map((s) => s.text), ["time", "tense", "weather"]);
  assert.deepEqual(se.distinctSenses(["The name of the Latin script letter D/d.", "of", "from"]).map((s) => s.text), ["of", "from"]);
  assert.deepEqual(se.distinctSenses(["the letter B", "bee"]).map((s) => s.text), ["bee"], "a letter of the alphabet");
  // (carta: "letter (document)" is a meaning, kept)
  assert.deepEqual(se.distinctSenses(["menu", "letter (document)", "map", "menu (list of dishes in a restaurant)", "playing card"]).map((s) => s.text),
    ["menu", "letter", "map", "playing card"]);
  assert.deepEqual(se.distinctSenses(["forms the perfect aspect", "to have"]).map((s) => s.text), ["to have"]);
  assert.deepEqual(se.distinctSenses([{ text: "rich", pos: "adj" }, { text: "a diminutive of Ricardo", pos: "name" }]).map((s) => s.text), ["rich"]);
  assert.equal(se.distinctSenses(["a", "b", "c", "d", "e", "f"]).length, 4, "four at most: more is a dictionary, not a choice");
  assert.equal(se.distinctSenses(["dog"]).length, 1, "one sense: nothing to ask");
});

test("real words from the built-in dictionary", () => {
  assert.deepEqual(sensesOf("tiempo", "es").map((s) => s.text), ["time", "tense", "weather"]);
  const banco = sensesOf("banco", "es").map((s) => s.text);
  assert.equal(banco[0], "bank", "the everyday meaning first");
  assert.ok(banco.includes("bench"));
  assert.deepEqual(sensesOf("glace", "fr").slice(0, 3).map((s) => s.text), ["ice", "glass", "mirror"]);
  assert.ok(se.showPos(sensesOf("glace", "fr")), "ice (noun), to freeze (verb): parts of speech shown");
  assert.ok(!se.showPos(sensesOf("tiempo", "es")), "all nouns: no part of speech to show");
});

test("what the card's meaning becomes for each choice", () => {
  const s = [{ text: "bank", pos: "noun" }, { text: "bench", pos: "noun" }];
  assert.equal(se.meaningFor(s, "0"), "bank");
  assert.equal(se.meaningFor(s, "1"), "bench");
  assert.equal(se.meaningFor(s, "all"), "bank; bench");
  assert.equal(se.meaningFor(s, "own", "  a seat  "), "a seat");
  assert.equal(se.meaningFor(s, "own", ""), "");
  const eye = se.distinctSenses(["eye (organ)", "spy"]);
  assert.equal(eye[0].text, "eye", "shortened to choose by");
  // (the card keeps the short meaning; the fuller wording, its notes in brackets, is for the card's notes: the owner,
  // 2026-11-21, perro saved as "dog (the species Canis familiaris …)")
  assert.equal(se.meaningFor(eye, "0"), "eye");
  assert.equal(se.glossFor(eye, "0"), "eye (organ)");
  assert.equal(se.glossFor(eye, "1"), "", "nothing left out: no notes");
  assert.equal(se.plainMeaning("dog (the species Canis familiaris (sometimes designated Canis lupus familiaris)), domesticated for thousands of years"),
    "dog, domesticated for thousands of years", "never cut short, only its notes in brackets out");
  assert.equal(se.shortSense("dog (the species Canis familiaris)"), "dog");
  assert.equal(se.dictionarySenses("to give", "verb", ["gift (noun)", "to grant"]).map((x) => x.pos).join(), "verb,noun,verb");
});

test("with an AI: its other meanings are asked for in the same request, only in prototype mode", () => {
  const items = [{ word: "banco", want: { meaning: true, sentence: true, translation: true } }];
  const plain = aw.batchPrompt(items, { study: "Spanish" });
  assert.equal(plain.schema, aw.BATCH_SCHEMA);
  assert.doesNotMatch(plain.system, /"senses"/, "as before without the prototype");
  const asked = aw.batchPrompt(items, { study: "Spanish", senses: true });
  assert.equal(asked.schema, aw.SENSES_SCHEMA);
  assert.match(asked.system, /"senses": when a word you give a meaning for has two or more clearly different everyday meanings/);
  assert.ok(aw.SENSES_SCHEMA.properties.cards.items.required.includes("senses"));
  assert.ok(!aw.BATCH_SCHEMA.properties.cards.items.required.includes("senses"), "the usual schema is unchanged");
  const [got] = aw.readBatch({ cards: [{ word: "banco", meaning: "bank", sentence: "x", translation: "y", senses: ["bank", "bench (noun)"] }] }, items);
  assert.deepEqual(got.senses, ["bank", "bench (noun)"]);
  assert.deepEqual(se.aiSenses(["bank", "bank, financial institution", "bench", "to support (verb)"]).map(({ text, pos }) => ({ text, pos })),
    [{ text: "bank", pos: "" }, { text: "bench", pos: "" }, { text: "to support", pos: "verb" }]);
});

test("Add words asks, on one screen, before the cards are saved; nothing changes without prototype mode", () => {
  assert.equal(PROTOTYPES.sense_choice.released, true); // (released in v0.64.0, the owner, 2026-11-19)
  const b = read("web/js/components/wordbuilder.js");
  assert.match(b, /const senses = feature\("sense_choice"\) && !phrase;/, "the whole dictionary answer only in prototype mode");
  assert.match(b, /senses: feature\("sense_choice"\) \}\)\), items\);/, "the AI is asked for senses only in prototype mode");
  const ask = b.indexOf('if (feature("sense_choice") && !(await askMeanings(list)))'), save = b.indexOf("// 2. The cards themselves, all in one go.");
  assert.ok(ask > 0 && ask < save, "asked before the cards are saved (askMeanings: also right after Fill in, prototype list_kinds)");
  assert.match(b, /await chooseSenses\(asking\.map\(\(r\) => \(\{ word: r\.text\.trim\(\), senses: r\.senses \}\)\), \{ lang \}\)/, "one screen for all the words");
  assert.match(b, /r\.meaning\.auto && Array\.isArray\(r\.senses\) && r\.senses\.length > 1 && !r\.senseChosen/, "only filled-in meanings with several senses");
  assert.match(b, /row\.senses = null; \}/, "a meaning the learner typed asks nothing");
  assert.match(b, /for \(const f of \["sentence", "translation", "memo"\]\) if \(r\[f\]\.auto\) r\[f\] = filled\(""\);/, "the sentence is made again for the chosen meaning");
  const ui = read("web/js/components/sensechoice.js");
  assert.match(ui, /const choice = items\.map\(\(\) => "0"\);/, "the everyday meaning chosen to start with");
  assert.match(ui, /data-v="all"/);
  assert.match(ui, /data-v="own"/);
  const build = read("mobile/scripts/build-www.mjs");
  assert.match(build, /"js\/senses\.js"/);
  assert.match(build, /"js\/components\/sensechoice\.js"/);
});

test("near-synonyms are one sense, when English Wiktionary's synonyms say so both ways (tools/add_same_senses.py)", () => {
  // ("magic" and "enchantment" list each other: one sense; nothing lists "time" and "tense" both ways: two)
  assert.deepEqual(se.distinctSenses(["enchantment, charm", "witchcraft, magic", "dawn"], { alike: ["enchantment|magic"] }).map((s) => s.text),
    ["enchantment, charm", "dawn"]);
  assert.deepEqual(se.distinctSenses(["time", "tense", "weather"], { alike: [] }).map((s) => s.text), ["time", "tense", "weather"]);
  assert.equal(se.distinctSenses(["tip", "gratuity"], { alike: ["gratuity|tip"] }).length, 1, "nothing to ask");
  assert.equal(se.distinctSenses(["tip", "gratuity"]).length, 2, "no evidence: as before");
  // from the meanings files: سحر is asked about less; زنجفر (cinnabar, vermilion: no such evidence), tiempo and banco as before
  const alikeOf = (word, lang) => {
    const files = dict(lang);
    const found = md.lookUp(files, md.wordKeys(word, lang, null), word, lang, {});
    const a = md.answerFrom(md.translatedForms(md.commonestFirst(found, files, lang, word), files, lang), word, lang, {});
    return { a, alike: md.alikeIn(files, [a.meaning, ...a.other_meanings]) };
  };
  const sihr = alikeOf("سحر", "ar");
  assert.ok(sihr.alike.includes("enchantment|magic"));
  const asked = se.distinctSenses(se.dictionarySenses(sihr.a.meaning, sihr.a.pos, sihr.a.other_meanings), { alike: sihr.alike }).map((s) => s.text);
  assert.ok(!asked.some((t) => /magic/.test(t)), "magic is the enchantment sense said again");
  assert.deepEqual(alikeOf("زنجفر", "ar").alike, []);
  assert.deepEqual(alikeOf("tiempo", "es").alike, []);
  assert.deepEqual(alikeOf("banco", "es").alike, []);
  for (const lang of ["ar", "es", "fr", "de", "ru", "zh", "ja", "ko", "pt", "it", "ca", "fa", "hi", "th", "tl", "ceb", "la"]) {
    const same = dict(lang)[0].same;
    assert.ok(Array.isArray(same) && same.length > 50 && same.every((p) => /^[^|]+\|[^|]+$/.test(p) && p.split("|")[0] < p.split("|")[1]),
      `${lang}-meanings has its "same" list (run tools/add_same_senses.py after build_meanings.py)`);
  }
  const b = read("web/js/components/wordbuilder.js");
  assert.match(b, /distinctSenses\(dictionarySenses\(d\.meaning, d\.pos, d\.other_meanings\), \{ alike: d\.alike \}\)/);
  assert.match(read("web/js/meanings.js"), /if \(!quick\) answer\.alike = alikeIn\(files, \[answer\.meaning, \.\.\.answer\.other_meanings\]\);/);
});

test("saving a word asks which meaning (dict_sense_pick), AI or not: one word whose meanings really differ", () => {
  assert.equal(typeof PROTOTYPES.dict_sense_pick.released, "boolean", "released for everybody in v0.67.0");
  const def = { provider: "dictionary", meaning: "time", pos: "noun", other_meanings: ["tense", "weather"], alike: [] };
  assert.equal(se.asksForSense(def, { word: "tiempo" }), true);
  // (with an AI set up too, as Add words asks: the owner, 2026-11-21; an AI's answer is chosen to start with)
  assert.equal(se.asksForSense({ ...def, provider: "anthropic" }, { word: "tiempo" }), true);
  assert.equal(se.asksForSense(def, { phrase: true, word: "a tiempo" }), false, "a phrase: as today");
  assert.equal(se.asksForSense(null, { word: "x" }), false);
  assert.deepEqual(se.answerSenses(def).map((s) => s.text), ["time", "tense", "weather"]);
  assert.equal(se.answerSenses({ ...def, other_meanings: [] }).length, 1, "one meaning: nothing to ask");
  assert.equal(se.answerSenses({ ...def, other_meanings: ["magic"], meaning: "enchantment", alike: ["enchantment|magic"] }).length, 1);
  const pick = read("web/js/components/dictpick.js");
  assert.match(pick, /if \(!feature\("dict_sense_pick"\)\) return \[\];/);
  assert.doesNotMatch(pick, /noAi\(\)/, "asked with an AI set up too");
  assert.match(pick, /dictionaryDefine\(\{ \.\.\.ctx, word: def\.spelled \|\| ctx\.word \}, \{ quick: false \}\)/, "the quick answer's other meanings looked up");
  assert.match(pick, /dictionarySenses\(def\.meaning, def\.pos, \[\.\.\.\(def\.other_meanings \|\| \[\]\), \.\.\.more\]\)/, "an AI's meaning first, then the dictionary's");
  assert.match(pick, /if \(!chosen\) return null;/, "closing the box saves nothing");
  for (const file of ["web/js/define-service.js", "mobile/src/js/define-service.js"]) {
    const src = read(file);
    assert.match(src, /export function definerConfig\(\)/, file);
    assert.match(src, /export const noAi = /, file);
  }
  const bubble = read("web/js/components/wordbubble.js");
  // The word popup: no "Which meaning?" on Save any more; the meaning bubbles beside the definition choose, and Save
  // keeps the chosen one (the owner, 2026-11-21).
  assert.doesNotMatch(bubble, /pickDictionaryMeaning/, "the word popup's Save asks nothing");
  assert.match(bubble, /meaningSenses\(forDef, forCtx\)/, "the bubbles: the same sense list");
  assert.match(bubble, /const picked = withSense\(def, list \? list\[senses\.at\] \|\| list\[0\] : null\);[\s\S]{0,300}?await actions\.onSave\([^;]*picked/,
    "the word popup's Save (transcripts, reels, books, web pages, course words, Conversation) keeps the chosen bubble's meaning");
  assert.match(bubble, /data-act="sense"/);
  const voice = read("web/js/components/voiceask.js");
  assert.match(voice, /const picked = await pickDictionaryMeaning\(it\.pick\.def, it\.pick\.ctx\);/, "Ask by voice's add it");
  assert.match(read("mobile/scripts/build-www.mjs"), /"js\/components\/dictpick\.js"/);
});

test("the word popup's meaning bubbles: Save keeps the chosen one, short, its fuller wording in the notes", async () => {
  const { vocabFromDefinition } = await import("../../web/js/languages.js");
  const card = vocabFromDefinition({ provider: "dictionary", meaning: "dog", save_gloss: "dog (the species Canis familiaris)" }, "perro", "es");
  assert.equal(card.meaning, "dog");
  assert.match(card.notes, /dog \(the species Canis familiaris\)/);
  assert.equal(vocabFromDefinition({ provider: "dictionary", meaning: "dog" }, "perro", "es").notes, "", "nothing left out: no notes");
  const pick = read("web/js/components/dictpick.js");
  assert.match(pick, /export function withSense\(def, s\)/);
  assert.match(pick, /const meaning = plainMeaning\(list\[0\]\.full \|\| list\[0\]\.text\), gloss = glossFor\(list, 0\);/);
  const css = read("web/css/app.css");
  assert.match(css, /\.word-bubble\.sheet \.wb-senses \{ flex-basis: 100%; justify-content: flex-start; \}/, "under the definition on a phone");
  // Add words: choosing the first sense, only shorter, makes nothing again; its fuller wording goes in the notes
  const builder = read("web/js/components/wordbuilder.js");
  assert.match(builder, /if \(meaning === plainMeaning\(r\.meaning\.value\)\) \{ r\.meaning = typed\(meaning\); paintRow\(r\); return; \}/);
  assert.match(builder, /picked\.glosses && picked\.glosses\[i\]/);
});
