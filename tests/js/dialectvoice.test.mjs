// Arabic dialect words said by their own dialect's voice (web/js/dialectvoice.js, used by cardvoice.js,
// voiceplay.js and saytext.js): which voice each dialect gets, how a card's dialect is known, and the
// Iraqi g and ch (گ, چ) reaching Azure's Iraqi voice as IPA it can say.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import {
  COURSE_TITLES, DIALECT_VOICES, IRAQI_IPA, dialectOfCard, dialectVoice, iraqiIpa, iraqiSound, iraqiSsml, plainWord,
  standardGch, voiceSsmlText,
} from "../../web/js/dialectvoice.js";
import { AZURE_BY_COUNTRY, azureVoiceFor, buildSsml } from "../../web/js/cardvoice.js";
import { ARABIC_VARIETIES, cardOf } from "../../web/js/coursedata.js";
import { deckSource } from "../../web/js/dli.js";
import { sayable } from "../../web/js/grammardata.js";
import { readSounds } from "../../tools/course/ar-irq/make.mjs";

const at = (p) => new URL(`../../${p}`, import.meta.url);
const read = (p) => readFileSync(at(p), "utf8");

// ----- which voice -----

test("Iraqi, Levantine, Egyptian and Gulf words get a voice of their own dialect", () => {
  assert.equal(azureVoiceFor("ar", { dialect: "irq" }), "ar-IQ-BasselNeural");
  assert.equal(azureVoiceFor("ar", { dialect: "lev" }), "ar-SY-AmanyNeural");
  assert.equal(azureVoiceFor("ar", { dialect: "egy" }), "ar-EG-SalmaNeural");
  assert.equal(azureVoiceFor("ar", { dialect: "glf" }), "ar-SA-HamedNeural");
  assert.equal(azureVoiceFor("ar", { dialect: "" }), "ar-SA-ZariyahNeural", "Standard Arabic as before");
  assert.equal(azureVoiceFor("ar", { dialect: "mor" }), "ar-SA-ZariyahNeural", "Moroccan: no voice says it well, the usual one");
  assert.equal(azureVoiceFor("ar", { dialect: "mor", country: "MA" }), "ar-MA-MounaNeural");
  assert.equal(azureVoiceFor("es", { dialect: "irq" }), "es-MX-DaliaNeural", "only Arabic has dialect voices");
});

test("the word's own dialect beats a voice or country chosen for another one", () => {
  // Someone learning Iraqi and Levantine: each card in its own, whatever else is set.
  const picked = { ar: "ar-SA-HamedNeural" };
  assert.equal(azureVoiceFor("ar", { picked, dialect: "irq" }), "ar-IQ-BasselNeural");
  assert.equal(azureVoiceFor("ar", { picked, dialect: "lev" }), "ar-SY-AmanyNeural");
  assert.equal(azureVoiceFor("ar", { picked, dialect: "" }), "ar-SA-HamedNeural", "a Standard Arabic card keeps the pick");
  assert.equal(azureVoiceFor("ar", { country: "EG", dialect: "irq" }), "ar-IQ-BasselNeural");
  // ...but a choice that is of the word's dialect is kept.
  assert.equal(azureVoiceFor("ar", { country: "LB", dialect: "lev" }), "ar-LB-LaylaNeural", "Lebanon picked: a Lebanese voice");
  assert.equal(azureVoiceFor("ar", { country: "JO", dialect: "lev" }), "ar-JO-SanaNeural");
  assert.equal(azureVoiceFor("ar", { picked: { ar: "ar-LB-RamiNeural" }, dialect: "lev" }), "ar-LB-RamiNeural");
  assert.equal(azureVoiceFor("ar", { picked: { ar: "ar-EG-ShakirNeural" }, dialect: "egy" }), "ar-EG-ShakirNeural");
  assert.equal(azureVoiceFor("ar", { picked: { ar: "<b>" }, dialect: "egy" }), "ar-EG-SalmaNeural", "a bad pick is ignored");
  assert.equal(dialectVoice("xyz"), null);
});

test("Iraq's country voice is Bassel, who says the Baghdad g (Rana says it as j)", () => {
  assert.equal(AZURE_BY_COUNTRY.ar.IQ, "ar-IQ-BasselNeural");
  assert.equal(azureVoiceFor("ar", { country: "IQ" }), "ar-IQ-BasselNeural");
});

