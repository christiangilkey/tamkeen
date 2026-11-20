// A translation, not "what form it is" (web/js/lexicon/formof.js, meaningdata.js translatedForms and cardRepair, used by
// web/js/meanings.js dictionaryDefine and formMeaningRepair). The owner, 2026-11-20, of مبتل: "Some words give a
// description of the word instead of an actual definition, such as this one telling me it's an active participle of
// another word. I just [want the] translation."
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import zlib from "node:zlib";

const fo = await import("../../web/js/lexicon/formof.js");
const md = await import("../../web/js/lexicon/meaningdata.js");
const { vocabFromDefinition } = await import("../../web/js/languages.js");
const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

const NAMES = { ar: ["ar", "ar-camel"], ceb: ["ceb-wolff", "ceb"] };
const cache = new Map();
const filesOf = (lang) => {
  if (!cache.has(lang)) {
    cache.set(lang, (NAMES[lang] || [lang]).map((n) => md.keyedTables(JSON.parse(zlib.gunzipSync(
      readFileSync(new URL(`../../docs/lexicon/${n}-meanings.json.gz`, import.meta.url))).toString("utf8")))));
  }
  return cache.get(lang);
};
/** The popup's answer for `word`, as dictionaryDefine makes it (without the word tables: spelling and forms only). */
function define(word, lang) {
  const files = filesOf(lang);
  const found = md.lookUp(files, md.wordKeys(word, lang, null), word, lang, {});
  assert.ok(found, `${word} is in the ${lang} dictionary`);
  return md.answerFrom(md.translatedForms(md.commonestFirst(found, files, lang, word), files, lang), word, lang, {});
}

test("reading a form-of line: what form, of which word, and any meaning it gives", () => {
  const yes = () => true;
  assert.deepEqual(fo.readFormOf("active participle of اِبْتَلَّ (ibtalla)", yes),
    { head: "active participle of اِبْتَلَّ (ibtalla)", kind: "ing", target: "اِبْتَلَّ", said: "", own: false });
  assert.equal(fo.readFormOf("passive participle of نَسَخَ (nasaḵa)", yes).kind, "ed");
  assert.equal(fo.readFormOf("verbal noun of صَامَ (ṣāma) (form I)", yes).kind, "ing");
  assert.equal(fo.readFormOf("broken plural of تاج (tāj /tâj)", yes).kind, "plural");
  assert.equal(fo.readFormOf("third-person plural preterite/pluperfect indicative of encarar", yes).kind, "same", "a verb's person: its verb's meaning");
  assert.equal(fo.readFormOf("elative degree of كَبِير (kabīr):", yes).kind, "elative");
  const king = fo.readFormOf("Judeo-Arabic spelling of مَلِك (malik, “king”)", yes);
  assert.deepEqual([king.said, king.own], ["king", false], "the other word's meaning, in curly quotes");
  const me = fo.readFormOf("me; post preposition form of jo", yes);
  assert.deepEqual([me.said, me.own, me.head], ["me", true, "post preposition form of jo"], "a meaning before the note is the word's own");
  const worse = fo.readFormOf("comparative degree of malo: worse", yes);
  assert.deepEqual([worse.said, worse.own], ["worse", true], "and one after it");
  assert.equal(fo.readFormOf("superlative degree of ultimo (“very latest”)", yes).own, true, "curly quotes already in the form");
  // Meanings, not forms
  for (const meaning of ["state of matter", "standard of living", "first of all", "full of fatty scum on the surface (of liquid such as broth, etc.)",
    "a Korean form of underfloor heating", "a kind of fish", "compound of sand, clay, etc. for making earthenware", "muezzin", "wet"]) {
    assert.equal(fo.readFormOf(meaning, yes), null, meaning);
  }
  assert.equal(fo.readFormOf("Brazilian Portuguese standard spelling of gardênia", () => false), null, "anyone's spelling only of a word the dictionary has");
  assert.equal(fo.readFormOf("short form for nakig- and makig-", yes), null, "an affix's line stays");
});

