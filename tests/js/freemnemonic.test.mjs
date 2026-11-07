// The free card helpers, with no AI key: how a word is said (review/soundout.js), English keywords that sound
// like it with a picture line (review/freemnemonic.js), and example sentences (lexicon/exampledata.js), all
// against the real files in docs/lexicon (tools/build_examples.py).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { kanaRomaji, pronunciationOf, spellingIpa, syllabify } from "../../web/js/review/soundout.js";
import { KeywordList, PREF_LIMIT, findKeywords, learn, makeFreeMnemonics, meaningPicture, prefBonus, readPrefs, sceneFor, traitsOf } from "../../web/js/review/freemnemonic.js";
import { ExamplePack, markTranslation, sentenceKeys, sourceOf } from "../../web/js/lexicon/exampledata.js";
import { noteText } from "../../web/js/review/mnemonic.js";

const read = (name) => JSON.parse(gunzipSync(readFileSync(new URL(`../../docs/lexicon/${name}`, import.meta.url))));
const list = new KeywordList(read("en-keywords.json.gz"));
const packs = {};
const pack = (lang) => (packs[lang] ||= new ExamplePack(read(`${lang}-examples.json.gz`), lang));
const said = (word, lang, meaning = "") => pronunciationOf({ word, lang, ipa: pack(lang).ipaOf(word, { verb: /^to /.test(meaning) }) });
const keywordsFor = (word, lang, meaning) => {
  const r = makeFreeMnemonics({ text: word, meaning }, { pron: said(word, lang, meaning), list });
  return [...r.items, ...r.parts];
};

// ----- how the word is said -----

test("syllables come from the IPA's marks, or by rule; the stress is kept", () => {
  const caballo = syllabify("kaˈbaʝo");
  assert.deepEqual(caballo.syllables.map((s) => s.text), ["ka", "ba", "yo"]);
  assert.equal(caballo.stress, 1);
  assert.deepEqual(syllabify("obɾigadu").syllables.map((s) => s.text), ["o", "bri", "ga", "du"], "br starts a syllable together");
  assert.deepEqual(syllabify("mastaʃfaː").syllables.map((s) => s.text), ["mas", "tash", "faa"]);
});

test("each language's spelling is read its own way when Wiktionary has no IPA", () => {
  assert.equal(spellingIpa("caballo", "es"), "kabajo");
  assert.equal(spellingIpa("chiesa", "it"), "kieza");
  assert.equal(spellingIpa("Schmetterling", "de"), "ʃmetteʁliŋ");
  assert.equal(spellingIpa("كَلْب", "ar"), "kalb", "vowel marks are read");
  assert.equal(spellingIpa("مستشفى", "ar"), "mastaʃfaː", "without them a vowel is guessed, not after every letter");
  assert.equal(spellingIpa("xièxie", "zh"), "ɕjɛ.ɕjɛ", "pinyin is cut into its syllables");
  assert.equal(kanaRomaji("きって"), "kitte");
  assert.equal(kanaRomaji("トウキョウ"), "toukyou");
  assert.match(spellingIpa("соба́ка", "ru"), /saˈbaka/, "Russian: unstressed o is a, the stress goes before its consonant");
});

test("Wiktionary's pronunciation is used when the examples file has the word", () => {
  const p = said("perro", "es");
  assert.equal(p.from, "wiktionary");
  assert.deepEqual(p.syllables.map((s) => s.text), ["pe", "ro"]);
  assert.equal(said("قلم", "ar", "pen").syllables.map((s) => s.text).join("-"), "qa-lam", "Arabic: the noun's, for a noun meaning");
  assert.equal(said("كتب", "ar", "to write").syllables.map((s) => s.text).join("-"), "ka-ta-ba", "and the verb's for 'to …'");
  assert.equal(said("狗", "zh").syllables[0].ipa.replace(/ː/g, ""), "ɡow", "Chinese: pinyin from CC-CEDICT");
  assert.equal(said("aqua", "la").syllables.map((s) => s.text).join("-"), "aa-kwa", "Latin as the Church says it");
  assert.equal(pronunciationOf({ word: "", lang: "es" }), null);
});

// ----- keywords -----

