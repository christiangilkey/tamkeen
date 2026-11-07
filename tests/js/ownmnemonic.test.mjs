// "Learn from my own mnemonics" (review/ownmnemonic.js): the free Mnemonic maker learns from the mnemonics the
// learner types in Memorization notes, from the words in CAPITALS only, when they really sound like the word;
// kept in the synced setting mnemonic_prefs (freemnemonic.js readPrefs / writePrefs), offered again for other
// words ("You've used this before") and shown to the learner's AI as examples of their style.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { pronunciationOf } from "../../web/js/review/soundout.js";
import { EXAMPLES_MAX, KeywordList, NOTE_MAX, OWN_MAX, PREFS_MAX, PREF_LIMIT, PREF_STEP, learn, makeFreeMnemonics, readPrefs, writePrefs }
  from "../../web/js/review/freemnemonic.js";
import { OWN_STEP, capitalKeywords, judgeOwn, learnOwn, learnsOwn, newCapitals, ownExamples, shortNote } from "../../web/js/review/ownmnemonic.js";
import { mnemonicPrompt } from "../../web/js/review/mnemonic.js";
import { ExamplePack } from "../../web/js/lexicon/exampledata.js";

const root = new URL("../../", import.meta.url);
const source = (rel) => readFileSync(new URL(rel, root), "utf8");
const read = (name) => JSON.parse(gunzipSync(readFileSync(new URL(`docs/lexicon/${name}`, root))));
const list = new KeywordList(read("en-keywords.json.gz"));
const es = new ExamplePack(read("es-examples.json.gz"), "es");
const said = (word) => pronunciationOf({ word, lang: "es", ipa: es.ipaOf(word) });
const keys = (text) => capitalKeywords(text).map((k) => k.shown);

// ----- finding the keyword -----

test("only words in CAPITALS are keywords; words one after another make one", () => {
  assert.deepEqual(keys("pot — Picture a duck sitting on a POT"), ["POT"], "the rest of the note is ignored");
  assert.deepEqual(keys("Picture a PIE on your TOE, or a PIE TOE"), ["PIE", "TOE", "PIE TOE"]);
  assert.deepEqual(keys("A PIE-TOE dance"), ["PIE TOE"], "a hyphen joins them too");
  assert.deepEqual(keys("I saw A POT. I think A cat"), ["POT"], "I and A don't count");
  assert.deepEqual(keys("SAW A POT"), ["SAW", "POT"], "and they break a run");
  assert.deepEqual(keys("PIE\nTOE"), ["PIE", "TOE"], "a new line breaks it");
  assert.deepEqual(keys("ÉCOLE, КОТ and ÇA VA"), ["ÉCOLE", "КОТ", "ÇA VA"], "accented and Cyrillic capitals count");
  assert.deepEqual(keys("McDONALD, iPHONE, Pato, pOT"), [], "not part of a word written otherwise");
  assert.deepEqual(keys("two POTs and DON'T"), ["POT", "DON'T"], "a small plural s is dropped; an apostrophe inside is kept");
  assert.deepEqual(keys("POT and POT again"), ["POT"], "each once");
  assert.deepEqual(keys("PICTURE THE BIG RED HAT"), ["PICTURE", "THE", "BIG", "RED", "HAT"], "a whole sentence in capitals goes word by word");
  assert.deepEqual(capitalKeywords("PIE TOE")[0], { key: "pie toe", shown: "PIE TOE" });
  assert.deepEqual(keys("كلب يعني KELP"), ["KELP"]);
  assert.deepEqual(keys(""), []);
  assert.deepEqual(keys(null), []);
});

test("only capitals that are new count, never the maker's own keyword, the word itself or its meaning", () => {
  const fresh = (before, after, opts) => newCapitals(before, after, opts).map((k) => k.shown);
  assert.deepEqual(fresh("Picture a POT", "Picture a POT. Also a PATIO", {}), ["PATIO"], "editing other parts doesn't learn again");
  assert.deepEqual(fresh("a POT", "a pot, I mean a big pot", {}), [], "nothing new");
  assert.deepEqual(fresh("", "pie + toe — “PIE TOE”: a PIE balanced on your TOE", { skip: ["pie + toe", "pot"] }), ["PIE", "TOE"],
    "a keyword the maker suggested (split or not) was learned by Use already");
  assert.deepEqual(fresh("", "a DUCK on a POT", { word: "pato", meaning: "duck (bird)" }), ["POT"], "the meaning in capitals isn't a sound-alike");
  assert.deepEqual(fresh("", "PATO sounds like POT", { word: "pato", meaning: "duck" }), ["POT"], "nor the word itself");
});