test("English for a form, from the other word's meaning", () => {
  assert.deepEqual(["write", "run", "lie", "see", "make", "begin", "visit", "be"].map(fo.ingOf),
    ["writing", "running", "lying", "seeing", "making", "beginning", "visiting", "being"]);
  assert.deepEqual(["write", "love", "stop", "cry", "eat", "go", "open"].map(fo.edOf), ["written", "loved", "stopped", "cried", "eaten", "gone", "opened"]);
  assert.deepEqual(["book", "city", "box", "man", "knife", "church"].map(fo.pluralOf), ["books", "cities", "boxes", "men", "knives", "churches"]);
  assert.deepEqual(fo.comparedOf("big"), ["bigger", "biggest"]);
  assert.deepEqual(fo.comparedOf("wide"), ["wider", "widest"]);
  assert.deepEqual(fo.comparedOf("happy"), ["happier", "happiest"]);
  assert.deepEqual(fo.comparedOf("beautiful"), ["more beautiful", "most beautiful"]);
  assert.deepEqual(fo.comparedOf("cheaply"), ["more cheaply", "most cheaply"]);
  assert.equal(fo.comparedOf("first"), null, "no firstest");
  assert.equal(fo.formMeaning("ing", "to become wet, to become moist"), "becoming wet, becoming moist");
  assert.equal(fo.formMeaning("ed", "to write"), "written");
  assert.equal(fo.formMeaning("plural", "book, volume"), "books, volumes");
  assert.equal(fo.formMeaning("plural", "a look"), "looks");
  assert.equal(fo.formMeaning("plural", "to marry"), "", "no plural of a verb's meaning");
  assert.equal(fo.formMeaning("elative", "big, large"), "bigger, biggest");
  assert.equal(fo.formMeaning("very", "free"), "very free");
  assert.equal(fo.formMeaning("comparative", "very intolerable"), "");
  assert.equal(fo.formMeaning("same", "abyss, chasm"), "abyss, chasm");
});

test("the owner's word and others like it: the translation is the meaning, what form it is the Form", () => {
  const wet = define("مبتل", "ar");
  assert.equal(wet.meaning, "wet");
  assert.equal(wet.morphology, "active participle of اِبْتَلَّ (ibtalla)");
  assert.ok(wet.other_meanings.includes("becoming wet, becoming moist"), "made from its verb, after its own meaning");
  assert.equal(define("مياه", "ar").meaning, "waters", "a plural made from its singular, before rarer senses");
  assert.equal(define("اكبر", "ar").meaning, "bigger, biggest");
  assert.equal(define("صيام", "ar").meaning.split(" (")[0], "fast, sawm");
  assert.equal(define("مقلي", "ar").meaning, "fried");
  assert.equal(define("abime", "fr").meaning, "abyss, chasm");
  assert.equal(define("gratis", "pt").meaning, "for free, free of charge");
  assert.match(define("eo", "it").meaning, /^I\b/);
  assert.equal(define("mi", "ca").meaning, "me");
  assert.equal(define("drcha", "es").meaning, "right");
  assert.equal(define("สุนัข", "th").meaning, "dog", "the translation tables win over a wrong sense in brackets");
  assert.equal(define("ข้าพเจ้า", "th").meaning, define("ข้าพเจ้า", "th").meaning); // (no crash on a line with no form)
});

test("a word that is only another word's form gets that form's English first", () => {
  assert.equal(define("comiendo", "es").meaning, "eating");
  assert.equal(define("casas", "es").meaning, "houses");
  assert.equal(define("mangé", "fr").meaning, "eaten");
  assert.equal(define("peor", "es").meaning, "worse", "a meaning the line gives is as it is (not \"worser\")");
  assert.equal(define("тестирование", "ru").meaning, "testing");
  assert.notEqual(define("estas", "es").meaning, "thises", "no plural of a pronoun's meaning");
  assert.notEqual(define("bones", "fr").meaning, "goods", "nor of an adjective's");
  assert.equal(define("fui", "es").meaning.startsWith("to go"), true, "a verb's person and tense: its verb's meaning, as before");
});

