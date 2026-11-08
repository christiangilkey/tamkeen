// The part of a card's word worth finding sound-alikes for (the Mnemonic maker: the free one, review/freemnemonic.js
// through examples.js, the AI's, review/mnemonic.js, and the learner's own, review/ownmnemonic.js).
//
// Owner (2026-11-06): "Certain languages have particles, like in Arabic, the definitive particle, al, … which aren't
// particularly useful to memorize as part of the mnemonic sound … exclude them from what the mnemonic maker is looking
// at to find matching sounds." A card saved as الكتاب makes the maker look for sound-alikes of "kitaab", not
// "al-kitaab"; "der Hund, -e" of "Hund"; "to go" of "go"; "공부하다" of "공부". The card's word itself is never changed:
// this only says which part of it the keywords should sound like, and what was left out, for the line under
// "How it sounds" (leftOutLine).
//
// Two kinds of thing are left out:
//   1. What learners type round a word, in any language: notes in brackets ("Hund (m)", "учить(ся)"), other forms
//      after a comma (Latin "amo, amare, amavi, amatum", German "der Hund, -e", Spanish "bueno, -a"), the other word
//      of a pair ("говорить / сказать", "el/la"), grammar labels ("casa f.", "говорить несов."), a dictionary's
//      stand-ins ("sb", "etw.", "qqch", "что-л.", "〜"). The first headword is kept.
//   2. Each language's little words and pieces that a learner never needs to encode by sound: articles (el, der, the,
//      ال), case and plural markers (Tagalog/Bisaya ang, ng, sa, si, mga), "to" and "zu" before a verb, separate and
//      joined-on reflexives (sich, se, -se, -si), light verbs after a noun (する, 하다, करना, کردن), Arabic's و ف ب ك ل
//      before ال, polite words (Thai ครับ ค่ะ, Tagalog po). The table of what each language loses and keeps, and why,
//      is in HANDOFF ("Mnemonic maker: little words left out").
//
// What is really part of how the word is said stays: Japanese お in お茶, Russian -ся (учиться is not учить),
// Arabic words that only look like al- + word (ألم, ألف, آلة, ألوان) and those where ال is the word's own (الآن,
// اليوم, الذي, الله). A strip that could be wrong is only made when `isWord` (the caller's dictionary) says what is
// left is a word, and nothing is ever cut down to nothing.
//
// No page code: tests/js/wordcore.test.mjs.

import { t } from "../i18n.js";
import { matchForm, spelled } from "../lexicon/arabic.js";
import { latinKey, withoutEnclitic } from "../lexicon/latin.js";
import { persianKey } from "../lexicon/persian.js";
import { romanize as koreanRomanize } from "../lexicon/korean.js";

/** The study languages with rules here; any other language's word comes back as it is. */
export const CORE_LANGS = new Set(["ar", "ca", "ceb", "de", "en", "es", "fa", "fr", "hi", "it", "ja", "ko", "la", "pt", "ru", "th", "tl", "zh"]);

// ---------------------------------------------------------------- what is said about a part left out

// The kinds of part (`kind`, a fixed name) and how a learner is told one (kindName). The extras (EXTRA) were never
// part of the word; the others are the language's little words.
const KIND_NAMES = {
  article: "Article", conjunction: "Conjunction", preposition: "Preposition", marker: "Marker", plural: "Plural marker",
  infinitive: "Infinitive marker", reflexive: "Reflexive pronoun", "light-verb": "Light verb", copula: "Copula",
  polite: "Polite word", nominalizer: "Noun maker", enclitic: "Joined-on word", note: "Note", forms: "Other forms",
  alternative: "Alternative", label: "Grammar label", placeholder: "Placeholder",
};
const EXTRA = new Set(["note", "forms", "alternative", "label", "placeholder"]);
/** The learner's name for a kind of part, in their language. */
export const kindName = (kind) => t(KIND_NAMES[kind] || kind);

// What each part means or does, shown in brackets after it ("al- (“the”) left out"). Translated when asked (t()).
const NOTES = {
  the: "“the”", a: "“a, an”", some: "“some”", one: "“a, one”", and: "“and”", so: "“so, and then”", with: "“with, by, in”",
  like: "“like, as”", for: "“for, to”", or: "“or”", question: "makes it a question", toVerb: "“to” before a verb",
  oneself: "“oneself”", do: "“to do”", doFormal: "“to do”, formal", become: "“to become”", becomeFormal: "“to become”, formal",
  hit: "“to hit”", give: "“to give”", take: "“to take”", have: "“to have”", be: "“to be, to become”",
  copula: "“am, is, are”, polite", topic: "the topic marker", object: "the object marker", name: "a marker before a name",
  plural: "the plural marker", at: "“at, to, in”", polite: "a polite word", noun: "turns a verb or adjective into a noun",
  note: "a note in brackets", forms: "other forms of the word", pluralForm: "the plural", alternative: "another word or form",
  label: "a grammar label", placeholder: "a stand-in for other words",
};

// ---------------------------------------------------------------- each language's little words

