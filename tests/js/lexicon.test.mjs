// Run with: node --test tests/js/
// Seen words are kept by dictionary form: every form of a word must come out as the same lexeme.
// These tests read the real dictionaries in docs/lexicon/ (made by tools/build_lexicon.py).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { Dictionary, analyzeArabic, arabicCore, dialectOf, fallbackStem, lexemeKey, matchForm, posClass, spelled } from "../../web/js/lexicon/arabic.js";
import { lexemeOf, lexemesFor, markedTokens, needsDictionaries, surfaceLexeme } from "../../web/js/lexicon/words.js";

const file = (name) => fileURLToPath(new URL(`../../docs/lexicon/${name}`, import.meta.url));
const load = (name) => new Dictionary(JSON.parse(gunzipSync(readFileSync(file(`ar-${name}.json.gz`)))));
const dicts = ["msa", "egy", "lev", "glf"].map(load);
const read = (sentence) => {
  const tokens = sentence.split(/\s+/);
  const found = analyzeArabic(tokens, dicts);
  return Object.fromEntries(tokens.map((t, i) => [t, found[i]]));
};
const keys = (sentence) => analyzeArabic(sentence.split(/\s+/), dicts).map((x) => x && x.key);

test("normalizing is for matching only: marks, tatweel and alef forms", () => {
  assert.equal(spelled("كِتَابٌ"), "كتاب");
  assert.equal(spelled("كـــتاب"), "كتاب", "tatweel goes");
  assert.equal(spelled("أُمّ"), "أم", "hamzas stay in the spelling");
  assert.equal(matchForm("أَإآ"), "ااا", "but every alef matches every other");
  assert.equal(matchForm("مدرسة"), matchForm("مدرسه"));
  assert.equal(arabicCore("«الكتاب،"), "الكتاب");
  assert.equal(arabicCore("COVID-19"), "", "not an Arabic word");
  assert.equal(lexemeKey("كَتَب", "v"), "ar|كتب|v");
});

test("every form of a word is one lexeme: وكتبوا، يكتبون، سأكتبها are all كَتَب", () => {
  const found = read("وكتبوا الرسالة ثم يكتبون غيرها و سأكتبها غدا");
  for (const form of ["وكتبوا", "يكتبون", "سأكتبها"]) {
    assert.equal(found[form].key, "ar|كتب|v", form);
    assert.equal(found[form].lemma, "كَتَب");
    assert.equal(found[form].pos, "verb");
    assert.equal(found[form].root, "ك.ت.ب");
  }
  // Nouns too: with the article, a pronoun, a preposition, in the plural.
  const book = new Set(keys("الكتاب كتابها بكتابه وكتبهم والكتب").map(String));
  assert.deepEqual([...book], ["ar|كتاب|n"]);
});

test("attached pieces come off: و، ف، ب، ل، ال، س and the pronouns", () => {
  const found = read("وبالمدرسة فللطالب سيذهبون كتابها بيتهم");
  assert.equal(found["وبالمدرسة"].key, "ar|مدرسه|n");
  assert.equal(found["فللطالب"].key, "ar|طالب|n");
  assert.equal(found["سيذهبون"].key, "ar|ذهب|v");
  assert.equal(found["كتابها"].key, "ar|كتاب|n");
  assert.equal(found["بيتهم"].key, "ar|بيت|n");
});

test("the sentence settles what a word is: كتب is 'wrote' or 'books'", () => {
  assert.equal(read("قرأت في كتب كثيرة")["كتب"].key, "ar|كتاب|n", "after a preposition: books");
  assert.equal(read("هذه كتب جديدة")["كتب"].key, "ar|كتاب|n", "after 'these': books");
  assert.equal(read("قد كتب الطالب الدرس")["كتب"].key, "ar|كتب|v", "after قد: wrote");
  assert.equal(read("كتب الطالب رسالة")["كتب"].key, "ar|كتب|v", "opening the sentence: wrote");
  assert.equal(read("قرأت عن التاريخ، وكتب الطالب رسالة")["وكتب"].key, "ar|كتب|v", "and after a comma, behind 'and'");
  // A comma or full stop starts the count again.
  assert.equal(read("ذهبنا في الصباح. كتب الطالب رسالة")["كتب"].key, "ar|كتب|v");
});

test("how a word was spelled counts: كتابة is not كتابه", () => {
  const found = read("وجد كتابه ثم بدأ في كتابة الواجب");
  assert.equal(found["كتابه"].key, "ar|كتاب|n", "his book");
  assert.equal(found["كتابة"].key, "ar|كتابه|n", "writing");
  assert.equal(found["كتابة"].lemma, "كِتابَة");
});

test("vowel marks and punctuation on the word change nothing", () => {
  assert.deepEqual(keys("مِنَ الْكِتَابِ، جَدِيدَةٍ."), keys("من الكتاب جديدة"));
});

test("pronouns are themselves, not a particle with something attached", () => {
  const found = read("انا وهو وهي نحن");
  assert.equal(found["انا"].pos, "pron");
  assert.equal(found["انا"].key, "ar|انا|fw");
  assert.equal(found["نحن"].key, "ar|نحن|fw");
});