test("meanings that are not forms are left alone; affixes too", () => {
  assert.match(define("malinab", "tl").meaning, /^full of fatty scum/);
  assert.equal(define("napocor", "tl").meaning, "syllabic abbreviation of National Power Corporation", "nothing made of a name's first word");
  assert.equal(define("tikaw", "ceb").meaning, "contraction of ta and ikaw", "nor of a contraction's first word");
  assert.match(define("كاتب", "ar").meaning, /^writer/);
});

test("a word spelled like a JavaScript name is looked up like any other (it made the lookup fail)", () => {
  assert.match(define("constructor", "es").meaning, /^constructor/);
  const files = filesOf("es");
  assert.equal(Object.getPrototypeOf(files[0].words), null);
  assert.equal(md.lookUp(files, md.wordKeys("toString", "es", null), "toString", "es", {}), null);
  assert.equal(read("web/js/meanings.js").match(/\.then\(keyedTables\)/g).length, 2, "every file the popup reads");
});

test("the card keeps what form it is in its Grammar notes", () => {
  const def = { provider: "dictionary", meaning: "wet", morphology: "active participle of اِبْتَلَّ (ibtalla)", pos: "adj", vocalized: "مُبْتَلّ" };
  assert.match(vocabFromDefinition(def, "مبتل", "ar").notes, /active participle of اِبْتَلَّ \(ibtalla\)/);
  assert.doesNotMatch(vocabFromDefinition({ ...def, provider: "anthropic" }, "مبتل", "ar").notes, /participle/, "an AI's analysis as before");
  assert.doesNotMatch(vocabFromDefinition({ ...def, morphology: "also past participle of decir" }, "dicho", "es").notes, /also/);
  const b = read("web/js/components/wordbuilder.js");
  assert.match(b, /if \(d\.form && !String\(r\.notes \|\| ""\)\.trim\(\)\) \{/, "Add words: in Notes, when the learner wrote none");
});

test("old cards: only a meaning that is the dictionary's own form-of line, letter for letter, is put right", () => {
  const files = filesOf("ar");
  const raw = md.lookUp(files, md.wordKeys("مبتل", "ar", null), "مبتل", "ar", {});
  const answer = define("مبتل", "ar");
  const line = "active participle of اِبْتَلَّ (ibtalla)";
  assert.deepEqual(md.cardRepair({ meaning: line, notes: "" }, raw, answer), { meaning: "wet", notes: line });
  assert.deepEqual(md.cardRepair({ meaning: ` ${line} `, notes: "Root: ب ل ل" }, raw, answer),
    { meaning: "wet", notes: `Root: ب ل ل · ${line}` }, "the learner's notes kept, the form after them");
  assert.deepEqual(md.cardRepair({ meaning: line, notes: `${line} · adj` }, raw, answer), { meaning: "wet" }, "said already");
  // Never a meaning the learner wrote or changed
  assert.equal(md.cardRepair({ meaning: "active participle of ابتل", notes: "" }, raw, answer), null, "changed: no longer the line");
  assert.equal(md.cardRepair({ meaning: "soaked", notes: "" }, raw, answer), null);
  assert.equal(md.cardRepair({ meaning: "wet", notes: "" }, raw, answer), null, "a real meaning of the entry stays");
  assert.equal(md.cardRepair({ meaning: "", notes: "" }, raw, answer), null);
  assert.equal(md.cardRepair({ meaning: line, notes: "" }, raw, { meaning: line }), null, "nothing better to put");
  // Shown in the reviewer and opened in the word editor, saved as an edit is
  const review = read("web/js/pages/review.js");
  assert.match(review, /repairFormMeaning\(v, studyOf\(v\), \(change\) => \{\n\s+if \(closed \|\| todo\[0\] !== v\) return;\n\s+saveCard\(v, change\);/);
  const editor = read("web/js/components/wordeditor.js");
  assert.match(editor, /repairFormMeaning\(v, studyLang\(\), \(change\) => \{\n\s+if \(closed \|\| isEditing\("meaning"\) \|\| isEditing\("notes"\)\) return;\n\s+saveChange\(change\);/);
  const meanings = read("web/js/meanings.js");
  assert.match(meanings, /if \(st && !st\.installed\) return null;/, "never downloads a dictionary for it");
  assert.match(meanings, /found = translatedForms\(found, files, lang\);/);
});
