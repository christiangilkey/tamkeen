// Run with: node --test tests/js/
// The part of a card's word the Mnemonic maker matches (review/wordcore.js soundCore): each study language's little
// words and pieces left out (articles, markers, "to"/"zu", reflexives, light verbs, Arabic's و ف ب ك ل before ال),
// what learners type round a word (brackets, other forms, pairs, labels, stand-ins), the words that keep theirs, and
// the wiring: the free maker's sounds, the AI's prompt, the learner's own keywords, the phone build.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { CORE_LANGS, corePromptLine, kindName, leftOutLine, leftWordParts, soundCore } from "../../web/js/review/wordcore.js";
import { ExamplePack } from "../../web/js/lexicon/exampledata.js";
import { matchKey } from "../../web/js/lexicon/meaningdata.js";
import { pronunciationOf } from "../../web/js/review/soundout.js";
import { makeMnemonics, mnemonicPrompt } from "../../web/js/review/mnemonic.js";
import { judgeOwn } from "../../web/js/review/ownmnemonic.js";

const read = (rel) => readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8");
const packs = {};
const pack = (lang) => (packs[lang] ||= new ExamplePack(JSON.parse(gunzipSync(readFileSync(new URL(`../../docs/lexicon/${lang}-examples.json.gz`, import.meta.url)))), lang));
// (the free maker's word list, as examples.js knowsWord makes it)
const dict = (lang) => (form) => { const k = matchKey(form, lang); return !!(pack(lang).ipa[k] || (pack(lang).words[k] || []).length); };
const core = (text, lang, opts) => soundCore(text, lang, opts).core;
const parts = (text, lang, opts) => soundCore(text, lang, opts).dropped.map((d) => `${d.part}:${d.kind}`);
/** The same word back, nothing left out. */
function same(text, lang, opts) {
  const r = soundCore(text, lang, opts);
  assert.equal(r.core, text.trim(), `${lang} ${text}`);
  assert.deepEqual(r.dropped, [], `${lang} ${text}`);
}