test("published keyword-method pairs are found with no AI", () => {
  const has = (word, lang, meaning, keyword) => {
    const got = keywordsFor(word, lang, meaning).map((s) => s.keyword);
    assert.ok(got.some((k) => k.split(/[\s+]+/).includes(keyword)), `${word}: ${keyword} in ${got.join(", ")}`);
  };
  has("pato", "es", "duck", "pot");
  has("carta", "es", "letter", "cart");
  has("uccello", "it", "bird", "cello");
  has("Ente", "de", "duck", "ant");
  has("poubelle", "fr", "rubbish bin", "bell");
  has("قلم", "ar", "pen", "column");
  has("luna", "la", "moon", "loon");
  has("書", "zh", "book", "shoe");  // (traditional characters: read as their simplified ones)
});

test("every keyword is a real, common English word, never the word or its meaning", () => {
  for (const [word, lang, meaning] of [["perro", "es", "dog"], ["كلب", "ar", "dog"], ["Hund", "de", "dog"], ["แมว", "th", "cat"]]) {
    const got = keywordsFor(word, lang, meaning);
    assert.ok(got.length >= 3, `${word}: ${got.length}`);
    for (const s of got) {
      for (const w of s.keyword.split(/[\s+]+/)) assert.ok(list.byWord.has(w), `${w} is in the list`);
      assert.ok(!/\bdog\b|\bcat\b/.test(s.keyword), s.keyword);
      assert.ok(s.sound === "close" || s.sound === "partial");
    }
  }
});

test("picturable things come before abstract words that sound as close", () => {
  const r = findKeywords(said("pato", "es"), list);
  assert.ok(r.keywords.length && r.parts.length);
  const first = keywordsFor("pato", "es", "duck").find((s) => !s.keyword.includes(" "));
  assert.ok(["patio", "pot", "pipe", "pout"].includes(first.keyword), first.keyword);
});

test("among keywords that sound alike, one tied to the meaning comes first", () => {
  // The owner: "prefer words that are related to actual meaning of the foreign language word".
  const top = (word, lang, meaning, opts = {}) => {
    const r = makeFreeMnemonics({ text: word, meaning }, { pron: said(word, lang, meaning), list, ...opts });
    return r.items[0] || r.parts[0];
  };
  const hund = top("Hund", "de", "dog");
  assert.equal(hund.keyword, "hound", "HOUND: it sounds like Hund and is a kind of dog");
  assert.equal(hund.link, 2, "shown 'Fits the meaning'");
  assert.equal(hund.tie, "s");
  assert.match(hund.scene, /HOUND is a kind of dog/);
  assert.notEqual(top("Hund", "de", "dog", { meaningWeight: 0 }).keyword, "hound", "without the ties it was a sound-alike only");
  assert.equal(top("caballo", "es", "horse").keyword, "cob");
  assert.equal(top("پرنده", "fa", "bird").keyword, "parrot");
  // Sound stays the gate: every tied keyword shown still sounds like the word.
  for (const [word, lang, meaning] of [["Hund", "de", "dog"], ["perro", "es", "dog"], ["canis", "la", "dog"]]) {
    const r = makeFreeMnemonics({ text: word, meaning }, { pron: said(word, lang, meaning), list });
    for (const s of [...r.items, ...r.parts]) assert.ok(s.sound === "close" || s.sound === "partial", `${s.keyword}: ${s.sound}`);
  }
});

test("a meaning's ties: kinds of it first, a verb's from its verb senses", () => {
  const dog = list.tiesOf(meaningPicture("dog", list));
  assert.ok(dog.get("hound").weight >= 0.7 && dog.get("puppy"));
  assert.ok(!dog.has("dog"), "never the meaning itself");
  const run = list.tiesOf(meaningPicture("to run", list));
  assert.ok(run.has("jog") && run.has("sprint"), "to run: jog, sprint (not a run in baseball)");
  const big = list.tiesOf(meaningPicture("big, large", list));
  assert.ok(big.has("large") || big.has("huge") || big.has("giant"));
});

test("turned-down keywords never come back", () => {
  const before = keywordsFor("carta", "es", "letter").map((s) => s.keyword);
  const r = makeFreeMnemonics({ text: "carta", meaning: "letter" }, { pron: said("carta", "es"), list, avoid: before });
  for (const s of [...r.items, ...r.parts]) assert.ok(!before.includes(s.keyword), s.keyword);
});

