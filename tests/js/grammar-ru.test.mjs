// The two Russian grammar courses (tools/grammar/en-ru, tools/grammar/ru-en): what the shared checks
// (tests/js/grammar.test.mjs) can't see. en-ru: every Russian word of two or more syllables has its stress
// mark, every reading is made from its Cyrillic, no word mixes Latin and Cyrillic letters. ru-en: the
// English is American English with no Cyrillic in it, and the Russian explanations have no stress marks
// (Russians don't write them) and no Latin letters inside Russian words.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { reading, russianTexts, stressProblems, withReadings } from "../../tools/grammar/en-ru/readings.mjs";
import { explanationTexts, parseRich } from "../../web/js/grammardata.js";

const path = (id) => new URL(`../../tools/grammar/${id}/lessons.json`, import.meta.url);
const load = (id) => JSON.parse(readFileSync(path(id), "utf8"));
/** The explanation-language part of a text (outside its {{ }} pieces). */
const own = (s) => parseRich(s).filter((p) => p.kind === "text").map((p) => p.text).join(" ");

/** British words and spellings, where the courses use American English (apartment, mom, color…). */
const BRITISH_SPELLING = /\b(colour\w*|favourite\w*|centre|centres|theatre|theatres|metres?|litres?|reali[sz]e?s?\b|realis\w+|organis\w+|recognis\w+|apologis\w+|travelled|travelling|travellers?|cancelled|programme\w*|grey|jewellery|cheque\w*|tyres?|licence|practise[sd]?|learnt|spelt|whilst|amongst)\b/i;
const BRITISH_WORDS = /\b(mum|mums|mummy|holidays?|queue\w*|rubbish|petrol|biscuits?|lorry|lorries|motorway|cinema|cinemas|postcode|maths|trainers|mobile phone|timetable|fortnight|underground|pavement|chemist's|flatmate|ground floor)\b/i;

test("a reading is the Cyrillic in Latin letters, with the stress, said as it is said", () => {
  const cases = [
    ["Здра́вствуйте! Меня́ зову́т А́нна.", "Zdrástvuyte! Menyá zovút Ánna."],
    ["Что э́то?", "Shto éto?"],
    ["Его́ нет до́ма.", "Yevó net dóma."],
    ["Сего́дня ску́чно, коне́чно.", "Sevódnya skúshno, konéshno."],
    ["Мне нра́вится учи́ться.", "Mne nrávitsa uchítsa."],
    ["Ещё всё её. Пётр идёт. Жёлтый.", "Yeshchó vsyo yeyó. Pyotr idyót. Zhóltyy."],
    ["Мно́го но́вого.", "Mnógo nóvovo."],
    ["семья́, съесть", "sem'yá, syest'"],
    ["Ты говори́шь по-ру́сски?", "Ty govorísh' po-rússki?"],
    ["-ешь, -ю", "-esh', -yu"],
    ["Мо́жно счёт? Мужчи́на.", "Mózhno shchot? Mushchína."],
  ];
  for (const [t, r] of cases) assert.equal(reading(t), r, t);
});

test("the stress check finds missing, doubled and stray marks, and Latin letters inside Russian words", () => {
  assert.deepEqual(stressProblems("Я живу́ в Москве́. Я не́ был там. Его́ не́ было. Всё. Ещё. -ами, при-"), []);
  assert.deepEqual(stressProblems("Я живу в Москве́."), ["живу: no stress mark"]);
  assert.deepEqual(stressProblems("я́"), ["я́: a stress mark on a word of one syllable"]);
  assert.deepEqual(stressProblems("мо́локо́"), ["мо́локо́: too many stress marks"]);
  assert.deepEqual(stressProblems("е́щё"), ["е́щё: ё and a stress mark"]);
  assert.ok(stressProblems("Кнóга").some((p) => /mixed/.test(p)), "a Latin ó inside a Russian word");
});

if (existsSync(path("en-ru"))) {
  const course = load("en-ru");

  test("en-ru: every Russian word of two or more syllables carries its stress mark", () => {
    const bad = [];
    for (const l of course.lessons) for (const t of russianTexts(l)) for (const p of stressProblems(t)) bad.push(`${l.id}: ${p}`);
    assert.deepEqual([...new Set(bad)], []);
  });

  test("en-ru: every reading is made from its Cyrillic (node tools/grammar/en-ru/readings.mjs)", () => {
    for (const l of course.lessons) assert.deepEqual(l, withReadings(l), `${l.id}: run node tools/grammar/en-ru/readings.mjs`);
  });

  test("en-ru: the explanations are in American spelling, with no Russian outside {{ }}", () => {
    const bad = [];
    for (const l of course.lessons) {
      for (const { text } of explanationTexts(l)) {
        const mine = own(text);
        if (BRITISH_SPELLING.test(mine)) bad.push(`${l.id}: British spelling in “${mine.slice(0, 60)}”`);
        if (/[А-Яа-яЁё]/.test(mine)) bad.push(`${l.id}: Russian outside {{ }} in “${mine.slice(0, 60)}”`);
      }
    }
    assert.deepEqual(bad, []);
  });
}

if (existsSync(path("ru-en"))) {
  const course = load("ru-en");

  test("ru-en: the English is American English, with no Cyrillic in it", () => {
    const bad = [];
    for (const l of course.lessons) {
      for (const t of russianTexts(l)) { // (the texts in the language taught: here, English)
        if (/[А-Яа-яЁё]/.test(t)) bad.push(`${l.id}: Cyrillic in the English “${t}”`);
        const m = t.match(BRITISH_SPELLING) || t.match(BRITISH_WORDS);
        if (m) bad.push(`${l.id}: British “${m[0]}” in “${t}”`);
      }
    }
    assert.deepEqual(bad, []);
  });

  test("ru-en: the Russian explanations have no stress marks and no Latin letters inside Russian words", () => {
    const bad = [];
    for (const l of course.lessons) {
      for (const { text } of explanationTexts(l)) {
        const mine = own(text);
        if (mine.includes("́")) bad.push(`${l.id}: a stress mark in “${mine.slice(0, 60)}”`);
        for (const p of stressProblems(mine).filter((x) => /mixed/.test(x))) bad.push(`${l.id}: ${p}`);
      }
    }
    assert.deepEqual(bad, []);
  });
}
