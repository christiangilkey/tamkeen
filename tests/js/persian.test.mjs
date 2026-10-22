// Run with: node --test tests/js/
// Persian (fa): told apart from Arabic and Urdu, its own letters (ک ی), the half space inside its words (ZWNJ:
// می‌خواهم is one word to tap), its word table (docs/lexicon/fa-lemmas.json.gz: می‌خواهم, خواستم -> خواستن), its
// meanings (docs/lexicon/fa-meanings.json.gz), Discover's Persian podcasts, and its right-to-left screens.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import {
  LANGUAGES, detectLanguage, joinWords, langAttrs, looksPersian, persianJoins, persianLetters, regroupWords,
} from "../../web/js/languages.js";
import { UI_LANGUAGES, SPEAK_QUESTION } from "../../web/js/i18n.js";
import { LemmaTable } from "../../web/js/lexicon/romance.js";
import { persianKey, persianLemma, persianLexeme } from "../../web/js/lexicon/persian.js";
import { lexemesFor, usesDictionaries, needsDictionaries } from "../../web/js/lexicon/words.js";
import { answerFrom, lookUp, matchKey, wordKeys } from "../../web/js/lexicon/meaningdata.js";
import { fold, findWord } from "../../web/js/cardtext.js";
import { findSpans, normalize } from "../../mobile/src/js/shared-logic.js";

const doc = (name) => JSON.parse(gunzipSync(readFileSync(fileURLToPath(new URL(`../../docs/lexicon/${name}`, import.meta.url)))));
const table = new LemmaTable(doc("fa-lemmas.json.gz"));
const meanings = doc("fa-meanings.json.gz");
const ZWNJ = "‌";

test("Persian is a language of its own: right to left, in Arabic letters, and an interface language", () => {
  assert.equal(LANGUAGES.fa.dir, "rtl");
  assert.equal(LANGUAGES.fa.native, "فارسی");
  assert.equal(langAttrs("fa"), 'lang="fa" dir="rtl"');
  assert.equal(UI_LANGUAGES.fa.dir, "rtl");
  assert.match(SPEAK_QUESTION.fa, /زبانی/);
  assert.ok(usesDictionaries("fa") && !needsDictionaries("fa"), "a word table helps, but Persian works without one");
});

test("Persian is told from Arabic by its letters, whatever is studied", () => {
  assert.equal(detectLanguage("من می‌خواهم کتاب بخوانم", "es"), "fa", "ZWNJ, ک and ی");
  assert.equal(detectLanguage("چرا اینجا نیستی؟", "ar"), "fa", "چ");
  assert.equal(detectLanguage("أريد أن أقرأ كتابا في المكتبة", "fa"), "ar", "ك ي and tanween are Arabic");
  assert.equal(detectLanguage("مدرسة جديدة", "fa"), "ar", "ة");
  // With no telling letter either way, the language being studied decides.
  assert.equal(detectLanguage("سلام", "fa"), "fa");
  assert.equal(detectLanguage("سلام", "ar"), "ar");
  assert.equal(looksPersian("گفتم"), true);
  assert.equal(looksPersian("قلت"), false);
});

test("Persian letters: ک and ی where speech recognition and Arabic keyboards write ك and ي", () => {
  assert.equal(persianLetters("كتابي"), "کتابی");
  assert.equal(persianLetters("مى‌روم"), "می‌روم");
  assert.equal(persianLetters(`می​خواهم`), `می${ZWNJ}خواهم`, "a zero-width space between letters is the half space");
  assert.equal(persianLetters("کتاب¬ها"), `کتاب${ZWNJ}ها`, "so is the ¬ old keyboards left");
  assert.equal(persianLetters("سلام دنیا"), "سلام دنیا", "a real space stays");
});

test("tapping a word gets the whole word: pieces written apart are joined with the half space", () => {
  // Whisper's pieces: می + خواهم, کتاب + ها. (Times run from the first piece's start to the last one's end.)
  const W = { start: [0, 1, 2, 3, 4], end: [1, 2, 3, 4, 5], seg: [0, 0, 0, 0, 0], text: ["من", "می", "خواهم", "کتاب", "ها."] };
  const out = regroupWords(W, "fa");
  assert.deepEqual(out.text, ["من", `می${ZWNJ}خواهم`, `کتاب${ZWNJ}ها.`]);
  assert.deepEqual(out.start, [0, 1, 3]);
  assert.deepEqual(out.end, [1, 3, 5]);
  assert.equal(joinWords(out.text, "fa"), `من می${ZWNJ}خواهم کتاب${ZWNJ}ها.`);
  // A word already written with its half space is one word as it is; nothing to change gives back the same words.
  const whole = { start: [0, 1], end: [1, 2], seg: [0, 0], text: [`می${ZWNJ}خواهم`, "بروم"] };
  assert.equal(regroupWords(whole, "fa"), whole);
  // Not across sentences (segments), and not a little word on its own.
  const apart = { start: [0, 1], end: [1, 2], seg: [0, 1], text: ["کتاب", "ها"] };
  assert.deepEqual(regroupWords(apart, "fa").text, ["کتاب", "ها"]);
  assert.equal(persianJoins("خانه", "ای"), true, "ای after a silent ه: خانه‌ای 'a house'");
  assert.equal(persianJoins("ای", "خدا"), false, "ای before a word: 'O God'");
  assert.equal(persianJoins("لباس", "تر"), false, "تر is also 'wet'");
  assert.equal(persianJoins("کتاب،", "ها"), false, "not across punctuation");
  assert.equal(persianJoins("نمی", "دانم", false), true, "نمی is never a word alone");
  // In written text (a page, a book) می alone may be "wine" (Hafez): only speech joins it.
  assert.equal(persianJoins("می", "ناب", false), false);
  assert.equal(persianJoins("می", "خواهم", true), true);
  const page = { start: [0, 0, 0], end: [1, 1, 1], seg: [0, 0, 0], text: ["ساقی", "می", "بیار"] };
  assert.deepEqual(regroupWords(page, "fa", false).text, ["ساقی", "می", "بیار"]);
});