// ----- the sound check -----

test("a keyword counts only when it really sounds like the word; one whose sounds aren't known is left alone", () => {
  const v = { text: "pato", meaning: "duck" };
  const got = judgeOwn(v, said("pato"), capitalKeywords("a POT on a TABLE, a ZZXQ, a PIE TOE"), { lists: [list] });
  assert.deepEqual(got.passed.map((k) => k.shown), ["POT", "PIE TOE"]);
  assert.deepEqual(got.failed.map((k) => k.shown), ["TABLE"], "TABLE doesn't sound like pato");
  const pot = got.passed[0];
  assert.equal(pot.ipa, list.ipaOf("pot"));
  assert.equal(pot.lang, "en");
  assert.deepEqual(pot.traits, ["partial", "untied", "kind:artifact"], "its traits as the maker's own keywords have them");
  assert.ok(got.passed[1].traits.includes("two"));
  // The English pronunciation table is the fallback for a word the keyword list hasn't got.
  const table = (k) => (k === "potte" ? "pɑt" : null);
  assert.deepEqual(judgeOwn(v, said("pato"), capitalKeywords("POTTE"), { lists: [list], english: table }).passed.map((k) => k.key), ["potte"]);
  assert.deepEqual(judgeOwn(v, said("pato"), capitalKeywords("POTTE"), { lists: [list] }), { passed: [], failed: [] }, "no sounds, no answer");
  assert.equal(judgeOwn(v, null, capitalKeywords("POT"), { lists: [list] }), null, "the word's own sounds unknown: nothing");
  // A keyword tied to the meaning is "tied", as the maker's own.
  const hund = pronunciationOf({ word: "Hund", lang: "de", ipa: "hʊnt" });
  assert.ok(judgeOwn({ text: "Hund", meaning: "dog" }, hund, capitalKeywords("HOUND"), { lists: [list] }).passed[0].traits.includes("tied"));
});

// ----- learning from it -----

test("a passing keyword counts like Use, a half more, within the limits, and is kept with its sounds", () => {
  assert.equal(OWN_STEP, PREF_STEP * 1.5);
  const step = learn("", ["kind:animal"], +1, [], 0.05);
  assert.equal(step.w["kind:animal"], 0.05, "learn takes a step");
  assert.equal(learn("", ["kind:animal"], +1).w["kind:animal"], PREF_STEP, "and Use's by default");
  const v = { text: "pato", meaning: "duck" };
  const passed = judgeOwn(v, said("pato"), capitalKeywords("a POT"), { lists: [list] }).passed;
  let p = learnOwn("", passed, { v, note: "pot — Picture a duck sitting on a POT" });
  assert.equal(p.w["kind:artifact"], OWN_STEP);
  assert.equal(p.n, 1, "one more of your choices learned from");
  assert.deepEqual(p.o, [["pot", list.ipaOf("pot")]]);
  assert.deepEqual(p.x, [["pato", "duck", "pot — Picture a duck sitting on a POT"]]);
  for (let i = 0; i < 20; i++) p = learnOwn(p, passed, { v, note: "a POT" });
  assert.equal(p.w["kind:artifact"], PREF_LIMIT, "never past the limit");
  assert.equal(p.o.length, 1, "the same keyword once");
  assert.deepEqual(p.x, [["pato", "duck", "a POT"]], "one example per word, the newest");
  assert.deepEqual(learnOwn(p, [], { v: { text: "gato" }, note: "nothing in capitals" }).x, p.x, "no keyword passed: no example");
  // Newest first, at most OWN_MAX, and EXAMPLES_MAX notes.
  let q = "";
  for (let i = 0; i < OWN_MAX + 5; i++) {
    const key = `word${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))}`;
    q = learnOwn(q, [{ key, ipa: "wɝd", traits: ["untied"] }], { v: { text: `w${i}`, meaning: "m" }, note: `note ${i} ${key.toUpperCase()}` });
  }
  assert.equal(q.o.length, OWN_MAX);
  assert.equal(q.o[0][0], "wordmc", "the newest first");
  assert.equal(q.x.length, EXAMPLES_MAX);
  assert.equal(q.x[0][0], `w${OWN_MAX + 4}`);
  assert.equal(shortNote("x ".repeat(400)).length <= NOTE_MAX, true, "an example note is cut short");
  // Another language's keyword keeps its language.
  assert.deepEqual(learnOwn("", [{ key: "junta", ipa: "xunta", lang: "es", traits: [] }], {}).o, [["junta", "xunta", "es"]]);
});