// Separate words in front: word -> [kind, note]. Romance and English articles, German der/die/das (and the r/e/s of
// some word lists), zu and sich; Tagalog and Bisaya case markers and mga.
const THE = ["article", "the"], A = ["article", "a"], SOME = ["article", "some"];
const FRONT = {
  es: { el: THE, la: THE, los: THE, las: THE, un: A, una: A, unos: SOME, unas: SOME },
  fr: { le: THE, la: THE, les: THE, un: A, une: A, des: SOME, du: SOME, se: ["reflexive", "oneself"] },
  it: { il: THE, lo: THE, la: THE, i: THE, gli: THE, le: THE, un: A, uno: A, una: A },
  pt: { o: THE, a: THE, os: THE, as: THE, um: A, uma: A, uns: SOME, umas: SOME },
  ca: { el: THE, la: THE, els: THE, les: THE, un: A, una: A, uns: SOME, unes: SOME },
  de: { der: THE, die: THE, das: THE, den: THE, dem: THE, des: THE, ein: A, eine: A, einen: A, einem: A, einer: A, eines: A,
    r: THE, e: THE, s: THE, zu: ["infinitive", "toVerb"], sich: ["reflexive", "oneself"] },
  en: { the: THE, a: A, an: A, to: ["infinitive", "toVerb"] },
  tl: { ang: ["marker", "topic"], ng: ["marker", "object"], sa: ["marker", "at"], si: ["marker", "name"], ni: ["marker", "name"],
    kay: ["marker", "name"], sina: ["marker", "name"], nina: ["marker", "name"], kina: ["marker", "name"], mga: ["plural", "plural"] },
  ceb: { ang: ["marker", "topic"], sa: ["marker", "at"], si: ["marker", "name"], ni: ["marker", "name"], kang: ["marker", "name"],
    kay: ["marker", "name"], mga: ["plural", "plural"] },
};
// After these an article is part of an expression (el que, o que, a lot), not a noun's: it stays.
const NOT_AFTER_ARTICLE = new Set("que|qué|quê|qui|quoi|che|cui|cual|cuál|cuales|qual|quale|quali|quem|quien|quién|chi|lot|lots|bit|few|little|while".split("|"));
// German written all in small letters ("das ist"): these after das/die/der are a verb, not a noun.
const DE_VERBS = new Set("ist|sind|war|waren|hat|haben|heißt|heisst|gibt|geht|wird|werden|kann|muss|soll|will|mag|darf|weiß|stimmt|macht".split("|"));
// English "to" before these is a preposition (to the left, to me), not the infinitive's.
const TO_NOT_BEFORE = new Set("the|a|an|my|your|his|her|its|our|their|this|that|these|those|me|him|us|them|it|you|and|or|and".split("|"));
// Italian "lo" is the article only before s + consonant, z, gn, ps, pn, x, y and i + vowel (lo zaino); "lo so" is "I know it".
const IT_LO_NEXT = /^(?:s[^aeiouàèéìòù]|z|gn|ps|pn|x|y|i[aeiou])/i;

// Separate words at the end: Hindi and Persian light verbs after a noun (काम करना, کار کردن), Persian را, Tagalog po.
const HI_LIGHT = { "करना": "do", "होना": "be" };
const FA_LIGHT = { "کردن": "do", "نمودن": "doFormal", "شدن": "become", "گشتن": "becomeFormal", "زدن": "hit", "دادن": "give",
  "گرفتن": "take", "داشتن": "have" };

// Arabic: the pieces written onto the front of a word, each with its romanization for the line ("al- (“the”) left out").
const AR_PARTS = { "ال": ["article", "al-", "the"], "و": ["conjunction", "wa-", "and"], "ف": ["conjunction", "fa-", "so"],
  "ب": ["preposition", "bi-", "with"], "ك": ["preposition", "ka-", "like"], "ل": ["preposition", "li-", "for"] };
// Words that begin ال (or وال, بال …) where it is no article, or is a part of the word itself, in matching form
// (arabic.js matchForm: no marks, أ إ آ as ا, ى as ي, ة as ه):
//  - the article belongs to the word: now, today, yesterday, (Gulf) now, at all; the relative pronouns (الذي … اللاتي,
//    dialect اللي); God (الله, اللهم, and والله, بالله, لله …: ALLAH below);
//  - words that only look like it: ألم pain, ألف thousand, آلة machine, ألو hello, plurals أفعال of roots that begin
//    with ل (ألوان colours, ألعاب games …), elatives (ألطف), أفعل and إفعال of ل-roots (ألقى, إلغاء), the افتعل verbs and
//    their nouns from ل-roots (التقى met, التزام commitment …), loanwords (ألبوم, ألمانيا, إلكتروني), to/except (إلى, إلا);
//  - words that begin وال, بال (والد father, والدة mother, والدين parents, بالون balloon, باليه ballet).
// Written as they usually are; hamza-less spellings (الوان) match through matchForm.
const AR_KEEP = new Set(("الآن|الان|اليوم|البارحة|الحين|البتة|الذي|الذى|التي|التى|الذين|اللذان|اللتان|اللذين|اللتين|اللاتي|" +
  "اللواتي|اللائي|اللاء|اللي|اللى|إلا|إلّا|إلى|إليه|إليك|إليها|إليهم|إليكم|إلينا|إليّ|ألا|أليس|" +
  "ألم|ألف|ألفين|ألفان|آلة|آلات|آلاف|آلية|آلهة|ألو|إله|إلهي|إلهام|إلهامي|ألوان|ألعاب|ألفاظ|ألقاب|ألواح|ألحان|ألغاز|ألياف|ألوف|" +
  "ألبان|ألغام|ألبسة|ألسن|ألبوم|ألمانيا|ألماني|ألمانية|ألمان|ألماس|إلكتروني|إلكترونية|إلكترونيات|إلكترون|ألومنيوم|ألباني|ألبانيا|" +
  "إلغاء|إلقاء|إلزام|إلزامي|إلحاح|إلمام|ألطف|ألذ|ألين|ألمع|ألزم|ألقى|ألغى|ألهم|ألحق|أليف|أليفة|أليم|أليمة|ألفة|" +
  "التقى|التقاء|التزم|التزام|التقط|التقاط|التحق|التحاق|التهب|التهاب|التفت|التفات|التبس|التباس|التصق|التصاق|التمس|التماس|التف|" +
  "التفاف|التوى|التواء|التجأ|التجاء|التذ|" +
  "والد|والدة|والده|والدي|والدك|والدها|والدهم|والدين|والدان|والدتي|والدته|والدتك|والدتها|والديه|والديك|والدينا|والي|والا|وإلا|" +
  "بالون|بالونة|بالونات|باليه|باليرينا").split("|").map((w) => matchForm(w)));