test("a dialect is noticed from its giveaway words and its dictionary takes over", () => {
  const forms = (s) => s.split(/\s+/).map((t) => matchForm(arabicCore(t)));
  assert.equal(dialectOf(forms("انتي جديدة هون شو بدك تعملي هلق"), dicts), "lev");
  assert.equal(dialectOf(forms("انا مش عايز اروح النهارده عشان تعبان"), dicts), "egy");
  assert.equal(dialectOf(forms("شلونك وايد زين الحين ابي اروح"), dicts), "glf");
  assert.equal(dialectOf(forms("قال الرئيس إن الحكومة ستعمل على تحسين الاقتصاد"), dicts), "");
  const lev = read("انتي جديدة هون؟ شو بدك تعملي");
  assert.equal(lev["هون؟"].key, "ar|هون|n", "Levantine 'here', not the Standard noun");
  assert.equal(lev["شو"].key, "ar|شو|fw");
  assert.equal(lev["جديدة"].key, "ar|جديد|n", "shared words keep the same lexeme as in Standard Arabic");
  assert.equal(read("هذه سيارة جديدة")["جديدة"].key, "ar|جديد|n");
});

test("a word no dictionary knows still gets a stable lexeme", () => {
  assert.equal(fallbackStem("والبودكاست"), "بودكاست");
  assert.equal(fallbackStem("بودكاستها"), "بودكاست");
  assert.equal(fallbackStem("بن"), "بن", "too short to cut anything off");
  const found = read("البودكاست وبودكاستهم");
  assert.equal(found["البودكاست"].key, "ar|بودكاست|x");
  assert.equal(found["وبودكاستهم"].key, "ar|بودكاست|x");
});

test("numbers and other scripts are not words to learn", () => {
  assert.deepEqual(analyzeArabic(["2024", "iPhone", "،", "كتاب"], dicts).map((x) => x && x.key), [null, null, null, "ar|كتاب|n"]);
});

test("part of speech is kept broad so the four dictionaries agree", () => {
  assert.deepEqual(["verb", "noun", "adj", "adv", "noun_num", "noun_prop", "prep", "pron", "conj_sub", "verb_pseudo", ""].map(posClass),
    ["v", "n", "n", "n", "n", "pn", "fw", "fw", "fw", "fw", "fw"]);
});

test("the smaller files hold what the lookup needs", () => {
  const msa = dicts[0].data;
  assert.equal(msa.format, 1);
  assert.ok(Object.keys(msa.stems).length > 30000);
  assert.ok(msa.stems["كتب"].length % 4 === 0);
  assert.ok(dicts.every((d) => d.readings("كتاب").some((r) => matchForm(r.lemma) === "كتاب")));
  // Fast enough to run over a whole episode when it opens.
  const words = "وكتبوا الرسالة ثم يكتبون غيرها و سأكتبها غدا في المدرسة الجديدة".split(" ");
  const many = Array.from({ length: 10000 }, (_, i) => words[i % words.length]);
  const t = Date.now();
  analyzeArabic(many, dicts);
  assert.ok(Date.now() - t < 3000, "10,000 words in well under three seconds");
});

test("other languages: a word is its spelling, lower-cased, until they get an analyzer", () => {
  assert.equal(needsDictionaries("ar"), true);
  assert.equal(needsDictionaries("es"), false);
  assert.equal(lexemesFor(["كتاب"], "ar", null), null, "Arabic without dictionaries: nothing is coloured");
  assert.deepEqual(lexemesFor(["¡Hola,", "MUNDO!", "2024", "—"], "es").map((x) => x && x.key), ["es|hola|x", "es|mundo|x", null, null]);
  assert.equal(surfaceLexeme("Привет!", "ru").key, "ru|привет|x");
  assert.equal(lexemeOf("単語", "ja").key, "ja|単語|x");
  assert.equal(lexemeOf("كتب", "ar", dicts).key, "ar|كتب|v", "a word on its own reads as its commonest sense");
});

test("everyday words the counts rank too low: كل is 'every', لكن 'but', قبل 'before'", () => {
  const one = (w) => lexemeOf(w, "ar", dicts);
  for (const [w, lemma] of [["كل", "كُلّ"], ["قبل", "قَبْل"], ["مثل", "مِثْل"], ["حول", "حَوْل"], ["نحو", "نَحْو"], ["بدون", "دُون"],
    ["أكثر", "أَكْثَر"], ["بكل", "كُلّ"], ["كله", "كُلّ"]]) {
    assert.equal(one(w).lemma.normalize("NFC"), lemma.normalize("NFC"), w);
  }
  for (const w of ["لكن", "ولكن", "لكنه", "لكنها"]) assert.equal(one(w).key, "ar|لكن|fw", w);
  assert.equal(one("وأنا").key, "ar|انا|fw", "and I");
  assert.equal(one("فهم").key, "ar|فهم|v", "not ف + هم");
  assert.equal(one("ليس").lemma, "لَيْسَ");
  // In a sentence too, and a word before that wants a verb still makes one: قد قبل, "has accepted".
  assert.equal(read("كل يوم أذهب إلى العمل قبل الساعة الثامنة")["كل"].key, "ar|كل|n");
  assert.equal(read("كل يوم أذهب إلى العمل قبل الساعة الثامنة")["قبل"].key, "ar|قبل|n");
  assert.equal(read("قد قبل الطالب الدعوة")["قبل"].key, "ar|قبل|v");
  assert.equal(read("الطعام جيد لكن السعر مرتفع")["لكن"].key, "ar|لكن|fw");
});

test("a looked-up sentence gives back the word that was tapped", () => {
  const { tokens, marked } = markedTokens("انتي جديدة ⟦هون⟧؟");
  assert.deepEqual(tokens, ["انتي", "جديدة", "هون", "؟"]);
  assert.deepEqual(marked, [2]);
  const two = markedTokens("قرأت ⟦في كتب⟧ كثيرة");
  assert.deepEqual(two.marked, [1, 2]);
  assert.equal(analyzeArabic(two.tokens, dicts)[2].key, "ar|كتاب|n");
});