test("the synced setting stays small: the oldest own words go first", () => {
  let p = { w: { two: -0.1, untied: 0.05 }, n: 99, o: [], x: [] };
  for (let i = 0; i < OWN_MAX; i++) p.o.push([`keyword ${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))}`, "ˈkiːwɝd ˈwʌn"]);
  for (let i = 0; i < EXAMPLES_MAX; i++) p.x.push([`palabra${i}`, "a fairly long meaning, with a note", "n".repeat(NOTE_MAX - 4) + ` X${i}`]);
  const text = writePrefs(p);
  assert.ok(text.length <= PREFS_MAX, `${text.length} characters`);
  const back = readPrefs(text);
  assert.equal(back.o[0][0], p.o[0][0], "the newest are kept");
  assert.ok(back.o.length < OWN_MAX && back.o.length >= 10);
  assert.equal(back.x.length, EXAMPLES_MAX, "with every example");
  assert.deepEqual(back.w, p.w);
  assert.equal(back.n, 99);
  assert.equal(writePrefs(""), "", "nothing learned: nothing kept");
  assert.equal(writePrefs({ w: {}, n: 2 }), '{"w":{},"n":2}');
});

test("the setting is read strictly: it may come from another device malformed", () => {
  const empty = { w: {}, n: 0, o: [], x: [] };
  for (const raw of ["", "nonsense", "null", "[]", '"text"', "42", '{"w":[1,2],"o":{},"x":"x"}', null, undefined, 5]) {
    assert.deepEqual(readPrefs(raw), empty, String(raw));
  }
  const p = readPrefs(JSON.stringify({
    w: { two: 0.05, untied: "0.1", "<b>": 0.1, partial: 9, tied: Infinity },
    n: -4,
    o: [["pot", "pɑt"], ["pot", "pɑt"], ["junta", "xunta", "es"], ["POT", "pɑt"], ["pie toe", "paɪ toʊ"], ["a", "eɪ"],
      ["one two three four", "x"], ["x".repeat(41), "x"], ["café", ""], ["dog", "<img src=x onerror=alert(1)>"], ["cat", "kæt", "EN!"],
      ["bad\u0000", "x"], ["hat", "hæ‮t"], "pot", [1, 2], ["sun", "sʌn", "fr", "extra"], ["кот", "kot", "ru"]],
    x: [["pato", "duck", "pot — a duck on a POT"], ["pato", "again", "a POT"], ["perro", "dog", "x".repeat(NOTE_MAX + 1)],
      ["gato", 5, "a GUT"], ["", "m", "n"], ["mesa", "table", ""], ["casa", "house", "a CASTLE‮\nwith lines"], ["uno", "one", "x"], ["dos", "two", "y"]],
    extra: "dropped",
  }));
  assert.deepEqual(p.w, { two: 0.05, partial: PREF_LIMIT }, "only real numbers, within the limit; no odd names");
  assert.equal(p.n, 0, "never below 0");
  assert.deepEqual(p.o, [["pot", "pɑt"], ["junta", "xunta", "es"], ["pie toe", "paɪ toʊ"], ["кот", "kot", "ru"]],
    "small letters, 2-40 characters, up to 3 words, plain sounds, a language code; each once");
  assert.deepEqual(p.x, [["pato", "duck", "pot — a duck on a POT"], ["casa", "house", "a CASTLE with lines"], ["uno", "one", "x"]],
    "a word, a meaning and a note, each a string, not too long, control and direction characters out, one per word, at most 3");
  assert.equal("extra" in p, false);
  const many = readPrefs({ o: Array.from({ length: 200 }, (_, i) => [`w${"abcdefghij"[i % 10]}${"abcdefghijklmnopqrst"[Math.floor(i / 10)]}`, "x"]) });
  assert.ok(many.o.length <= OWN_MAX);
});

// ----- the learner's own words offered again -----