const ALLAH = /^[وف]?[بتل]?ا?لله(?:م)?$/;
// Vowel marks, Quranic marks and tatweel: they go with the letter before them (arabic.js MARKS, which `spelled` drops).
const AR_MARK = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/u;
const SHADDA = "ّ";

// Thai: polite words on the end (longest first: นะครับ before ครับ) with their syllables in the reading, and the two
// pieces that make nouns (ความรัก "love" from รัก, การเรียน "studying" from เรียน), followed by a consonant or a
// vowel written before one (not การ์ตูน "cartoon", การันตี "guarantee": a mark comes next there).
// (Not จ้ะ, จ้า: พระเจ้า "God" ends in the same letters.)
const TH_POLITE = [["นะครับ", 2], ["นะคะ", 2], ["นะค่ะ", 2], ["ครับผม", 2], ["ครับ", 1], ["ค่ะ", 1], ["คะ", 1]];
const TH_NOUN = /^(ความ|การ)(?=[ก-ฮเ-ไ])/u;

// Latin-script grammar labels after a word: with a full stop any of these; without one only those no word is spelled
// like (nm, adj, pl …), and m f n as the last of two words (casa f). Russian ones too (ж., сов., нсв).
const LABEL_DOT = new Set("m|f|n|nt|mf|nm|nf|nmf|adj|adv|pl|sg|v|vt|vi|vr|pron|prep|conj|interj|art|inf|part|aux|num|subst|sing|plur|masc|fem|neut|dat|akk|acc|gen|nom|abl|м|ж|ср|мн|ед|сов|несов|нсв|св|прил|нареч|гл|сущ|мест|предл|союз|разг".split("|"));
const LABEL_BARE = new Set("nm|nf|nmf|adj|adv|pl|sg|vt|vi|vr|interj|conj|prep|pron|нсв|несов".split("|"));
const GENDERED = new Set(["es", "fr", "it", "pt", "ca", "de", "la"]);
// A dictionary's stand-ins for the words that go with an entry ("look after sb", "sich etw. merken", "что-л.").
const PLACEHOLDERS = new Set("sb|sth|smb|smth|sb's|sth's|smb's|s.o.|s.th.|s.b.|one's|oneself|jdn|jdm|jds|jd|jmd|jmdn|jmdm|jmds|etw|qqch|qqn|qch|qn|qc|qqc|qlco|qlcu|qcn|qd|algn|alg|~|〜|～|…|...".split("|"));
const RU_PLACEHOLDER = /^(?:кто|кого|кому|кем|ком|что|чего|чему|чем|чём|какой|какого|какому|каким|где|куда)-(?:л|н)\.?$/u;
// Brackets, and the marks of a word's ends that are no sound.
const BRACKET = /(\s*)(\([^()]*\)|\[[^[\]]*\]|\{[^{}]*\}|（[^（）]*）|【[^【】]*】|［[^［］]*］)(\s*)/u;
// (A full stop at the end goes later, endDots: it may be a label's, "casa f.". Brackets are bracketsOut's: one
// round the whole entry, "(m)", is left as it is.)
const LEAD = /^[\s¿¡«“”"„‚‘’']+/u, TRAIL = /[\s?!,;:»”"«。！？、，；：]+$/u;

// ---------------------------------------------------------------- small helpers

const letters = (s) => Array.from(String(s)).filter((c) => /\p{L}/u.test(c)).length;
const lower = (s) => String(s).toLowerCase();
const capital = (s) => /^\p{Lu}/u.test(String(s));
const fold = (s) => lower(s).normalize("NFD").replace(/\p{M}/gu, "").replace(/ß/g, "ss");
/** Do two words start alike (bueno, buena; Haus, Häuser; amo, amare)? At least 3 letters, or all of a shorter one. */
function alike(a, b) {
  const x = fold(a), y = fold(b);
  const n = Math.min(3, x.length, y.length);
  return x.length >= 2 && y.length >= 2 && n >= 2 && x.slice(0, n) === y.slice(0, n);
}
/** Arabic and Persian: the letters that stay through a word's forms (no long vowels, hamzas, ة, ال). */
const skeleton = (w) => spelled(w).replace(/^ال/, "").replace(/[اأإآءؤئوىيیةۀ]/g, "");
function isSubsequence(a, b) {
  let i = 0;
  for (const c of b) if (c === a[i]) i++;
  return i === a.length;
}

// ---------------------------------------------------------------- 1. what is typed round a word

function isLabel(tok, lang, alone) {
  const m = /^(.+?)(\.?)$/u.exec(tok);
  const w = lower(m[1]);
  if (m[2] && LABEL_DOT.has(w)) return true;
  if (LABEL_BARE.has(w)) return true;
  return !m[2] && alone && ((GENDERED.has(lang) && /^(?:m|f|n|mf)$/.test(tok)) || (lang === "ru" && /^(?:м|ж|ср)$/u.test(tok)));
}
const articleOf = (lang, tok) => {
  const e = FRONT[lang] && Object.prototype.hasOwnProperty.call(FRONT[lang], lower(tok)) ? FRONT[lang][lower(tok)] : null;
  return e && e[0] === "article" ? e : null;
};

/** Is `item` (what follows a comma or slash) a form of `head` or a note on it, rather than more words? */
function formLike(item, head, lang) {
  const s = item.trim();
  if (!s) return true;
  if (/^[-–‑~¨=]/u.test(s)) return true;                         // -e, -(e)s, ¨er, ~s
  const toks = s.split(/\s+/);
  if (toks.every((x) => isLabel(x, lang, false) || articleOf(lang, x))) return true;   // m., der, m pl
  if (toks.length > 1) return false;
  if (letters(s) === 1) return true;                             // bueno, a
  const last = head.split(/\s+/).pop();
  if (lang === "ar" || lang === "fa") {
    const a = skeleton(last), b = skeleton(s);
    return a.length >= 2 && isSubsequence(a, b);                 // ولد، أولاد; كتاب، كتب
  }
  return alike(last, s);
}