test("the picture line joins the keyword to the meaning", () => {
  const cart = list.byWord.get("cart"), calf = list.byWord.get("calf"), lettuce = list.byWord.get("lettuce");
  assert.match(sceneFor(cart, meaningPicture("letter", list), "carta"), /\bCART\b/);
  assert.match(sceneFor(cart, meaningPicture("letter", list), "carta"), /\ba letter\b/);
  assert.match(sceneFor(calf, meaningPicture("dog", list), "kalb"), /^Picture a CALF .*a dog/);
  assert.match(sceneFor(calf, meaningPicture("to write", list), "x"), /\bwrite\b/);
  assert.match(sceneFor(lettuce, meaningPicture("happy, glad", list), "laetus"), /happy/);
  assert.doesNotMatch(sceneFor(cart, meaningPicture("water", list), "x"), /a water/, "no 'a' before what isn't counted");
  assert.equal(meaningPicture("(of a person) big; large", list).pos, "adj");
  assert.equal(meaningPicture("to eat", list).pos, "verb");
  const r = makeFreeMnemonics({ text: "pato", meaning: "duck" }, { pron: said("pato", "es"), list });
  assert.match(noteText(r.items[0]), /^[a-z ]+ — (?:“[A-Z ]+”: )?Picture /, "Use puts 'keyword — picture' in Memorization notes");
  assert.equal(r.free, true);
});

// ----- example sentences -----

test("a short real sentence that uses the word, with its English translation", () => {
  const [es] = pack("es").find("perro", { meaning: "dog" });
  assert.ok(/\bperro\b/i.test(es.text) && /dog/i.test(es.english), es.text);
  const [ja] = pack("ja").find("猫", { meaning: "cat" });
  assert.ok(ja.text.includes("猫"), "Japanese: found inside the sentence");
  const [ar] = pack("ar").find("كتاب", { meaning: "book" });
  assert.ok(/book/i.test(ar.english), ar.english);
  assert.ok(!ar.source.includes(":"), "Standard Arabic before a dialect's when no dialect is asked for");
  const [ceb] = pack("ceb").find("balay", { meaning: "house" });
  assert.ok(/house/i.test(ceb.english));
});

test("the sense that fits the meaning comes first, and whole sentences before dictionary phrases", () => {
  const found = pack("es").find("manzana", { meaning: "apple" });
  assert.ok(found.length && /apple/i.test(found[0].english), found[0] && found[0].english);
  const words = found[0].text.split(/\s+/).length;
  assert.ok(words >= 3, found[0].text);
});

test("other forms of the word are found through its dictionary form", () => {
  const lemmaOf = (w) => ({ hablaba: "hablar", hablo: "hablar", hablar: "hablar" }[String(w).toLowerCase()] || w);
  const found = pack("es").find("hablar", { lemmaOf, count: 40 });
  assert.ok(found.length >= 3);
});

test("Arabic words are found with the little words in front (و، ال، ب)", () => {
  assert.ok(sentenceKeys("وبالكتاب", "ar").includes("كتاب"));
});

test("the translation lights up the word for the meaning; sources are named", () => {
  assert.equal(markTranslation("The dogs are playing.", "dog"), "The ⟦dogs⟧ are playing.");
  assert.equal(markTranslation("I like to swim.", "to swim"), "I like to ⟦swim⟧.");
  assert.equal(markTranslation("Nothing here.", "dog"), "Nothing here.");
  assert.deepEqual(sourceOf("t12345"), { name: "Tatoeba", url: "https://tatoeba.org/en/sentences/show/12345" });
  assert.equal(sourceOf("w:arz").name, "Wiktionary");
});

test("a sentence the learner can read comes first (i+1), when the seen words are known", () => {
  const all = pack("es").find("perro", { meaning: "dog", count: 40 });
  assert.ok(all.length >= 5);
  const easy = all[all.length - 1].text;  // one the plain order puts last
  const newWords = (text) => (text === easy ? 0 : 3);  // every other word of `easy` seen; others have 3 new
  const [first] = pack("es").find("perro", { meaning: "dog", newWords });
  assert.equal(first.text, easy);
  assert.equal(first.newWords, 0, "said on the card: every other word is one you know");
  const [plain] = pack("es").find("perro", { meaning: "dog" });
  assert.equal(plain.newWords, undefined, "nothing said when it can't be told");
});