test("one Persian word whether written with its half space, without it, or in Arabic letters", () => {
  assert.equal(persianKey("می‌خواهم"), persianKey("میخواهم"));
  assert.equal(persianKey("كتابي"), "کتابی");
  assert.equal(persianKey("کِتاب"), "کتاب", "short-vowel marks come off");
  assert.equal(persianKey("خانهٔ"), "خانه", "the ezafe mark comes off");
  assert.equal(matchKey("می‌خواهم", "fa"), matchKey("میخواهم", "fa"));
  // The lexeme without the table: the spelling, cleaned.
  assert.equal(persianLexeme("«کتاب‌ها»،").key, "fa|کتابها|x");
  assert.equal(persianLexeme("۱۲۳"), null, "a number is no word");
});

test("the word table: every form of a verb is its infinitive", () => {
  const lemma = (w) => persianLexeme(w, table).lemma;
  for (const w of ["می‌خواهم", "میخواهم", "نمی‌خواهم", "خواستم", "بخواهید", "خواسته‌اند"]) assert.equal(lemma(w), "خواستن", w);
  for (const w of ["کرد", "می‌کنم", "کردیم", "بکنید"]) assert.equal(lemma(w), "کردن", w);
  assert.equal(lemma("آمدند"), "آمدن");
  assert.equal(lemma("می‌گه"), "گفتن", "spoken Persian: میگه 'he says'");
  // Verbs the table lists only in part are taken apart: not, می / ب, the stem, the ending.
  for (const w of ["نمی‌نویسند", "بنویسید", "نوشته‌ام"]) assert.equal(lemma(w), "نوشتن", w);
  for (const w of ["فرستادیم", "می‌فرستند"]) assert.equal(lemma(w), "فرستادن", w);
  assert.equal(lemma("بیندازد"), "انداختن", "a stem beginning with a vowel takes ی after ب");
  assert.equal(lemma("بیاورید"), "آوردن");
});

test("the word table: nouns and adjectives with their endings are the word", () => {
  const lemma = (w) => persianLexeme(w, table).lemma;
  assert.equal(lemma("کتاب‌هایم"), "کتاب", "the plural and 'my'");
  assert.equal(lemma("کتابهایم"), "کتاب", "the same, written without the half space");
  assert.equal(lemma("بزرگ‌ترین"), "بزرگ", "the superlative");
  assert.equal(lemma("دانشجویان"), "دانشجو", "the plural -yân");
  assert.equal(lemma("پرندگان"), "پرنده", "the plural -gân of a word ending in ه");
  assert.equal(lemma("خانه‌ای"), "خانه", "'a house'");
  assert.equal(lemma("خانه‌ام"), "خانه", "'my house'");
  assert.equal(lemma("کارم"), "کار", "'my work', not an old form of 'to plant'");
});

test("the word table: words that only look like forms of others stay themselves", () => {
  const lemma = (w) => persianLexeme(w, table).lemma;
  assert.equal(lemma("مردم"), "مردم", "'people', not 'I died'");
  assert.equal(lemma("ایران"), "ایران", "not ایر + the plural");
  assert.equal(lemma("روی"), "روی", "'on', not 'you go'");
  assert.equal(lemma("رود"), "رود", "'river'");
  assert.equal(lemma("تنها"), "تنها", "'alone', not تن + ها");
  assert.equal(persianLemma("", table), null);
  // A sentence's words, as the seen-word marks see them.
  const keys = lexemesFor("من کتاب‌هایم را می‌خواهم".split(" "), "fa", [table]).map((x) => x.key);
  assert.deepEqual(keys, ["fa|من|x", "fa|کتاب|x", "fa|را|x", "fa|خواستن|x"]);
});

