// Spanish, French and Italian: from a word as it is written to its dictionary form (lemma).
//
// hablas, hablaste, hablemos -> hablar; libros -> libro; dámelo -> dar; comiéndoselo -> comer;
// l'homme -> homme; j'ai -> avoir; donne-moi -> donner; mangiarlo -> mangiare; dimmi -> dire.
//
//   1. clean     lower case, punctuation off the ends (accents are kept: esta and está differ);
//   2. elision   French and Italian write some short words joined on with an apostrophe
//                (l'homme, j'ai, c'è, dell'anno): the word is the part after it;
//   3. look up   a table of word forms and their dictionary forms (made by tools/build_lemmas.py
//                from open word lists; downloaded only by someone learning the language);
//   4. pronouns  a form the table doesn't know may be a verb with pronouns joined on (dámelo,
//                decirle, mangiarlo, donne-moi): take them off and look up what is left.
//
// Without the table (not downloaded yet, or declined) steps 1 and 2 still apply, and a word is
// known by its spelling, as before. No screen or network code here: tests/js/lexicon.test.mjs.
//
// A table file (docs/lexicon/<lang>-lemmas.json.gz) holds:
//   lemmas   [dictionary form, ...]
//   forms    {form: index into lemmas}   only forms that differ from their dictionary form

import { EDGE_PUNCT } from "../wordlookup.js";

export const ROMANCE = new Set(["es", "fr", "it"]);

export class LemmaTable {
  constructor(data) {
    if (!data || data.format !== 1 || data.kind !== "lemmas") throw new Error("This word table is from a different version of the app.");
    this.name = data.name;
    this.lang = data.lang;
    this.lemmas = data.lemmas;
    this.forms = data.forms;
    this.isLemma = new Set(data.lemmas);
  }

  /** The dictionary form of a word form the table knows, or null. */
  lookup(form) {
    const i = Object.prototype.hasOwnProperty.call(this.forms, form) ? this.forms[form] : undefined;
    if (i !== undefined) return this.lemmas[i];
    return this.isLemma.has(form) ? form : null;
  }
}

// ---------- 1 and 2: the word itself ----------

const APOSTROPHES = /[’ʼ`´]/g;
// What French and Italian join on in front with an apostrophe. Anything after one of these is the word.
const ELIDED = {
  fr: /^(?:l|d|j|m|t|s|n|c|ç|qu|jusqu|lorsqu|puisqu|quoiqu|presqu|quelqu)'(?=\p{L})/u,
  it: /^(?:l|d|s|m|t|v|c|n|un|dell|all|dall|nell|sull|coll|quest|quell|bell|sant|nessun|ciascun|buon|tutt)'(?=\p{L})/u,
};

/** The word as the table knows it: lower case, no punctuation round it, the elided piece taken off. */
export function cleanWord(token, lang) {
  let w = String(token || "").normalize("NFC").replace(APOSTROPHES, "'").toLowerCase();
  const keepFinal = lang === "it" && /\p{L}'$/u.test(w.replace(/[^\p{L}']+$/u, "")); // po', mo', be': the apostrophe is part of the word
  w = w.replace(EDGE_PUNCT, "");
  if (keepFinal) w += "'";
  const elided = ELIDED[lang];
  if (elided) w = w.replace(elided, "");
  return w;
}

// ---------- 4: pronouns joined to the end of a verb ----------

const ACUTE = { á: "a", é: "e", í: "i", ó: "o", ú: "u" };
const unaccent = (s) => s.replace(/[áéíóú]/g, (c) => ACUTE[c]);

const ES_CLITIC = /(me|te|se|nos|os|lo|la|los|las|le|les)$/;
const IT_CLITIC = /(mi|ti|si|ci|vi|lo|la|li|le|ne|gli|glie|me|te|se|ce|ve)$/;
const FR_PRONOUNS = new Set(["moi", "toi", "le", "la", "les", "lui", "leur", "nous", "vous", "en", "y", "t", "il", "elle",
  "on", "ils", "elles", "ce", "je", "tu", "m", "z"]);

/** What a form could be once pronouns joined to its end are taken off, best guess first. */
export function withoutPronouns(form, lang) {
  const out = [];
  if (lang === "es") {
    // Up to three: díselo = di + se + lo; comiéndoselo = comiendo + se + lo.
    let stem = form;
    const stripped = [];
    for (let k = 0; k < 3; k++) {
      const m = stem.match(ES_CLITIC);
      if (!m || stem.length - m[0].length < 2) break;
      stripped.unshift(m[0]);
      stem = stem.slice(0, -m[0].length);
      let base = unaccent(stem); // the written accent was only there because of the added syllables
      if (stripped[0] === "nos" && /mo$/.test(base)) base += "s"; // vámonos, sentémonos: the -s drops before nos
      if (stripped[0] === "os" && /[aei]$/.test(base)) out.push(`${base}d`); // sentaos = sentad + os
      out.push(base);
      if (base !== stem) out.push(stem);
    }
  } else if (lang === "it") {
    // dimmi, dammelo, fallo: after da', di', fa', sta', va' the pronoun's first letter is doubled.
    const doubled = form.match(/^(da|di|fa|sta|va)(mm|tt|ll|cc|ss|gl|vv|nn)/);
    if (doubled) out.push(doubled[1]);
    let stem = form;
    for (let k = 0; k < 3; k++) {
      const m = stem.match(IT_CLITIC);
      if (!m || stem.length - m[0].length < 2) break;
      stem = stem.slice(0, -m[0].length);
      if (/r$/.test(stem)) out.push(`${stem}e`, `${stem}re`); // mangiarlo -> mangiare, porlo -> porre
      out.push(stem);
    }
  } else if (lang === "fr") {
    // donne-moi, dis-le, allez-vous-en, a-t-il: the first part is the verb.
    const parts = form.split("-");
    if (parts.length > 1 && parts.slice(1).every((p) => FR_PRONOUNS.has(p.replace(/'$/, "")))) out.push(parts[0]);
  }
  return [...new Set(out)].filter((s) => s && s !== form);
}

// Short irregular commands that pronouns join onto (díselo, hazlo, dimmi, fallo). On their own
// some are other words (di = "I gave", da = "from"), so they only count when pronouns were joined.
const COMMANDS = {
  es: { di: "decir", haz: "hacer", pon: "poner", sal: "salir", ten: "tener", ven: "venir", ve: "ir", sé: "ser", da: "dar" },
  it: { da: "dare", di: "dire", fa: "fare", sta: "stare", va: "andare" },
  fr: {},
};

const VERB = { es: /(ar|er|ir|ír)$/, it: /(are|ere|ire|rre)$/, fr: /(er|ir|re|oir)$/ };

/** The lexeme of one word: {key, lemma, pos, root}, or null for something that isn't a word. */
export function romanceLexeme(token, lang, table = null) {
  const word = cleanWord(token, lang);
  if (!/\p{L}/u.test(word)) return null;
  let lemma = word;
  if (table) {
    const found = table.lookup(word);
    if (found) lemma = found;
    else {
      // Only a verb takes pronouns on its end, so what is left must look up as a verb.
      for (const stem of withoutPronouns(word, lang)) {
        const base = COMMANDS[lang][stem] || table.lookup(stem);
        if (base && VERB[lang].test(base)) { lemma = base; break; }
      }
    }
  }
  return { key: `${lang}|${lemma}|x`, lemma, pos: "", root: "" };
}