test("keywords in the learner's own language when the app isn't in English", () => {
  for (const ui of ["es", "fr", "de", "it", "pt", "ru", "ca"]) {
    const own = new KeywordList(read(`${ui}-keywords.json.gz`), list);
    assert.equal(own.lang, ui);
    assert.ok(own.words.length > 5000, `${ui}: ${own.words.length}`);
  }
  const it = new KeywordList(read("it-keywords.json.gz"), list);
  const r = makeFreeMnemonics({ text: "قطة", meaning: "gatto" }, { pron: said("قطة", "ar", "cat"), list: it });
  const top = r.items[0] || r.parts[0];
  assert.equal(r.keywordLang, "it");
  assert.equal(top.keyword, "gatta", "Arabic qiṭṭa: Italian GATTA, a she-cat");
  assert.ok(top.link >= 1);
  assert.match(top.scene, /GATTA e «gatto»/, "a picture line in Italian");
  const de = new KeywordList(read("de-keywords.json.gz"), list);
  const hund = makeFreeMnemonics({ text: "perro", meaning: "Hund" }, { pron: said("perro", "es"), list: de });
  assert.ok(hund.items.length >= 3);
  for (const s of hund.items) assert.ok(de.byWord.has(s.keyword.toLowerCase()), `${s.keyword} is a German word of the list`);
});

test("the maker learns the learner's taste from Use and thumbs down, a little at a time", () => {
  const two = ["two", "untied"], cart = ["untied", "kind:artifact"];
  let p = learn("", two, -1, [cart]);
  assert.equal(p.w.two, -0.02);
  assert.equal(p.w.untied, undefined, "a trait every suggestion shown has says nothing");
  for (let i = 0; i < 50; i++) p = learn(p, two, -1, [cart]);
  assert.equal(p.w.two, -PREF_LIMIT, "never further than the limit");
  p = learn(p, cart, +1, [two]);
  assert.ok(p.w["kind:artifact"] > 0 && p.w.two < 0);
  assert.equal(p.n, 52);
  assert.deepEqual(readPrefs(JSON.stringify(p)).w, p.w, "kept as JSON in the synced setting");
  assert.deepEqual(readPrefs("nonsense"), { w: {}, n: 0, o: [], x: [] });
  assert.ok(Math.abs(prefBonus(p, ["two", "kind:artifact", "untied"])) <= 0.2);
  // On real suggestions: someone who turns down two-word keywords stops getting them first.
  const pron = said("pato", "es");
  const plain = makeFreeMnemonics({ text: "pato", meaning: "duck" }, { pron, list });
  assert.ok(/\s/.test(plain.items[0].keyword), "pie tow first, as before");
  const taught = makeFreeMnemonics({ text: "pato", meaning: "duck" }, { pron, list, prefs: JSON.stringify({ w: { two: -0.15 }, n: 8 }) });
  assert.ok(!/\s/.test(taught.items[0].keyword), taught.items[0].keyword);
  assert.deepEqual(traitsOf({ keyword: "pot", sound: "partial", link: 0 }, list), ["partial", "untied", "kind:artifact"]);
});

test("Arabic dialect courses get their own sentences and sounds; Bisaya gets Wolff's examples", () => {
  const ar = pack("ar");
  const [egy] = ar.find("بيت", { meaning: "house", dialect: "egy" });
  assert.match(egy.source, /:arz$/, `Egyptian chosen: an Egyptian sentence (${egy.source})`);
  const [msa] = ar.find("بيت", { meaning: "house" });
  assert.ok(!msa.source.includes(":"), "no course chosen: Standard Arabic first");
  assert.ok(ar.sentences.some((s) => s[2] === "c:acm"), "the Iraqi course's own sentences are in");
  assert.ok(Object.keys(ar.dialectIpa.arz || {}).length > 500, "Wiktionary's Egyptian pronunciations");
  const ceb = pack("ceb");
  assert.ok(ceb.sentences.filter((s) => s[2] === "d").length > 15000, "Wolff's example sentences");
  const [balay] = ceb.find("balay", { meaning: "house" });
  assert.ok(balay && /house/i.test(balay.english));
  assert.ok(!ceb.sentences.some((s) => s[2] === "d" && /[áéíóú()]/.test(s[0])), "in today's spelling, no stress marks or Wolff's brackets");
});