test("No AI: the built-in dictionary's meanings, found through the word's dictionary form", () => {
  const define = (word) => {
    const keys = wordKeys(word, "fa", (f) => persianLexeme(f, table).lemma);
    const found = lookUp([meanings], keys, word, "fa");
    return found && answerFrom(found, word, "fa", { source: found.source });
  };
  const want = define("می‌خواهم");
  assert.match(want.meaning, /want/);
  assert.equal(want.vocalized, "xâstan", "how it is said, in the Iranian transcription");
  assert.match(define("کتاب‌هایم").meaning, /book/);
  assert.match(define("كتاب").meaning, /book/, "Arabic letters find the Persian word");
  assert.match(define("مردم").meaning, /people/);
  assert.ok(Object.keys(meanings.words).length > 10000, "Wiktionary's Persian words");
});

test("cards and search: a word is found with or without its half space, in Persian or Arabic letters", () => {
  assert.equal(fold("می‌خواهم"), fold("میخواهم"));
  assert.equal(fold("کتابی"), fold("كتابي"));
  assert.deepEqual(findWord("من می‌خواهم بروم", "میخواهم"), [3, 11]);
  assert.equal(normalize("می‌خواهم"), normalize("ميخواهم"));
  assert.deepEqual(findSpans("ما کتاب‌ها را خواندیم", "کتابها"), [[3, 10]]);
});

test("Discover: Persian podcasts from Afghanistan's and Tajikistan's charts, not Arabic, Urdu or Pashto ones", async () => {
  const { STOREFRONTS, CATEGORY_CHARTS, COUNTRY_NAMES, inLanguage } = await import("../../web/js/trending.js");
  assert.deepEqual(STOREFRONTS.fa, ["af", "tj"], "Apple has no store in Iran");
  assert.ok(CATEGORY_CHARTS.has("fa"));
  assert.equal(COUNTRY_NAMES.af, "Afghanistan");
  const show = (title, author = "", description = "") => ({ title, author, description });
  assert.ok(inLanguage(show("پادکست رخ", "Rokh Podcast"), "fa"));
  assert.ok(inLanguage(show("رادیو راه با مجتبی شکوری", "رادیو راه"), "fa"));
  assert.ok(inLanguage(show("Business Stories", "Reza Tavakoli", "توی پادکست بیزینس استوریز داستان شروع یه کسب و کار رو مرور می‌کنیم."), "fa"));
  assert.ok(inLanguage(show("صلح درون", "سپهر", 'پادكست "صلح درون" با هدف بهبود حال درونى ما توليد مى شود'), "fa"),
    "typed on an Arabic keyboard (ك ي ى), still Persian");
  assert.ok(!inLanguage(show("صندوق الجرائم - النسخة الصوتية", "CRIMES BOX"), "fa"), "Arabic");
  assert.ok(!inLanguage(show("بودكاست قصص من المحاكم", "Courtsstories", "قصص حقيقية من المحاكم في كل حلقة"), "fa"), "Arabic");
  assert.ok(!inLanguage(show("SBS Urdu - ایس بی ایس اردو", "SBS"), "fa"), "Urdu, by its name");
  assert.ok(!inLanguage(show("آزادی کے 75 سال - وائس آف امریکہ", "VOA Urdu"), "fa"), "Urdu, by its letters");
  assert.ok(!inLanguage(show("SBS Pashto - اس بي اس پښتو", "SBS"), "fa"), "Pashto");
  assert.ok(!inLanguage(show("تحریک اسلامی ایک تاریخ ایک داستان", "One Mission"), "fa"), "Urdu's ایک");
  assert.ok(!inLanguage(show("Saghicast", "Mansooreh"), "fa"), "nothing in Arabic letters to judge by");
  // Arabic's own chart still keeps Persian shows out.
  assert.ok(!inLanguage(show("پادکست رخ", "Rokh Podcast"), "ar"));
});

test("YouTube, news and reels have Persian of their own", async () => {
  const { START, COUNTRIES, TOPIC_WORDS, topicsFor, youtubeHome } = await import("../../web/js/youtube-home.js");
  const { newsFor, homeHtml } = await import("../../web/js/browser-home.js");
  assert.deepEqual(START.fa, ["است", "IR", "fa", 0]);
  assert.deepEqual(COUNTRIES.fa.map(([c]) => c), ["IR", "AF"]);
  assert.equal(topicsFor("fa").length, 13, "every topic");
  for (const [key, words] of Object.entries(TOPIC_WORDS.fa)) {
    assert.match(words, /[پچژگکی]|^[؀-ۿ ]+$/, `${key}: ${words}`);
    assert.doesNotMatch(words, /[يك]/, `${key}: Persian letters, not Arabic ones`);
  }
  assert.match(youtubeHome("fa"), /hl=fa/);
  const sites = newsFor("fa");
  assert.ok(sites.length >= 12);
  assert.ok(sites.some((s) => s.url === "https://www.bbc.com/persian"));
  assert.match(homeHtml("fa"), /class="name" lang="fa" dir="rtl"/, "the sites' Persian names right to left");
  // (The reels' Persian search words: tests/test_reels.py checks the phone's list is the computer's.)
});