test("every study language has rules; other languages and plain words come back as they are", () => {
  const study = [...read("web/js/languages.js").matchAll(/^ {2}([a-z]{2,3}): \{/gm)].map((m) => m[1]);
  assert.ok(study.length >= 18);
  for (const code of study) assert.ok(CORE_LANGS.has(code), code);
  assert.deepEqual(soundCore("foo (bar)", "xx"), { core: "foo (bar)", reading: "", dropped: [] });
  assert.deepEqual(soundCore("", "ar"), { core: "", reading: "", dropped: [] });
  for (const [lang, w] of [["es", "perro"], ["ar", "كتاب"], ["de", "Hund"], ["fr", "maison"], ["it", "casa"], ["pt", "livro"], ["ca", "casa"],
    ["en", "house"], ["la", "puella"], ["ru", "книга"], ["ja", "猫"], ["zh", "你好"], ["ko", "학교"], ["hi", "किताब"], ["fa", "کتاب"],
    ["th", "แมว"], ["tl", "bahay"], ["ceb", "balay"]]) same(w, lang);
  // the reading of a plain word comes back too
  assert.equal(soundCore("كتاب", "ar", { reading: "كِتَاب" }).reading, "كِتَاب");
});

// ---------------------------------------------------------------- Arabic

test("Arabic: ال, with its vowel marks, hamzat al-wasl and tatweel, and the sun letters' shadda", () => {
  const r = soundCore("الكتاب", "ar");
  assert.equal(r.core, "كتاب");
  assert.deepEqual(r.dropped, [{ part: "ال", kind: "article", note: "“the”", label: "al-", extra: false }]);
  assert.deepEqual(soundCore("اَلْكِتَابُ", "ar", { reading: "اَلْكِتَابُ" }), { core: "كِتَابُ", reading: "كِتَابُ", dropped: r.dropped });
  assert.equal(soundCore("الكتاب", "ar", { reading: "اَلْكِتَابُ" }).reading, "كِتَابُ");
  // الشَّمْس: the doubled sh is the article's sound, so شمس without it has no shadda
  assert.deepEqual([soundCore("الشمس", "ar", { reading: "الشَّمْسُ" }).core, soundCore("الشمس", "ar", { reading: "الشَّمْسُ" }).reading], ["شمس", "شَمْسُ"]);
  assert.equal(core("الشَّمْس", "ar"), "شَمْس");
  assert.equal(soundCore("اللغة", "ar", { reading: "اللُّغَة" }).reading, "لُغَة");
  assert.equal(core("ٱلْكِتَاب", "ar"), "كِتَاب");
  assert.equal(core("الـكتاب", "ar"), "كتاب");
  assert.equal(core("الأب", "ar"), "أب");     // two letters left is enough
  // a reading with other letters can't be cut: worked out again for the core
  assert.equal(soundCore("الكتاب", "ar", { reading: "اَلْكُتُبُ" }).reading, "");
});

test("Arabic: و ف before ال, ب ك ل before it (لل), and لِلَّيْل's merged lam", () => {
  assert.equal(core("والكتاب", "ar"), "كتاب");
  assert.deepEqual(parts("فالكتاب", "ar"), ["ف:conjunction", "ال:article"]);
  assert.deepEqual(parts("بالكتاب", "ar"), ["ب:preposition", "ال:article"]);
  assert.equal(core("كالعادة", "ar"), "عادة");
  assert.deepEqual(parts("وبالكتاب", "ar"), ["و:conjunction", "ب:preposition", "ال:article"]);
  assert.equal(leftOutLine(soundCore("وبالكتاب", "ar")), "wa- (“and”), bi- (“with, by, in”), al- (“the”) left out");
  assert.deepEqual([core("للكتاب", "ar"), ...parts("للكتاب", "ar")], ["كتاب", "ل:preposition", "ال:article"]);
  assert.equal(core("وللكتاب", "ar"), "كتاب");
  // لِ + اللَّيْل is written لِلَّيْل: the second lam is the word's (the shadda says so, or a dictionary, or غة is no word)
  assert.deepEqual([soundCore("لليل", "ar", { reading: "لِلَّيْلِ" }).core, soundCore("لليل", "ar", { reading: "لِلَّيْلِ" }).reading], ["ليل", "لَيْلِ"]);
  assert.equal(core("للغة", "ar"), "لغة");
  assert.equal(core("لليل", "ar", { isWord: dict("ar") }), "ليل");
  assert.equal(core("للبيت", "ar", { isWord: dict("ar") }), "بيت");
  assert.equal(core("بالأب", "ar"), "أب");
});

test("Arabic: words where ال is the word's own, or only looks like the article, keep it", () => {
  // the article is part of the word: now, today, the relatives, God
  for (const w of ["الآن", "الان", "اليوم", "البارحة", "الحين", "البتة", "الذي", "الذى", "التي", "التى", "الذين", "اللذان", "اللتان", "اللذين",
    "اللتين", "اللاتي", "اللواتي", "اللائي", "اللي", "اللى", "الله", "اللهم", "والله", "بالله", "تالله", "لله", "ولله"]) same(w, "ar");
  // only looks like it: pain, thousand, machine, hello, colours, games, album, Germany, electronic, inspiration, to, except …
  for (const w of ["ألم", "الم", "ألف", "الف", "آلة", "الة", "الو", "ألو", "الوان", "ألوان", "العاب", "الفاظ", "البوم", "المانيا", "الماني",
    "الكتروني", "الهام", "الهي", "الهة", "الغاء", "القاء", "الطف", "القى", "اليف", "اليم", "الات", "الاف", "الى", "إلى", "الا", "إلا", "اليس"]) same(w, "ar");
  // افتعل verbs and their nouns from roots beginning with ل: met, commitment, inflammation …
  for (const w of ["التقى", "التقاء", "التزام", "التزم", "التهاب", "التفات", "التحق", "التصق", "التماس"]) same(w, "ar");
  // وال, بال that are the word's own letters: father, mother, parents, balloon, ballet
  for (const w of ["والد", "والدة", "والدين", "والدتي", "بالون", "باليه"]) same(w, "ar");
  // and a word with hamza is never the article (أل)
  same("ألكسندر", "ar");
});

test("Arabic: at least two letters stay; risky strips only with the dictionary's yes", () => {
  same("ال", "ar");
  same("الم", "ar");
  same("فال", "ar");
  // bare و ف ب ك ل: the word's own first letter as often as not (ولد boy, فيل elephant, بيت house, كلب dog)
  same("وكتاب", "ar");
  same("ولد", "ar", { isWord: dict("ar") });
  same("فيل", "ar", { isWord: dict("ar") });
  same("بيت", "ar", { isWord: dict("ar") });
  same("كلب", "ar", { isWord: dict("ar") });      // (لب "core" is a word too, but كلب is the dictionary's)
  assert.deepEqual([core("وكتاب", "ar", { isWord: dict("ar") }), ...parts("وكتاب", "ar", { isWord: dict("ar") })], ["كتاب", "و:conjunction"]);
  assert.equal(core("وبيت", "ar", { isWord: (w) => ["بيت"].includes(w) }), "بيت");
  // the dictionary knows the whole and not the rest: the dictionary's own word (الوان, التراب is the article's)
  same("الوان", "ar", { isWord: dict("ar") });
  assert.equal(core("التراب", "ar", { isWord: dict("ar") }), "تراب");
  // two letters after و/ب + ال only with a yes: بالأب; not بالون-like words the dictionary doesn't know
  assert.equal(core("والدم", "ar", { isWord: (w) => w === "دم" }), "دم");
  same("والدم", "ar", { isWord: () => false });
  same("بالغة", "ar");
  // an isWord that throws is a "no"
  same("وكتاب", "ar", { isWord: () => { throw new Error("x"); } });
});

test("Arabic: phrases keep their articles; the plural after ج and a form after a comma go", () => {
  same("الكتاب الأحمر", "ar");
  same("صباح الخير", "ar");
  assert.deepEqual([core("كتاب ج كتب", "ar"), ...parts("كتاب ج كتب", "ar")], ["كتاب", "ج كتب:forms"]);
  assert.equal(core("كتاب (ج) كتب", "ar"), "كتاب");
  assert.equal(core("كتاب ج. كتب", "ar"), "كتاب");
  assert.equal(core("الكتاب ج الكتب", "ar"), "كتاب");
  assert.equal(core("ولد، أولاد", "ar"), "ولد");
  assert.equal(core("كتاب، كتب", "ar"), "كتاب");
  same("نعم، شكرا", "ar");   // a phrase: شكرا is no form of نعم
  assert.equal(leftOutLine(soundCore("ولد، أولاد", "ar")), "Only “ولد” is matched.");
});

// ---------------------------------------------------------------- the other languages

test("German: articles (and r/e/s), zu before a verb, sich, plural notes and labels", () => {
  assert.deepEqual([core("der Hund, -e", "de"), ...parts("der Hund, -e", "de")], ["Hund", "-e:forms", "der:article"]);
  assert.equal(leftOutLine(soundCore("der Hund, -e", "de")), "der (“the”) left out");
  assert.equal(core("das Haus, Häuser", "de"), "Haus");
  assert.equal(core("die Frau, -en", "de"), "Frau");
  assert.equal(core("der Hund, -(e)s, -e", "de"), "Hund");
  assert.equal(core("Hund, der", "de"), "Hund");
  assert.equal(core("Hund (m)", "de"), "Hund");
  assert.equal(core("Hund m", "de"), "Hund");
  assert.equal(core("die Eltern Pl.", "de"), "Eltern");
  assert.equal(core("eine Katze", "de"), "Katze");
  assert.equal(core("r Hund", "de"), "Hund");
  assert.equal(core("e Frau", "de"), "Frau");
  assert.equal(core("der hund", "de"), "hund");
  same("das ist", "de");           // a verb after das: no noun
  same("die", "de");
  assert.deepEqual([core("zu essen", "de"), ...parts("zu essen", "de")], ["essen", "zu:infinitive"]);
  same("zu Hause", "de");          // a preposition before a noun
  same("zu viel", "de");
  assert.deepEqual([core("sich freuen", "de"), ...parts("sich freuen", "de")], ["freuen", "sich:reflexive"]);
  assert.equal(core("sich (Dat.) etw. merken", "de"), "merken");
  assert.equal(core("an|fangen", "de"), "anfangen");
  assert.equal(core("Hun·de", "de"), "Hunde");
});

test("English: the, a, an, to before a verb, a dictionary's sb / sth / oneself", () => {
  assert.equal(core("the house", "en"), "house");
  assert.equal(core("an apple", "en"), "apple");
  assert.equal(core("a cat", "en"), "cat");
  assert.deepEqual([core("to go", "en"), ...parts("to go", "en")], ["go", "to:infinitive"]);
  assert.equal(core("to be", "en"), "be");
  same("to the left", "en");
  same("to London", "en");
  same("a lot", "en");
  same("The Beatles", "en");
  same("the", "en");
  assert.equal(core("look after sb", "en"), "look after");
  assert.equal(core("to wash oneself", "en"), "wash");
  assert.equal(core("give up sth", "en"), "give up");   // the particle of a phrasal verb stays
});

test("Spanish, French, Italian, Portuguese, Catalan: articles, reflexives, names and expressions", () => {
  // Spanish
  assert.equal(core("el perro", "es"), "perro");
  assert.equal(core("las casas", "es"), "casas");
  assert.equal(core("unos amigos", "es"), "amigos");
  same("La Paz", "es");
  same("El Salvador", "es");
  same("el que", "es");
  same("lo siento", "es");         // lo is no article here
  assert.deepEqual([core("lavarse", "es"), ...parts("lavarse", "es")], ["lavar", "-se:reflexive"]);
  assert.equal(core("irse", "es"), "ir");
  assert.equal(core("acordarse de algo", "es"), "acordar de algo");
  same("clase", "es");
  // French
  assert.equal(core("le chat", "fr"), "chat");
  assert.equal(core("une maison", "fr"), "maison");
  assert.deepEqual([core("l'homme", "fr"), ...parts("l'homme", "fr")], ["homme", "l':article"]);
  assert.equal(core("l’école", "fr"), "école");
  assert.equal(core("de la confiture", "fr"), "confiture");
  assert.equal(core("de l'eau", "fr"), "eau");
  assert.equal(core("du pain", "fr"), "pain");
  assert.equal(core("des pommes", "fr"), "pommes");
  assert.equal(core("se laver", "fr"), "laver");
  assert.equal(core("s'appeler", "fr"), "appeler");
  same("s'il vous plaît", "fr");
  same("d'accord", "fr");
  same("Le Havre", "fr");
  assert.equal(core("chat nm", "fr"), "chat");
  // Italian
  assert.equal(core("il libro", "it"), "libro");
  assert.equal(core("lo zaino", "it"), "zaino");
  assert.equal(core("lo studente", "it"), "studente");
  same("lo so", "it");             // "I know it"
  assert.equal(core("gli amici", "it"), "amici");
  assert.equal(core("l'acqua", "it"), "acqua");
  assert.equal(core("un'amica", "it"), "amica");
  assert.deepEqual([core("lavarsi", "it"), ...parts("lavarsi", "it")], ["lavare", "-si:reflexive"]);
  assert.equal(core("mettersi", "it"), "mettere");
  assert.equal(core("vestirsi", "it"), "vestire");
  assert.equal(core("porsi", "it"), "porre");
  assert.equal(core("tradursi", "it"), "tradurre");
  for (const w of ["diversi", "versi", "persi", "corsi", "scarsi", "orsi"]) same(w, "it");
  assert.equal(core("lavarsi", "it", { isWord: dict("it") }), "lavare");
  // Portuguese
  assert.equal(core("o livro", "pt"), "livro");
  assert.equal(core("a casa", "pt"), "casa");
  assert.equal(core("uma mesa", "pt"), "mesa");
  same("o que", "pt");
  assert.equal(core("lavar-se", "pt"), "lavar");
  // Catalan
  assert.equal(core("el gos", "ca"), "gos");
  assert.equal(core("l'home", "ca"), "home");
  assert.equal(core("els nens", "ca"), "nens");
  assert.equal(core("rentar-se", "ca"), "rentar");
  assert.equal(core("creure's", "ca"), "creure");
  assert.equal(core("anar-se'n", "ca"), "anar");
  same("col·legi", "ca");          // the middle dot is a Catalan letter's
  same("en Joan", "ca");           // the article before names is left alone
});

test("Tagalog and Bisaya: ang, ng, sa, si, mga, usa ka, po", () => {
  assert.deepEqual([core("ang bahay", "tl"), ...parts("ang bahay", "tl")], ["bahay", "ang:marker"]);
  assert.deepEqual([core("ang mga bata", "tl"), ...parts("ang mga bata", "tl")], ["bata", "ang:marker", "mga:plural"]);
  assert.equal(leftOutLine(soundCore("ang mga bata", "tl")), "ang (the topic marker), mga (the plural marker) left out");
  assert.equal(core("ng bahay", "tl"), "bahay");
  assert.equal(core("sa bahay", "tl"), "bahay");
  assert.equal(core("si Maria", "tl"), "Maria");
  assert.equal(core("salamat po", "tl"), "salamat");
  same("mga", "tl");
  same("opo", "tl");
  same("bahay", "tl");
  assert.equal(core("ang balay", "ceb"), "balay");
  assert.equal(core("mga bata", "ceb"), "bata");
  assert.deepEqual([core("usa ka balay", "ceb"), ...parts("usa ka balay", "ceb")], ["balay", "usa ka:article"]);
  assert.equal(core("sa balay", "ceb"), "balay");
  same("usa", "ceb");
});

test("Japanese: する after a noun, をする, です; お茶 and 愛する keep theirs", () => {
  assert.deepEqual(soundCore("勉強する", "ja", { reading: "べんきょうする" }), { core: "勉強", reading: "べんきょう",
    dropped: [{ part: "する", kind: "light-verb", note: "“to do”", label: "する", extra: false }] });
  assert.equal(soundCore("勉強する", "ja", { reading: "benkyousuru" }).reading, "benkyou");
  assert.equal(core("コピーする", "ja"), "コピー");
  assert.equal(core("勉強します", "ja"), "勉強");
  assert.deepEqual([core("電話をする", "ja"), ...parts("電話をする", "ja")], ["電話", "を:marker", "する:light-verb"]);
  assert.equal(core("学生です", "ja"), "学生");
  same("愛する", "ja");             // one kanji + する is said as one verb
  same("する", "ja");
  same("です", "ja");
  same("お茶", "ja");               // お is how the word is said
  same("ご飯", "ja");
  assert.equal(core("〜について", "ja"), "について");
  assert.equal(core("勉強（べんきょう）", "ja"), "勉強");
});

test("Korean: 하다 after a noun, 되다; 좋아하다 and (without a dictionary) 말하다 keep theirs", () => {
  assert.deepEqual(soundCore("공부하다", "ko", { reading: "gongbuhada" }), { core: "공부", reading: "gongbu",
    dropped: [{ part: "-하다", kind: "light-verb", note: "“to do”", label: "-하다", extra: false }] });
  assert.equal(soundCore("생각하다", "ko", { reading: "saenggakada" }).reading, "saenggak");
  assert.equal(soundCore("공부하다", "ko", { reading: "공부하다" }).reading, "공부");
  assert.equal(core("운동하다", "ko"), "운동");
  assert.equal(core("깨끗하다", "ko"), "깨끗");
  assert.equal(core("시작되다", "ko"), "시작");
  assert.equal(core("공부를 하다", "ko"), "공부");
  for (const w of ["좋아하다", "싫어하다", "미워하다", "하다", "되다", "말하다", "먹다", "학교"]) same(w, "ko");
  assert.equal(core("말하다", "ko", { isWord: (w) => w === "말" }), "말");
});

test("Hindi and Persian: the light verb after a noun, Persian را", () => {
  assert.deepEqual(soundCore("काम करना", "hi", { reading: "kām karnā" }), { core: "काम", reading: "kām",
    dropped: [{ part: "करना", kind: "light-verb", note: "“to do”", label: "करना", extra: false }] });
  assert.equal(core("शुरू होना", "hi"), "शुरू");
  for (const w of ["करना", "होना", "खाना"]) same(w, "hi");
  assert.equal(core("کار کردن", "fa"), "کار");
  assert.equal(core("تمام شدن", "fa"), "تمام");
  assert.equal(core("حرف زدن", "fa"), "حرف");
  assert.equal(core("گوش دادن", "fa"), "گوش");
  assert.equal(core("یاد گرفتن", "fa"), "یاد");
  assert.equal(core("دوست داشتن", "fa"), "دوست");
  assert.equal(core("صحبت كردن", "fa"), "صحبت");   // (Arabic ك for Persian ک)
  assert.equal(core("کتاب را", "fa"), "کتاب");
  for (const w of ["کردن", "شدن", "برگشتن", "بالاخره"]) same(w, "fa");   // (no Arabic article in Persian)
});

test("Thai: polite words at the end, ความ / การ in front; การ์ตูน and พระเจ้า keep theirs", () => {
  assert.deepEqual(soundCore("ขอบคุณครับ", "th", { reading: "kɔ̀ɔp-kun-kráp" }), { core: "ขอบคุณ", reading: "kɔ̀ɔp-kun",
    dropped: [{ part: "ครับ", kind: "polite", note: "a polite word", label: "ครับ", extra: false }] });
  assert.equal(core("สวัสดีค่ะ", "th"), "สวัสดี");
  assert.equal(core("ขอบคุณนะครับ", "th"), "ขอบคุณ");
  assert.equal(core("ขอบคุณ ครับ", "th"), "ขอบคุณ");
  assert.deepEqual(soundCore("ความรัก", "th", { reading: "kwaam-rák" }).reading, "rák");
  assert.equal(core("การเรียน", "th"), "เรียน");
  for (const w of ["การ์ตูน", "การันตี", "พระเจ้า", "ครับ", "ความ", "แมว"]) same(w, "th");
});

test("Latin, Russian, Chinese: principal parts, -que only with a dictionary, -ся stays, pairs and labels", () => {
  assert.equal(core("amo, amare, amavi, amatum", "la"), "amo");
  assert.equal(core("amō, amāre, amāvī, amātum", "la"), "amō");
  assert.equal(core("rex, regis m.", "la"), "rex");
  assert.equal(core("puella, -ae f.", "la"), "puella");
  assert.equal(core("sum, esse, fui, futurus", "la"), "sum");
  assert.deepEqual([core("senatusque", "la", { isWord: dict("la") }), ...parts("senatusque", "la", { isWord: dict("la") })], ["senatus", "-que:enclitic"]);
  same("senatusque", "la");         // no dictionary: not taken off
  for (const w of ["atque", "itaque", "sine", "bene", "neque", "quoque"]) same(w, "la", { isWord: dict("la") });
  same("carpe diem, quam minimum credula postero", "la");
  // Russian
  assert.deepEqual([core("говорить / сказать", "ru"), ...parts("говорить / сказать", "ru")], ["говорить", "сказать:alternative"]);
  assert.equal(core("говорить – сказать", "ru"), "говорить");
  assert.equal(soundCore("говори́ть / сказа́ть", "ru", { reading: "говори́ть / сказа́ть" }).reading, "говори́ть");
  assert.equal(core("учить(ся)", "ru"), "учить");
  same("учиться", "ru");            // -ся is part of the word (учиться is not учить)
  same("бояться", "ru");
  assert.equal(core("заниматься чем-л.", "ru"), "заниматься");
  assert.equal(core("книга ж.", "ru"), "книга");
  assert.equal(core("книга ж", "ru"), "книга");
  assert.equal(core("говорить несов.", "ru"), "говорить");
  same("что-нибудь", "ru");
  // Chinese: only what is typed round the word
  assert.equal(core("书 (本)", "zh"), "书");
  assert.equal(core("书（本）", "zh"), "书");
  same("你好", "zh");
  same("很好", "zh");
});

test("what learners type round a word, in any language: brackets, slashes, commas, labels, end marks", () => {
  assert.equal(core("profesor(a)", "es"), "profesor");
  assert.equal(core("(el) agua", "es"), "agua");
  same("(m)", "es");                // only a note: left alone
  assert.deepEqual([core("el/la estudiante", "es"), ...parts("el/la estudiante", "es")], ["estudiante", "/la:alternative", "el:article"]);
  assert.equal(core("amigo/a", "es"), "amigo");
  assert.equal(core("bueno, -a", "es"), "bueno");
  assert.equal(core("bueno, buena", "es"), "bueno");
  assert.equal(core("casa; hogar", "es"), "casa");
  assert.equal(core("casa f.", "es"), "casa");
  assert.equal(core("casa f", "es"), "casa");
  same("Sí, claro", "es");          // a phrase with a comma stays whole
  same("Vale, vamos", "es");
  assert.equal(core("¿Qué tal?", "es"), "Qué tal");
  assert.equal(core("«perro»", "es"), "perro");
  assert.equal(core("perro.", "es"), "perro");
  assert.equal(soundCore("perro.", "es").dropped.length, 0);   // end marks are no part
  // the extras are told apart from the word's own parts, and the line says only what was matched
  const r = soundCore("amo, amare, amavi, amatum", "la");
  assert.deepEqual(r.dropped, [{ part: "amare, amavi, amatum", kind: "forms", note: "other forms of the word", label: "amare, amavi, amatum", extra: true }]);
  assert.deepEqual(leftWordParts(r), []);
  assert.equal(leftOutLine(r), "Only “amo” is matched.");
  assert.equal(leftOutLine(soundCore("perro", "es")), "");
  assert.equal(leftOutLine(null), "");
  assert.equal(kindName("article"), "Article");
  assert.equal(kindName("light-verb"), "Light verb");
});

// ---------------------------------------------------------------- the makers

test("the free maker's sounds are the core's: kitaab, not al-kitaab", () => {
  const ar = pack("ar");
  const c = soundCore("الكتاب", "ar", { isWord: dict("ar") });
  const pron = pronunciationOf({ word: c.core, lang: "ar", ipa: ar.ipaOf(c.core) });
  assert.equal(pron.ipa, ar.ipaOf("كتاب"));
  assert.ok(!/^ʔ?al/.test(pron.ipa), pron.ipa);
  assert.equal(pron.syllables.length, 2);
  // German: Hund's own IPA (Wiktionary has none for "der Hund, -e")
  const de = soundCore("der Hund, -e", "de");
  assert.equal(pack("de").ipaOf(de.core), pack("de").ipaOf("Hund"));
  // the examples.js wiring: freePronunciation works out the core and returns it with the sounds
  const src = read("web/js/examples.js");
  assert.match(src, /const c = core \|\| soundCore\(word, lang, \{ isWord: knowsWord\(p, lang\), reading \}\);/);
  assert.match(src, /const ipa = p \? p\.ipaOf\(c\.core/);
  assert.match(src, /pronunciationOf\(\{ word: c\.core, lang, ipa, reading: said \}\)/);
  assert.match(src, /return \{ \.\.\.\(await keywordsFor\(v, \{ pron, ownList, avoid, speaks, prefs, ownWords \}\)\), core \};/);
});

test("the AI is given the core and told what was left out; the card's word stays", async () => {
  const c = soundCore("الكتاب", "ar");
  assert.equal(corePromptLine("الكتاب", c), "The card's word is written \"الكتاب\". Find keywords only for \"كتاب\"; al- (article) left out.");
  assert.equal(corePromptLine("كتاب", soundCore("كتاب", "ar")), "");
  assert.match(corePromptLine("amo, amare", soundCore("amo, amare", "la")), /only for "amo"; the other forms and notes left out/);
  const p = mnemonicPrompt({ word: "كتاب", study: "Arabic", coreLine: corePromptLine("الكتاب", c) });
  assert.match(p.user, /^Arabic word: كتاب\nThe card's word is written "الكتاب"/);
  let asked = null;
  const answer = { pronunciation: { romanization: "kitaab", ipa: "kitaːb", syllables: [{ text: "ki", ipa: "ki" }, { text: "taab", ipa: "taːb" }], stress: 1 },
    keywords: [{ keyword: "key tab", ipa: "ki tæb", covers: [0, 1], meaning_link: "none", link: "", scene: "A key on a tab." },
      { keyword: "كتاب", ipa: "kitaːb", covers: [0, 1], meaning_link: "none", link: "", scene: "" }], parts: [] };
  const got = await makeMnemonics({ text: "الكتاب", meaning: "book" }, { ask: async (q) => { asked = q; return answer; }, study: "Arabic", speaks: "English", core: c });
  assert.match(asked.user, /^Arabic word: كتاب\n/);
  assert.match(asked.user, /al- \(article\) left out/);
  assert.equal(got.core, c);
  assert.ok(!got.items.some((s) => s.keyword === "كتاب"));
  // `lang` instead of `core`: worked out there (Add words)
  await makeMnemonics({ text: "der Hund", meaning: "dog" }, { ask: async (q) => { asked = q; return answer; }, study: "German", speaks: "English", lang: "de" });
  assert.match(asked.user, /^German word: Hund\nThe card's word is written "der Hund"/);
  // no core: as before
  await makeMnemonics({ text: "Hund", meaning: "dog" }, { ask: async (q) => { asked = q; return answer; }, study: "German", speaks: "English" });
  assert.ok(!/card's word is written/.test(asked.user));
});

test("the learner's own keyword is judged against the core: PATIO for el pato", () => {
  const es = pack("es");
  const english = (k) => ({ patio: "ˈpætioʊ", pot: "pɑt" }[k] || null);
  const coreSounds = pronunciationOf({ word: "pato", lang: "es", ipa: es.ipaOf("pato") });
  const wholeSounds = pronunciationOf({ word: "el pato", lang: "es", ipa: es.ipaOf("el pato") });
  const withCore = judgeOwn({ text: "el pato" }, coreSounds, [{ key: "pot", shown: "POT" }], { english });
  const withWhole = judgeOwn({ text: "el pato" }, wholeSounds, [{ key: "pot", shown: "POT" }], { english });
  assert.equal(withCore.passed.length, 1);
  assert.ok(!withWhole.passed.length || withWhole.passed[0].score < withCore.passed[0].score);
  // the wiring: checkOwnKeywords' sounds come from freePronunciation (the core), and the core is no sound-alike
  assert.match(read("web/js/examples.js"), /freePronunciation\(v\.text, lang, reading, v\.meaning, courseDialect\(lang\), here\)/);
  assert.match(read("web/js/review/cardtools.js"), /skip: \[\.\.\.skip, \.\.\.\(made \? made\.shown : \[\]\), core\]/);
});

test("the card shows what was left out under How it sounds, and every build carries the module", () => {
  const cardtools = read("web/js/review/cardtools.js");
  assert.match(cardtools, /<div class="rv-mnemo-core" translate="no" hidden><\/div>/);
  assert.match(cardtools, /left\.textContent = leftOutLine\(st\.core\);/);
  assert.match(cardtools, /const core = await wordCoreOf\(v\.text, lang, reading\)/);
  assert.match(cardtools, /reading: core\.reading, core,/);
  assert.match(cardtools, /ownWords: own, core,\s+part: /);
  assert.match(read("web/css/review.css"), /\.rv-mnemo-core \{/);
  // the phone and web app: js/review is copied whole (build-www SHARED)
  const shared = [...read("mobile/scripts/build-www.mjs").match(/const SHARED = \[([\s\S]*?)\];/)[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(shared.includes("js/review") && shared.includes("js/lexicon") && shared.includes("js/i18n.js"));
  // what it imports is light: no page, no dictionaries
  const imports = [...read("web/js/review/wordcore.js").matchAll(/^import .* from "([^"]+)";$/gm)].map((m) => m[1]);
  assert.deepEqual(imports.sort(), ["../i18n.js", "../lexicon/arabic.js", "../lexicon/korean.js", "../lexicon/latin.js", "../lexicon/persian.js"]);
});

test("every note and kind the learner sees is translated in all 16 languages", () => {
  const src = read("web/js/review/wordcore.js");
  const block = (name) => src.match(new RegExp(`const ${name} = \\{([\\s\\S]*?)\\n\\};`))[1];
  const texts = [...[...block("NOTES").matchAll(/: "([^"]+)"/g)].map((m) => m[1]), ...[...block("KIND_NAMES").matchAll(/: "([^"]+)"/g)].map((m) => m[1]),
    "{0} left out", "Only “{0}” is matched."];
  assert.ok(texts.length > 40);
  for (const code of ["ar", "ca", "ceb", "de", "es", "fa", "fr", "hi", "it", "ja", "ko", "pt", "ru", "th", "tl", "zh"]) {
    const d = JSON.parse(read(`web/i18n/${code}.json`));
    for (const s of texts) assert.ok(d[s], `${code}: ${s}`);
  }
});