/** Notes in brackets: taken out (a word written inside one, profesor(a), учить(ся), joins up). */
function bracketsOut(s, parts) {
  for (let k = 0; k < 6; k++) {
    const m = BRACKET.exec(s);
    if (!m) break;
    const before = s.slice(0, m.index), after = s.slice(m.index + m[0].length);
    const gap = (m[1] || m[3]) && before.trim() && after.trim() ? " " : "";
    const next = (before + gap + after).trim();
    if (!next) break;              // only a note: left as it is
    parts.push({ part: m[2], kind: "note", note: "note" });
    s = next;
  }
  return s;
}

/** Arabic: كتاب ج كتب, كتاب (ج) كتب, كتاب، جمع: كتب — the plural after ج left out. */
function arabicPluralOut(s, parts) {
  const m = /(?:^|[\s،,(\[])\s*(جمع|جـ|ج)\s*[.:)\]]?(?=\s|$)/u.exec(s);
  if (!m || m.index === 0) return s;
  const head = s.slice(0, m.index).replace(/[\s،,(\[]+$/u, "").trim();
  if (!head) return s;
  parts.push({ part: s.slice(m.index).trim(), kind: "forms", note: "pluralForm" });
  return head;
}

/** Alternatives: "говорить / сказать", "amigo/a", "casa; hogar", "word – other". "el/la estudiante" keeps one article. */
function alternativesOut(s, lang, parts) {
  const pair = /^(\p{L}+)\s*\/\s*(\p{L}+)(\s+)(?=\S)/u.exec(s);
  if (pair && articleOf(lang, pair[1]) && articleOf(lang, pair[2])) {
    parts.push({ part: `/${pair[2]}`, kind: "alternative", note: "alternative" });
    s = pair[1] + " " + s.slice(pair[0].length);
  }
  const pieces = s.split(/\s*[/／;；]\s*|\s+[-–—|]\s+/u);
  if (pieces.length < 2) return s;
  const at = pieces.findIndex((p) => p.trim());
  if (at < 0) return s;
  const head = pieces[at].trim();
  for (const p of pieces.slice(at + 1)) {
    if (p.trim()) parts.push({ part: p.trim(), kind: formLike(p, head, lang) ? "forms" : "alternative", note: formLike(p, head, lang) ? "forms" : "alternative" });
  }
  return head;
}

/** Other forms after a comma: "amo, amare, amavi, amatum", "der Hund, -e", "bueno, -a", "Hund, der". A phrase with a
 * comma in it ("Sí, claro") stays whole. */
function formsOut(s, lang, parts) {
  const pieces = s.split(/\s*[,،，、]\s*/u);
  if (pieces.length < 2 || !pieces[0].trim()) return s;
  const head = pieces[0].trim(), rest = pieces.slice(1).filter((p) => p.trim());
  if (!rest.length) return head;
  const latin = lang === "la" && head.split(/\s+/).length === 1 && rest.every((p) => p.trim().split(/\s+/).length <= 2);
  if (!latin && !rest.every((p) => formLike(p, head, lang))) return s;
  parts.push({ part: rest.join(", "), kind: "forms", note: "forms" });
  return head;
}

/** The text with the extras taken out, and the parts left out. */
function extrasOut(text, lang) {
  const parts = [];
  let s = String(text).normalize("NFC").replace(/\s+/g, " ").trim();
  if (lang === "ar") s = arabicPluralOut(s, parts);
  s = bracketsOut(s, parts);
  s = alternativesOut(s, lang, parts);
  s = formsOut(s, lang, parts);
  // the marks of the ends (¿…?, «…», a full stop) are no sound: off, without a word
  s = s.replace(LEAD, "").replace(TRAIL, "");
  // German dictionaries' an|fangen, Hun·de: one word
  s = s.replace(/(?<=\p{L})\|(?=\p{L})/gu, "");
  if (lang === "de") s = s.replace(/(?<=\p{L})·(?=\p{L})/gu, "");
  return { s: s || String(text).trim(), parts };
}

// ---------------------------------------------------------------- the word's tokens, and its reading's

function makeState(text, lang, isWord, reading) {
  const ex = extrasOut(text, lang);
  const tokens = ex.s.split(" ").filter(Boolean);
  let rtokens = null, rLost = false;
  if (reading) {
    const rx = extrasOut(reading, lang);
    // (the reading had the same notes and forms round it, or none at all)
    if ((rx.parts.length > 0) === (ex.parts.length > 0)) rtokens = rx.s.split(" ").filter(Boolean);
    else rLost = true;
  }
  const known = typeof isWord === "function" ? (f) => { try { return !!isWord(f); } catch { return false; } } : null;
  return { lang, tokens, rtokens, rLost, known, dropped: [], extras: ex.parts };
}

const aligned = (st) => !!st.rtokens && st.rtokens.length === st.tokens.length;

function record(st, part, kind, note, label = part) {
  st.dropped.push({ part, kind, note, label });
}

/** Take the first k tokens away (and the reading's, when it has the same words). */
function dropFront(st, k) {
  if (aligned(st)) st.rtokens = st.rtokens.slice(k);
  else if (st.rtokens) st.rLost = true;
  st.tokens = st.tokens.slice(k);
}
function dropBack(st, k) {
  if (aligned(st)) st.rtokens = st.rtokens.slice(0, -k);
  else if (st.rtokens) st.rLost = true;
  st.tokens = st.tokens.slice(0, -k);
}
/** Token i becomes `text`; `fix(readingToken)` gives the reading's, or null when it can't be told. */
function setToken(st, i, text, fix) {
  if (aligned(st)) {
    const r = fix ? fix(st.rtokens[i]) : null;
    if (r == null || !String(r).trim()) st.rLost = true;
    else st.rtokens[i] = r;
  } else if (st.rtokens) st.rLost = true;
  st.tokens[i] = text;
}

// ---------------------------------------------------------------- 1b. labels and stand-ins (any language)

function labelsOut(st) {
  while (st.tokens.length > 1 && isLabel(st.tokens[st.tokens.length - 1], st.lang, st.tokens.length === 2)) {
    st.extras.push({ part: st.tokens[st.tokens.length - 1], kind: "label", note: "label" });
    dropBack(st, 1);
  }
}

function placeholdersOut(st) {
  const isStand = (tok) => {
    const x = lower(tok).replace(/\.$/, "");
    return PLACEHOLDERS.has(x) || PLACEHOLDERS.has(`${x}.`) || RU_PLACEHOLDER.test(lower(tok));
  };
  if (st.tokens.length > 1 && st.tokens.some(isStand) && !st.tokens.every(isStand)) {
    const keep = st.tokens.map((tok) => !isStand(tok));
    for (let i = 0; i < st.tokens.length; i++) if (!keep[i]) st.extras.push({ part: st.tokens[i], kind: "placeholder", note: "placeholder" });
    if (aligned(st)) st.rtokens = st.rtokens.filter((x, i) => keep[i]);
    else if (st.rtokens) st.rLost = true;
    st.tokens = st.tokens.filter((x, i) => keep[i]);
  }
  // 〜について, ~ness: the mark at the ends of the entry
  const ends = /^[~〜～…]+|[~〜～…]+$/gu;
  const joined = st.tokens.join(" ");
  const bare = joined.replace(ends, "").trim();
  if (bare && bare !== joined) {
    st.extras.push({ part: joined.match(/^[~〜～…]+/u)?.[0] || joined.match(/[~〜～…]+$/u)?.[0], kind: "placeholder", note: "placeholder" });
    st.tokens = bare.split(" ");
    if (st.rtokens) {
      const r = st.rtokens.join(" ").replace(ends, "").trim();
      st.rtokens = r ? r.split(" ") : null;
      if (!r) st.rLost = true;
    }
  }
}

/** A full stop or "…" at the very end (once labels have had theirs) is no sound: off, without a word. */
function endDots(st) {
  const i = st.tokens.length - 1;
  const bare = (s) => s.replace(/[.…]+$/u, "");
  if (i < 0 || !bare(st.tokens[i]) || bare(st.tokens[i]) === st.tokens[i]) return;
  st.tokens[i] = bare(st.tokens[i]);
  if (aligned(st)) st.rtokens[i] = bare(st.rtokens[i]) || st.rtokens[i];
}

// ---------------------------------------------------------------- 2. each language's little words

/** Articles, markers, zu, to, sich, se in front (as many as stand there: ang mga bata). */
function frontWords(st) {
  const table = FRONT[st.lang];
  if (!table) return;
  for (let round = 0; round < 3 && st.tokens.length > 1; round++) {
    const [w, next] = st.tokens;
    const low = lower(w);
    // French de la / de l'…: "some"
    if (st.lang === "fr" && low === "de" && st.tokens.length > 2 && lower(next) === "la") {
      record(st, `${w} ${next}`, "article", "some");
      dropFront(st, 2);
      continue;
    }
    // Bisaya usa ka: "a, one"
    if (st.lang === "ceb" && low === "usa" && lower(next) === "ka" && st.tokens.length > 2) {
      record(st, `${w} ${next}`, "article", "one");
      dropFront(st, 2);
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(table, low)) break;
    const [kind, note] = table[low];
    if (!frontAllowed(st.lang, low, kind, next, st.tokens)) break;
    record(st, w, kind, note);
    dropFront(st, 1);
  }
  // Glued in front with an apostrophe: l'homme, l'acqua, un'amica, l'home; s'appeler.
  const first = st.tokens[0];
  const m = /^(l|un|s)['’](?=\p{L})/iu.exec(first || "");
  if (m && ["fr", "it", "ca"].includes(st.lang)) {
    const rest = first.slice(m[0].length);
    const low = lower(m[1]);
    const ok = low === "l" || (low === "un" && st.lang === "it") || (low === "s" && st.lang === "fr" && /(?:er|ir|re|oir|ïr)$/u.test(lower(rest)));
    if (ok && letters(rest) >= 2) {
      record(st, m[0], low === "s" ? "reflexive" : "article", low === "s" ? "oneself" : low === "un" ? "a" : "the");
      setToken(st, 0, rest, (r) => r.replace(/^(?:l|un|s)['’]/iu, ""));
    }
  }
  // French de l'eau: "some"
  if (st.lang === "fr" && st.tokens.length > 1 && lower(st.tokens[0]) === "de" && /^l['’]\p{L}/iu.test(st.tokens[1])) {
    record(st, `${st.tokens[0]} ${st.tokens[1].slice(0, 2)}`, "article", "some");
    dropFront(st, 1);
    setToken(st, 0, st.tokens[0].slice(2), (r) => r.replace(/^l['’]/iu, ""));
  }
}

function frontAllowed(lang, w, kind, next, tokens) {
  if (!next) return false;
  if (kind === "article") {
    if (NOT_AFTER_ARTICLE.has(lower(next))) return false;
    if (lang === "de") {
      if (["r", "e", "s"].includes(w)) return capital(next);
      if (capital(next)) return true;
      // all in small letters ("der hund"): a noun unless a verb follows (das ist)
      return !tokens.some((x) => capital(x)) && !DE_VERBS.has(lower(next)) && letters(next) >= 3;
    }
    if (capital(next)) return false;   // a name: El Salvador, La Paz, The Beatles
    if (lang === "it" && w === "lo") return IT_LO_NEXT.test(next);
    return true;
  }
  if (kind === "infinitive") {
    if (lang === "en") return !TO_NOT_BEFORE.has(lower(next)) && !capital(next);
    if (lang === "de") return !capital(next) && /(?:en|ern|eln|n)$/u.test(next);   // zu essen; not zu Hause, zu viel
  }
  return true;
}

/** Spanish -se, Italian -si, Portuguese and Catalan -se, Catalan 's on an infinitive: lavarse -> lavar. */
const IT_NOT_REFLEXIVE = new Set("diversi|versi|universi|persi|dispersi|emersi|immersi|sommersi|conversi|inversi|avversi|perversi|tersi|scarsi|sparsi|cosparsi|apparsi|comparsi|scomparsi|riapparsi|arsi|corsi|morsi|orsi|dorsi|torsi".split("|"));
function reflexiveEnding(st) {
  const w = st.tokens[0];
  if (!w) return;
  const low = lower(w);
  let base = "", part = "";
  if (st.lang === "es") {
    const m = /^(\p{L}*(?:ar|er|ir|ír))se$/u.exec(low);   // (irse: ir)
    if (m) { base = w.slice(0, m[1].length); part = "-se"; }
  } else if (st.lang === "it") {
    let m = /^(\p{L}{2,})([aei])rsi$/u.exec(low);
    if (m && !IT_NOT_REFLEXIVE.has(low)) { base = w.slice(0, m[1].length + 1) + "re"; part = "-si"; }
    else if ((m = /^(\p{L}*p)orsi$/u.exec(low)) || (m = /^(\p{L}*d)ursi$/u.exec(low))) { base = w.slice(0, -3) + "rre"; part = "-si"; }
  } else if (st.lang === "pt") {
    const m = /^(\p{L}{2,}(?:ar|er|ir|ôr|or))-se$/u.exec(low);
    if (m) { base = w.slice(0, m[1].length); part = "-se"; }
  } else if (st.lang === "ca") {
    const m = /^(\p{L}{2,}(?:ar|er|ir|re))(-se'n|-se’n|-se|'s|’s|'n|’n)$/u.exec(low);
    if (m) { base = w.slice(0, m[1].length); part = m[2].replace(/’/g, "'"); }
  }
  if (!base || letters(base) < 2) return;
  // with a dictionary, the verb without it must be one (diversi is no diverere)
  if (st.known && !st.known(base) && !st.known(lower(base))) return;
  record(st, part, "reflexive", "oneself");
  const end = part.replace(/^-/, "");
  // (Italian's reading would need its -re back: worked out again by the caller)
  setToken(st, 0, base, st.lang === "it" ? null : (r) => (lower(r).endsWith(end) ? r.slice(0, r.length - end.length).replace(/-$/, "") : null));
}

/** Arabic: و ف ب ك ل and ال on the front of a one-word card (see AR_KEEP for what stays). */
function arabicFront(st) {
  if (st.tokens.length !== 1) return;
  const w = st.tokens[0];
  const sp = spelled(w);
  const key = matchForm(w);
  if (!/^[ء-ي]/u.test(sp) || AR_KEEP.has(key) || ALLAH.test(key)) return;
  const known = st.known;
  const rw = aligned(st) && spelled(st.rtokens[0]) === sp ? st.rtokens[0] : null;
  if (aligned(st) && !rw) st.rLost = true;
  let pieces = [], n = 0;
  const m = /^([وف]?)(?:(ال)|([بك])ال|(لل))/u.exec(sp);
  if (m) {
    if (m[1]) pieces.push(m[1]);
    if (m[2]) pieces.push("ال");
    else if (m[3]) pieces.push(m[3], "ال");
    else pieces.push("ل", "ال");
    n = m[0].length;
    let rest = sp.slice(n);
    const compound = pieces.length > 1;
    if (m[4]) {
      // لِ + ال + a word beginning with ل is written with two lams, not three (لِلَّيْل "for the night", للغة): the
      // word keeps the second. Known by the shadda on it, the dictionary, or a word that can't be (غة).
      const lam = m[1] ? 2 : 1;
      if ((rw && shaddaOn(rw, lam)) || (known ? !known(rest) && known("ل" + rest) : rest.length === 2 && /[ةه]$/.test(rest))) {
        n -= 1;
        rest = sp.slice(n);
      }
    }
    if (letters(rest) < 2) return;
    if (known) {
      if (known(sp) && !known(rest)) return;                         // الوان, التزام: the dictionary's own word
      if (letters(rest) === 2 && compound && !known(rest)) return;   // بالون is no بال + ون
    } else if (letters(rest) === 2) {
      if (/[ةه]$/.test(rest)) return;                                // آلهة, ألفة written الهة, الفة
      if (compound && !/^[أإآ]/.test(rest)) return;                  // بالون, والدة; but بالأب, للأم
    }
  } else {
    // A bare و, ف, ب, ك or ل is as often the word's own first letter (ولد, فيل, بيت, كلب, لبن): taken off only when
    // the dictionary knows what is left and not the whole.
    if (!known || known(sp)) return;
    // (fewest letters off first: وكتاب is و + كتاب "and a book", not و + ك + تاب)
    const b = /^([وف]?)([بكل]?)/u.exec(sp);
    const tries = [];
    if (b[1]) tries.push([b[1]]);
    if (b[2] && !b[1]) tries.push([b[2]]);
    if (b[1] && b[2]) tries.push([b[1], b[2]]);
    const hit = tries.find((p) => letters(sp.slice(p.length)) >= 2 && known(sp.slice(p.length)));
    if (!hit) return;
    pieces = hit;
    n = hit.length;
  }
  for (const p of pieces) {
    const [kind, label, note] = AR_PARTS[p];
    record(st, p, kind, note, label);
  }
  setToken(st, 0, unshadda(dropLetters(w, n)), rw ? () => unshadda(dropLetters(rw, n)) : null);
}

/** The word without its first n letters (each letter's marks go with it). */
function dropLetters(word, n) {
  const cs = Array.from(word);
  let i = 0, seen = 0;
  while (i < cs.length && seen < n) {
    if (!AR_MARK.test(cs[i])) seen++;
    i++;
    while (i < cs.length && AR_MARK.test(cs[i])) i++;
  }
  return cs.slice(i).join("");
}
/** No shadda on the first letter: الشَّمْس without ال is شَمْس (the doubling was the article's sound). */
function unshadda(word) {
  const cs = Array.from(word);
  let i = 0;
  while (i < cs.length && AR_MARK.test(cs[i])) i++;
  const out = cs.slice(0, i + 1);
  let j = i + 1;
  for (; j < cs.length && AR_MARK.test(cs[j]); j++) if (cs[j] !== SHADDA) out.push(cs[j]);
  return out.concat(cs.slice(j)).join("");
}
/** Does letter k (from 0) carry a shadda? */
function shaddaOn(word, k) {
  const cs = Array.from(word);
  let seen = -1;
  for (let i = 0; i < cs.length; i++) {
    if (!AR_MARK.test(cs[i])) { seen++; continue; }
    if (seen === k && cs[i] === SHADDA) return true;
  }
  return false;
}

/** Korean: 하다 after a noun (공부하다, 운동하다, 깨끗하다) and 되다 after one of two syllables or more (시작되다). */
function koreanLight(st) {
  const i = st.tokens.length - 1;
  const w = st.tokens[i];
  if (!w) return;
  // (a reading in Hangul loses the same syllables; one in Latin letters is the core's romanization, korean.js's)
  const fix = (end, rest) => (r) => (/[가-힣]/u.test(r) ? (r.endsWith(end) ? r.slice(0, -end.length) : null)
    : /\p{Script=Latin}/u.test(r) ? koreanRomanize(rest) : null);
  // 공부를 하다: 하다 on its own after the noun and its object particle
  if ((w === "하다" || w === "되다") && st.tokens.length > 1) {
    dropBack(st, 1);
    const j = st.tokens.length - 1, p = st.tokens[j];
    if (/^[가-힣]{2,}[을를]$/u.test(p)) {
      record(st, p.slice(-1), "marker", "object");
      setToken(st, j, p.slice(0, -1), (r) => (/[가-힣]$/u.test(r) ? r.slice(0, -1) : /\p{Script=Latin}/u.test(r) ? koreanRomanize(p.slice(0, -1)) : null));
    }
    record(st, w, "light-verb", w === "하다" ? "do" : "become");
    return;
  }
  let m = /^([가-힣]+)하다$/u.exec(w);
  if (m) {
    const rest = m[1];
    // 좋아하다, 싫어하다: a verb's -아/-어 form before 하다, not a noun; one syllable (말하다, 일하다) only when the
    // dictionary says it is a word
    const ok = (rest.length >= 2 && !/[아어여워와해]$/u.test(rest)) || (st.known && st.known(rest));
    if (!ok) return;
    record(st, "-하다", "light-verb", "do");
    setToken(st, i, rest, fix("하다", rest));
    return;
  }
  m = /^([가-힣]{2,})되다$/u.exec(w);
  if (m) {
    record(st, "-되다", "light-verb", "become");
    setToken(st, i, m[1], fix("되다", m[1]));
  }
}

/** Japanese: する after a noun of two characters or more (勉強する, コピーする; not 愛する, said as one verb), をする,
 * and the polite copula です (学生です). お and ご stay: お茶 is how the word is said. */
function japaneseEnd(st) {
  const i = st.tokens.length - 1;
  const w = st.tokens[i];
  if (!w) return;
  const chars = (s) => Array.from(s).length;
  const cut = (kana, roman) => (r) => (r.endsWith(kana) ? r.slice(0, -kana.length)
    : roman && new RegExp(`${roman}$`, "i").test(r) ? r.replace(new RegExp(`\\s*${roman}$`, "i"), "") : null);
  if (w.endsWith("です") && chars(w) > 2) {
    record(st, "です", "copula", "copula");
    setToken(st, i, w.slice(0, -2), cut("です", "desu"));
    return;
  }
  for (const [end, roman] of [["をします", "w?o\\s*shimasu"], ["をする", "w?o\\s*suru"], ["します", "shimasu"], ["する", "suru"]]) {
    if (!w.endsWith(end) || chars(w) - chars(end) < 2) continue;
    if (end.startsWith("を")) record(st, "を", "marker", "object");
    record(st, end.replace(/^を/, ""), "light-verb", "do");
    setToken(st, i, w.slice(0, -end.length), cut(end, roman));
    return;
  }
}

/** Thai: a polite word on the end (ขอบคุณครับ, สวัสดีค่ะ) and ความ/การ in front (ความรัก, การเรียน). */
function thaiParts(st) {
  const syllables = (r) => r.split(/[-\s]+/).filter(Boolean);
  const last = st.tokens.length - 1;
  for (const [p, n] of TH_POLITE) {
    const w = st.tokens[last];
    if (w === p && st.tokens.length > 1) { record(st, p, "polite", "polite"); dropBack(st, 1); break; }
    // (what is left can't end in a vowel written before its consonant: that vowel belongs to the next syllable)
    if (w.endsWith(p) && Array.from(w).length - Array.from(p).length >= 2 && !/[เ-ไ]$/u.test(w.slice(0, -p.length))) {
      record(st, p, "polite", "polite");
      setToken(st, last, w.slice(0, -p.length), (r) => { const s = syllables(r); return s.length > n ? s.slice(0, -n).join("-") : null; });
      break;
    }
  }
  const m = TH_NOUN.exec(st.tokens[0]);
  if (m && Array.from(st.tokens[0]).length - m[1].length >= 2) {
    record(st, m[1], "nominalizer", "noun");
    setToken(st, 0, st.tokens[0].slice(m[1].length), (r) => { const s = syllables(r); return s.length > 1 ? s.slice(1).join("-") : null; });
  }
}

/** Latin -que "and", -ne (a question), -ve "or" on a word: only when the dictionary knows the word without it and
 * not with it (atque, itaque, sine, bene keep theirs). */
function latinEnclitic(st) {
  if (st.tokens.length !== 1 || !st.known) return;
  const w = st.tokens[0];
  const k = latinKey(w);
  const bare = withoutEnclitic(k);
  if (!bare || st.known(w) || st.known(k)) return;
  const n = k.length - bare.length;
  const rest = w.slice(0, w.length - n);
  if (!st.known(rest) && !st.known(bare)) return;
  const end = lower(w.slice(-n));
  record(st, `-${end}`, "enclitic", end === "que" ? "and" : end === "ne" ? "question" : "or");
  setToken(st, 0, rest, (r) => r.slice(0, r.length - n));
}

function lastWords(st) {
  const n = st.tokens.length;
  if (n < 2) return;
  const w = st.tokens[n - 1];
  if (st.lang === "hi" && HI_LIGHT[w]) { record(st, w, "light-verb", HI_LIGHT[w]); dropBack(st, 1); return; }
  if (st.lang === "fa") {
    const k = persianKey(w);
    if (FA_LIGHT[k]) { record(st, w, "light-verb", FA_LIGHT[k]); dropBack(st, 1); return; }
    if (k === "را") { record(st, w, "marker", "object"); dropBack(st, 1); return; }
  }
  if (st.lang === "tl" && /^(?:po|ho)$/i.test(w)) { record(st, w, "polite", "polite"); dropBack(st, 1); }
}

const RULES = {
  ar: [arabicFront], fa: [lastWords], hi: [lastWords], ja: [japaneseEnd], ko: [koreanLight], th: [thaiParts],
  la: [latinEnclitic], zh: [], ru: [],
  es: [frontWords, reflexiveEnding], fr: [frontWords], it: [frontWords, reflexiveEnding], pt: [frontWords, reflexiveEnding],
  ca: [frontWords, reflexiveEnding], de: [frontWords], en: [frontWords], tl: [frontWords, lastWords], ceb: [frontWords],
};

// ---------------------------------------------------------------- the answer

/**
 * The part of `text` (a card's word, as saved) whose sounds the Mnemonic maker should match:
 * {core, reading, dropped: [{part, kind, note, label, extra}]}.
 *   core     what to find sound-alikes for (الكتاب -> كتاب, "der Hund, -e" -> Hund, "to go" -> go)
 *   reading  `reading` (how the app says the whole word: Arabic with its vowel marks, kana, a romanization) cut the
 *            same way; "" when it can't be told which part of it goes, so the caller works it out for the core
 *   dropped  what was left out, in order: `part` as written ("ال"), `kind` (KIND_NAMES), `note` what it means or does
 *            in the learner's language ("“the”"), `label` how the line shows it ("al-"), `extra` true for what was
 *            typed round the word (notes, other forms, labels) rather than a part of the word
 * `isWord(form)` (optional) says whether the caller's dictionary has `form` as a word: the form as the text writes it
 * (Arabic without vowel marks). It is asked before a strip that could be wrong (Arabic bare و ب ل, a two-letter
 * remainder, Latin -que, Italian -si, Korean 말하다); without it those stay. An answer of a dictionary that already
 * takes clitics off (the Arabic analyser) would say yes to anything: give the plain word list instead.
 * Other languages, and words with nothing to leave out, come back as they are.
 */
export function soundCore(text, lang, { isWord = null, reading = "" } = {}) {
  const raw = String(text ?? "");
  const said = String(reading ?? "");
  if (!CORE_LANGS.has(lang) || !raw.trim()) return { core: raw, reading: said, dropped: [] };
  const st = makeState(raw, lang, isWord, said.trim());
  labelsOut(st);
  placeholdersOut(st);
  endDots(st);
  for (const rule of RULES[lang] || []) if (st.tokens.length) rule(st);
  const core = st.tokens.join(" ").trim();
  if (!core) return { core: raw.trim(), reading: said, dropped: [] };
  const dropped = [
    ...st.extras.map((d) => ({ part: d.part, kind: d.kind, note: t(NOTES[d.note] || d.note), label: d.part, extra: true })),
    ...st.dropped.map((d) => ({ part: d.part, kind: d.kind, note: t(NOTES[d.note] || d.note), label: d.label, extra: EXTRA.has(d.kind) })),
  ];
  if (!dropped.length && core === raw.trim()) return { core, reading: said, dropped: [] };
  const r = !said.trim() || st.rLost || !st.rtokens ? "" : st.rtokens.join(" ");
  return { core, reading: r, dropped };
}

/** Did anything of the word itself (not only notes round it) get left out? */
export const leftWordParts = (result) => ((result && result.dropped) || []).filter((d) => !d.extra);

/**
 * The line under "How it sounds" that says what the keywords leave out, in the learner's language: "al- (“the”)
 * left out", "der (“the”) left out"; when only notes or other forms were left out, "Only “amo” is matched.";
 * "" when nothing was.
 */
export function leftOutLine(result) {
  if (!result || !result.dropped || !result.dropped.length) return "";
  const parts = leftWordParts(result);
  if (parts.length) return t("{0} left out", parts.map((d) => `${d.label} (${d.note})`).join(", "));
  return t("Only “{0}” is matched.", result.core);
}

/** For the AI (in English, as the rest of its instructions): what the card's word is and which part of it to match. */
export function corePromptLine(text, result) {
  if (!result || !result.dropped || !result.dropped.length || result.core === String(text).trim()) return "";
  const parts = leftWordParts(result).map((d) => `${d.label} (${d.kind.replace(/-/g, " ")})`);
  const why = parts.length ? `; ${parts.join(", ")} left out` : "; the other forms and notes left out";
  return `The card's word is written "${String(text).trim()}". Find keywords only for "${result.core}"${why}.`;
}
