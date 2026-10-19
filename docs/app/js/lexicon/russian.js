// Russian: from a word as it is written to its dictionary form, and where its stress falls.
//
// говорю, говорила, скажи, сказала -> говорить (an aspect pair counts as one word, under its
// imperfective); книги, книгой -> книга; новая, новых -> новый. Е and ё count as the same letter,
// and stress marks in the text (ла́дно) are ignored when matching.
//
// The table (docs/lexicon/ru-lemmas.json.gz, made by tools/build_russian.py from the OpenRussian.org
// dictionary) also says where each form's stress falls, so the screens can show ла́дно, сказа́ла,
// and write ё where the text has е (ещё). Without the table a word is known by its spelling, with
// е/ё and stress marks evened out. No screen or network code here: tests/js/russian.test.mjs.
//
// Besides the usual word table (lemmas, forms) the file holds
//   stress   {form: n}   n >= 0: index of the stressed vowel; n < 0: the е at index -n-1 is ё
//   shown    {lemma: how it is written}   for dictionary forms spelled with ё

import { EDGE_PUNCT } from "../wordlookup.js";

const ACUTE = "́";

/** The form Russian words are matched in: lower case, no stress marks, ё as е. */
export const ruMatch = (word) => String(word || "").normalize("NFD").replace(/́/g, "").normalize("NFC")
  .toLowerCase().replace(/ё/g, "е");

// Everyday forms that tables made before 2026-10-19 get wrong or don't have (matching form ->
// dictionary form): where one spelling belonged to two words they took the first in alphabetical
// order (были: быль "true story", not быть; минут: миновать, not минута), and they had no forms of the
// personal pronouns, the small numbers, наш or the future of быть. tools/build_russian.py now gets
// these right; the list stays for the tables already on people's devices (a table is not downloaded
// again once it is there), and gives the same answers as the new table.
const OWN = {};
for (const [lemma, forms] of Object.entries({
  быть: "были будет будут буду будем будешь будете", жить: "жил жила жили", год: "лет", дело: "дела дел", часть: "части",
  наш: "нашей наши наших нашего наша наше нашим нашему нашими", становиться: "стали", находить: "нашли", минута: "минут",
  германия: "германии", вещь: "вещи", мысль: "мысли", песня: "песни", большой: "большая", вода: "воды", готовый: "готов готова",
  пара: "пару", начинать: "начал", тот: "той",
  он: "его него ему нему им ним нем", она: "ее нее ей ней ею нею", они: "их них ими ними", мы: "нас нам нами", вы: "вас вам вами",
  я: "меня мне мной мною", ты: "тебя тебе тобой тобою", кто: "кого кому кем ком", что: "чего чему",
  один: "одной одного одну одним одном одна одно одни одних одними", два: "двух две двум двумя", три: "трех трем тремя",
  четыре: "четырех четырем четырьмя", пять: "пяти пятью", шесть: "шести", десять: "десяти",
})) for (const form of forms.split(" ")) OWN[form] = lemma;

// The same alphabetical choice (in the old tables) gave many past-tense forms to an adjective or noun: стояла, стоял ->
// стоялый (stale), горела -> горелый, дула -> дуло (a gun's muzzle). Those belong to the verb whose
// infinitive is the same stem + ть, when the table has that verb (a word with present-tense forms,
// so мала doesn't become мать).
const VERB_LIKE = /(?:ть|ться|ти|тись|чь|чься)$/;
const PRESENT = /(?:ет|ит|ут|ют|ат|ят|ешь|ишь)(?:ся)?$/;
const verbsOf = new WeakMap(); // table -> Set of its verbs (by their present-tense forms)
function verbs(table) {
  let set = verbsOf.get(table);
  if (!set) {
    set = new Set();
    for (const [form, i] of Object.entries(table.forms)) {
      const lemma = table.lemmas[i];
      if (PRESENT.test(form) && VERB_LIKE.test(lemma)) set.add(lemma);
    }
    verbsOf.set(table, set);
  }
  return set;
}

function pastTenseVerb(form, lemma, table) {
  if (!lemma || VERB_LIKE.test(lemma)) return null;
  const m = form.match(/^(.+)(?:л|ла|ло|ли)(сь|ся)?$/);
  if (!m) return null;
  const infinitive = m[1] + "ть" + (m[2] ? "ся" : "");
  if (table.isLemma.has(infinitive)) return verbs(table).has(infinitive) ? infinitive : null;
  // A perfective comes back as its imperfective partner (почернел -> чернеть). Its gerund (почернев)
  // shows it is a verb's infinitive and not an imperative that looks like one (меть, of метить).
  const verb = table.lookup(infinitive);
  return verb && verbs(table).has(verb) && table.lookup(m[1] + "в" + (m[2] ? "шись" : "")) === verb ? verb : null;
}

/** The dictionary form the table gives a form, after the corrections above. A hyphenated name the
 * table only knows uninflected is looked up by its last part: санкт-петербурге -> санкт-петербург. */
function lookup(form, table) {
  const found = table.lookup(form);
  const old = table.lookup("будет") !== "быть"; // a table made before the fix (it has no future of быть)
  const own = old ? OWN[form] || pastTenseVerb(form, found, table) || found : found;
  if (own || !form.includes("-")) return own;
  const parts = form.split("-");
  const last = (old && OWN[parts[parts.length - 1]]) || table.lookup(parts[parts.length - 1]);
  const whole = last && [...parts.slice(0, -1), last].join("-");
  return whole && table.lookup(whole) ? whole : null;
}

/** The lexeme of one Russian word: {key, lemma, pos, root}, or null for something that isn't a word. */
export function russianLexeme(token, table = null) {
  const form = ruMatch(String(token || "").replace(EDGE_PUNCT, ""));
  if (!/\p{L}/u.test(form)) return null;
  const lemma = (table && lookup(form, table)) || form;
  const shown = (table && table.shown && table.shown[lemma]) || lemma;
  return { key: `ru|${lemma}|x`, lemma: shown, pos: "", root: "" };
}

/** A token with its stress shown (говори́ла, ещё), keeping its case and punctuation. The token
 * as it was when the table doesn't know it, it has one vowel, or it already shows its stress. */
export function stressed(token, table) {
  const text = String(token || "");
  if (!table || !table.stress || text.includes(ACUTE) || /ё/i.test(text)) return text;
  const m = text.match(/[\p{L}-]+/u);
  if (!m) return text;
  const core = m[0];
  const n = table.stress[ruMatch(core)];
  if (n === undefined) return text;
  let marked;
  if (n >= 0) {
    if (n >= core.length) return text;
    marked = core.slice(0, n + 1) + ACUTE + core.slice(n + 1);
  } else {
    const i = -n - 1;
    if (!/[еЕ]/.test(core[i] || "")) return text;
    marked = core.slice(0, i) + (core[i] === "Е" ? "Ё" : "ё") + core.slice(i + 1);
  }
  return text.slice(0, m.index) + marked + text.slice(m.index + core.length);
}