test("a sound-alike the learner wrote comes back for another word that sounds like it, with a small bonus", () => {
  const v = { text: "pato", meaning: "duck" };
  const prefs = writePrefs(learnOwn("", judgeOwn(v, said("pato"), capitalKeywords("a POT"), { lists: [list] }).passed, { v, note: "a POT" }));
  const pata = { text: "pata", meaning: "paw" };
  const all = (r) => [...r.items, ...r.parts];
  const plain = all(makeFreeMnemonics(pata, { pron: said("pata"), list }));
  const mine = all(makeFreeMnemonics(pata, { pron: said("pata"), list, prefs }));
  const pot = mine.find((s) => s.keyword === "pot");
  assert.ok(pot && pot.own, "offered, and marked as the learner's own");
  assert.ok(mine.indexOf(pot) <= Math.max(0, plain.findIndex((s) => s.keyword === "pot")), "a little higher than it would be");
  assert.equal(mine.filter((s) => s.own).length, 1, "only the learner's own are marked");
  assert.ok(!all(makeFreeMnemonics(pata, { pron: said("pata"), list, prefs, own: false })).some((s) => s.own), "switched off: not marked");
  assert.ok(!all(makeFreeMnemonics({ ...pata, memo: "a POT with a paw" }, { pron: said("pata"), list, prefs })).some((s) => s.own),
    "not offered for a card whose notes have it already");
  // Not in the keyword list at all: still offered, with its kept sounds, when it sounds like the word.
  const odd = writePrefs({ o: [["pottah", "ˈpɑtə"]], n: 1 });
  const offered = all(makeFreeMnemonics(pata, { pron: said("pata"), list, prefs: odd })).find((s) => s.keyword === "pottah");
  assert.ok(offered && offered.own && offered.scene.includes("POTTAH"));
  assert.ok(!all(makeFreeMnemonics({ text: "perro", meaning: "dog" }, { pron: said("perro"), list, prefs })).some((s) => s.own),
    "never for a word it doesn't sound like");
});

// ----- the AI's examples -----

test("the learner's own notes go to their AI as examples of their style, only when given", () => {
  const prefs = writePrefs(learnOwn("", [{ key: "pot", ipa: "pɑt", traits: [] }], { v: { text: "pato", meaning: "duck" }, note: 'pot — a duck on a "POT"' }));
  const examples = ownExamples(prefs);
  assert.deepEqual(examples, [{ word: "pato", meaning: "duck", note: 'pot — a duck on a "POT"' }]);
  const asked = mnemonicPrompt({ word: "gato", meaning: "cat", study: "Spanish", examples }).user;
  assert.match(asked, /wrote themselves/);
  assert.ok(asked.includes(`- pato (duck): "pot — a duck on a 'POT'"`), asked);
  assert.ok(!/wrote themselves/.test(mnemonicPrompt({ word: "gato", meaning: "cat", study: "Spanish" }).user), "none: not mentioned");
  assert.equal(mnemonicPrompt({ word: "gato", examples: Array(9).fill(examples[0]) }).user.split("\n- ").length - 1, 3, "at most 3");
});

// ----- the setting -----

test("Learn from my own mnemonics is on unless switched off, syncs, and Forget it clears everything learned", () => {
  assert.equal(learnsOwn({}), true);
  assert.equal(learnsOwn({ mnemonic_learn_own: "" }), true);
  assert.equal(learnsOwn({ mnemonic_learn_own: "on" }), true);
  assert.equal(learnsOwn({ mnemonic_learn_own: "off" }), false);
  for (const f of ["web/js/aikeys.js", "app/aikeys.py", "app/db.py", "mobile/src/js/store.js"]) assert.ok(source(f).includes("mnemonic_learn_own"), f);
  const card = source("web/js/components/freehelpers.js");
  assert.ok(card.includes('data-find="mnemonicown"'), "Settings' search finds it");
  assert.match(source("web/js/components/settingsui.js"), /id: "mnemonicown"/);
  // Forget it (Settings' card and the Mnemonic maker's More options) empties the one setting all of it lives in.
  assert.match(card, /mnemonic_prefs: "" \}/);
  assert.match(source("web/js/components/aisetup.js"), /#mn-taste-reset"\)\.onclick = async \(\) => \{ await saveSettings\(\{ mnemonic_prefs: "" \}\)/);
  assert.deepEqual(readPrefs(""), { w: {}, n: 0, o: [], x: [] }, "weights, own words and examples all gone");
  // Every place the notes are edited learns from them; the placeholders say how.
  for (const f of ["web/js/pages/review.js", "web/js/components/wordeditor.js", "web/js/components/wordbuilder.js"]) {
    assert.ok(source(f).includes("learnFromNote("), `${f} learns from saved notes`);
  }
  assert.ok(source("web/js/review/cardtools.js").includes("Sound-alike in CAPITALS: a duck sitting on a POT…"));
});