test("each dialect's voice is the one its basics course was recorded with, from one of its countries", () => {
  for (const [d, { voice, countries }] of Object.entries(DIALECT_VOICES)) {
    assert.ok(ARABIC_VARIETIES.some((v) => v.id === d), `${d} is a dialect the courses teach`);
    assert.ok(countries.includes(voice.split("-")[1]), voice);
    for (const c of countries) assert.ok(AZURE_BY_COUNTRY.ar[c], `${c} has a voice`);
    const course = JSON.parse(read(`docs/course/ar-${d}/course.json`));
    const name = voice.split("-")[2].replace(/Neural$/, "");
    assert.ok(course.voice && course.voice.name.startsWith(`${name} (Azure,`), `${d}: the course says ${course.voice && course.voice.name}`);
  }
  const mor = JSON.parse(read("docs/course/ar-mor/course.json"));
  assert.equal(mor.voice, null, "Moroccan has no voice in its course either");
  assert.ok(!DIALECT_VOICES.mor);
});

// ----- which cards are dialect -----

test("a card from a dialect's basics course is that dialect; the Standard course and DLI decks are Standard", () => {
  for (const name of readdirSync(at("docs/course")).filter((n) => /^ar(-\w+)?$/.test(n))) {
    const course = JSON.parse(read(`docs/course/${name}/course.json`));
    const card = cardOf({ word: "x", n: 13 }, course);
    assert.equal(dialectOfCard(card), course.dialect || "", `${name}: ${card.source}`);
    assert.equal(COURSE_TITLES[course.title], course.dialect || "", `${course.title} is listed`);
  }
  // The list as the Vocab page has it: the source comes back as episode_title.
  assert.equal(dialectOfCard({ text: "شكو", episode_title: "Iraqi basics · word 7", language: "ar" }), "irq");
  const dli = deckSource({ short: "DLI Arabic" }, { title: "Chapter 1 (Unit 1)" }, 209);
  assert.equal(dialectOfCard({ text: "كتاب", source: dli }), "");
  assert.equal(dialectOfCard({ text: "شلونك" }), null, "a typed word: not known (the dialect chosen in Courses decides)");
  assert.equal(dialectOfCard({ text: "x", episode_title: "Some podcast" }), null);
  assert.equal(dialectOfCard({ text: "x", episode_title: "Levantine basics" }), null, "not a course word's source");
  assert.equal(dialectOfCard({ text: "hola", language: "es", source: "Iraqi basics · word 1" }), "", "not Arabic");
});

test("cards follow the dialect chosen in Library → Courses when their own isn't known (voiceplay.js)", () => {
  const src = read("web/js/voiceplay.js");
  assert.match(src, /const dialect = cardDialect\(v\);\s*const voice = await azureVoiceOf\(lang, s, dialect\)/, "a card's voice uses its dialect");
  assert.match(src, /known === null \? chosenDialect\(\) : known/);
  assert.match(src, /localStorage\.getItem\(VARIETY_KEY\)/);
  assert.match(src, /speakDevice\(standardGch\(text, lang\), lang\)/, "the device's voice gets ق / ك, not silence");
  // A grammar lesson's examples are said in its course's dialect.
  assert.match(read("web/js/components/grammarpanel.js"), /sayText\(text, lang, \{ dialect: choice\.dialect \|\| "" \}\)/);
  const say = read("web/js/saytext.js");
  assert.match(say, /azureUrl\(raw, lang, s, dialect\)/, "Azure gets the text with گ / چ, to say them");
  assert.match(say, /azureVoiceOf\(lang, s, dialect\)/);
});

// ----- the Iraqi g and ch -----

test("the Iraqi sound list here is the Iraqi course's own (tools/course/ar-irq/sounds.tsv)", () => {
  assert.deepEqual(IRAQI_IPA, readSounds());
});

test("a vowelled Iraqi word's sound is worked out from its marks", () => {
  const cases = {
    "گَال": "gaːl", "چِبِير": "tʃibiːr", "گَالَت": "gaːlat", "شْلَوْنِچ": "ʃloːnitʃ", "بَيْتِچ": "beːtitʃ", "چَان": "tʃaːn",
    "السُّوگ": "ʔissuːgg", "لِلسُّوگ": "lissuːgg", "گْرِيب": "griːb", "گَلُب": "galub", "تِحْچِي": "tiħtʃi",
    "گَالَوْا": "gaːlaw", "الْچَاي": "ʔiltʃaːj", "گْعَدْنَا": "gʕadna", "شْگَدّ": "ʃgadd", "وِيَّاچ": "wijjaːtʃ",
    "حِچَى": "ħitʃa", "دَوْشَگ": "doːʃagg", "مَگْطُوع": "magtˤuːʕ",
  };
  for (const [word, ipa] of Object.entries(cases)) assert.equal(iraqiIpa(word), ipa, word);
  assert.equal(iraqiIpa("گال"), null, "no vowel marks: can't tell");
  assert.equal(iraqiIpa("چبير"), null);
  assert.equal(iraqiIpa("گَالx"), null, "a letter it doesn't know");
});

