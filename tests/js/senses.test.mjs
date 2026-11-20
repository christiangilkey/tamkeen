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
  assert.equal(se.meaningFor(eye, "0"), "eye (organ)", "the card keeps the whole wording: choosing the first changes nothing");
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
  const ask = b.indexOf('if (feature("sense_choice")) {'), save = b.indexOf("// 2. The cards themselves, all in one go.");
  assert.ok(ask > 0 && ask < save, "asked before the cards are saved");
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