test("nearly every Iraqi word with گ or چ in the courses can be said: the list, else its vowel marks", () => {
  const text = read("tools/grammar/en-ar-irq/lessons.json") + read("docs/course/ar-irq/course.json");
  const words = [...new Set([...text.matchAll(/[ء-ٰٟ-ۓ]+/g)].map((m) => m[0]).filter((w) => /[گچ]/.test(w)))];
  assert.ok(words.length > 50);
  const unsaid = words.filter((w) => !iraqiSound(w) && /[ً-ْ]/.test(w));
  assert.deepEqual(unsaid, [], "every vowelled one");
  assert.ok(words.filter((w) => iraqiSound(w)).length >= words.length - 3);
  assert.equal(iraqiSound("أحچي"), "aħtʃi", "the hand-checked sound first");
  assert.equal(iraqiSound("أَحْچِي"), "aħtʃi", "found without its marks");
});

test("Iraqi text for Azure's Iraqi voice: those words in IPA, the rest as written and made safe", () => {
  const ssml = iraqiSsml("رَايْحَة لِلسُّوگ & چِبِير؟ گال");
  assert.ok(ssml.startsWith("رَايْحَة "), "a word without گ / چ is left alone");
  assert.ok(ssml.includes('<phoneme alphabet="ipa" ph="lissuːg">لِلسُّوگ</phoneme>'), "the course's own sound");
  assert.ok(ssml.includes(" &amp; "));
  assert.ok(ssml.includes('<phoneme alphabet="ipa" ph="tʃibiːr">چِبِير</phoneme>؟'), "worked out, punctuation outside");
  assert.ok(ssml.endsWith(" قال"), "no marks to tell its sound: ق, which the voice says, not silence");
  assert.equal(iraqiSsml('<x "y">'), "&lt;x &quot;y&quot;&gt;");
});

test("every Arabic voice is sent what it can say: Iraqi IPA, or ق / ك; Persian keeps its letters", () => {
  const iq = buildSsml("گَال", "ar-IQ-BasselNeural");
  assert.match(iq, /xml:lang="ar-IQ"/);
  assert.ok(iq.includes('<phoneme alphabet="ipa" ph="gaːl">گَال</phoneme></voice></speak>'));
  assert.ok(buildSsml("گَال", "ar-IQ-RanaNeural").includes("<phoneme"), "any Iraqi voice (a learner may pick Rana)");
  assert.ok(buildSsml("گَال", "ar-SA-ZariyahNeural").includes(">قَال</voice>"), "a Saudi voice would skip گ");
  assert.ok(buildSsml("گل", "fa-IR-DilaraNeural").includes(">گل</voice>"), "Persian: گ is its own letter");
  assert.equal(voiceSsmlText("Tom & Jerry", "en-US-JennyNeural"), "Tom &amp; Jerry");
  assert.equal(standardGch("گچ"), "قك");
  assert.equal(standardGch("گچ", "fa"), "گچ");
  for (const t of ["گَال: الْبَيْت چِبِير.", "شلونك", "گل"]) for (const l of ["ar", "fa"]) assert.equal(standardGch(t, l), sayable(t, l));
  assert.equal(plainWord("لِلسُّوگ"), "للسوگ");
});

// ----- Settings → Card voices says what a dialect word is read by -----

test("Settings → Card voices says which voice reads each dialect, and that only Azure has them", () => {
  const src = read("web/js/components/voicesetup.js");
  assert.match(src, /lang === "ar" \? `<p class="set-hint vo-dialects" id="vo-dialects" data-find="dialectvoices">/);
  assert.match(src, /Iraqi by Bassel \(Iraq\), who says the Iraqi g and ch/);
  assert.match(src, /speak Standard Arabic only, so they read dialect words the Standard way/);
  assert.match(read("web/js/components/settingsui.js"), /id: "dialectvoices", label: "Arabic dialect voices"[^\n]*langs: \["ar"\]/);
});
