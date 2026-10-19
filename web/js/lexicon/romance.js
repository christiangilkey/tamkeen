// Spanish, French, Italian, Portuguese and Catalan: from a word as it is written to its dictionary form (lemma).
//
// hablas, hablaste, hablemos -> hablar; libros -> libro; dámelo -> dar; comiéndoselo -> comer;
// l'homme -> homme; j'ai -> avoir; donne-moi -> donner; mangiarlo -> mangiare; dimmi -> dire;
// falei -> falar; fazê-lo -> fazer; dir-lhe-ei -> dizer; parlem -> parlar; digues-m'ho -> dir; l'home -> home.
//
//   1. clean     lower case, punctuation off the ends (accents are kept: esta and está differ);
//   2. elision   French, Italian and Catalan write some short words joined on with an apostrophe
//                (l'homme, j'ai, c'è, dell'anno, l'home, d'aquí): the word is the part after it;
//   3. look up   a table of word forms and their dictionary forms (made by tools/build_lemmas.py
//                from open word lists; downloaded only by someone learning the language);
//   4. pronouns  a form the table doesn't know may be a verb with pronouns joined on (dámelo,
//                decirle, mangiarlo, donne-moi, fazê-lo, dona-m'ho): take them off and look up what is left.
//
// Without the table (not downloaded yet, or declined) steps 1 and 2 still apply, and a word is
// known by its spelling, as before. No screen or network code here: tests/js/lexicon.test.mjs.
//
// A table file (docs/lexicon/<lang>-lemmas.json.gz) holds:
//   lemmas   [dictionary form, ...]
//   forms    {form: index into lemmas}   only forms that differ from their dictionary form

import { EDGE_PUNCT } from "../wordlookup.js";

export const ROMANCE = new Set(["es", "fr", "it", "pt", "ca"]);

export class LemmaTable {
  constructor(data) {
    if (!data || data.format !== 1 || data.kind !== "lemmas") throw new Error("This word table is from a different version of the app.");
    this.name = data.name;
    this.lang = data.lang;
    this.lemmas = data.lemmas;
    this.forms = data.forms;
    this.isLemma = new Set(data.lemmas);
    this.stress = data.stress || null; // Russian: where each form's stress falls (see russian.js)
    this.shown = data.shown || null;   // Russian: dictionary forms written with ё
    this.ipa = data.ipa || null;       // English: US pronunciations (see english.js)
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
  ca: /^(?:l|d|m|t|s|n)'(?=\p{L})/u,
};

/** The word as the table knows it: lower case, no punctuation round it, the elided piece taken off
 * (unless `elide` is false). */
export function cleanWord(token, lang, elide = true) {
  let w = String(token || "").normalize("NFC").replace(APOSTROPHES, "'").toLowerCase();
  const keepFinal = lang === "it" && /\p{L}'$/u.test(w.replace(/[^\p{L}']+$/u, "")); // po', mo', be': the apostrophe is part of the word
  w = w.replace(EDGE_PUNCT, "");
  if (keepFinal) w += "'";
  const elided = elide && ELIDED[lang];
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
// Portuguese pronouns joined on with a hyphen (dá-me, fazê-lo, deu-lhe), and the future and conditional
// endings that can come after them (dir-lhe-ei, far-se-ia).
const PT_PRONOUNS = new Set(["me", "te", "se", "nos", "vos", "lhe", "lhes", "o", "a", "os", "as", "lo", "la", "los", "las",
  "no", "na", "nas", "mo", "ma", "mos", "mas", "to", "ta", "lho", "lha", "lhos", "lhas"]);
const PT_ENDINGS = new Set(["ei", "ás", "á", "emos", "eis", "ão", "ia", "ias", "íamos", "íeis", "iam"]);
// Catalan pronouns joined on with a hyphen or an apostrophe (dona-m'ho, agafa'l, menjar-se-la, anar-se'n).
const CA_PRONOUNS = new Set(["em", "et", "es", "ens", "us", "el", "la", "els", "les", "li", "ho", "hi", "en", "ne", "me",
  "te", "se", "nos", "vos", "m", "t", "s", "n", "l", "ls", "lo", "los", "ns"]);

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
  } else if (lang === "pt") {
    // fazê-lo, chamá-la, pô-los, parti-lo: before lo/la the verb loses its r (and takes an accent);
    // dá-me, deu-lhe: the verb as it is; dir-lhe-ei, far-se-á: the future's stem (dir, far: see COMMANDS).
    const parts = form.split("-");
    const rest = parts.slice(1);
    const last = rest[rest.length - 1];
    const pronouns = PT_ENDINGS.has(last) && rest.length > 1 ? rest.slice(0, -1) : rest;
    if (parts.length > 1 && parts[0].length > 1 && pronouns.every((p) => PT_PRONOUNS.has(p))) {
      const verb = parts[0];
      if (/^l/.test(rest[0])) {
        const r = { á: "ar", â: "ar", ê: "er", é: "er", ô: "ôr", í: "ir" }[verb.slice(-1)];
        if (r) out.push(verb.slice(0, -1) + r);
        else if (/[aeiu]$/.test(verb)) out.push(`${verb}r`); // parti-lo -> partir
      }
      out.push(verb);
    }
  } else if (lang === "ca") {
    // dona-m'ho, digues-li, agafa'l, menjar-se-la, anar-se'n: the first part is the verb.
    const parts = form.split(/[-']/).filter(Boolean);
    if (parts.length > 1 && parts.slice(1).every((p) => CA_PRONOUNS.has(p))) out.push(parts[0]);
  }
  return [...new Set(out)].filter((s) => s && s !== form);
}

// Short irregular commands that pronouns join onto (díselo, hazlo, dimmi, fallo). On their own
// some are other words (di = "I gave", da = "from"), so they only count when pronouns were joined.
const COMMANDS = {
  es: { di: "decir", haz: "hacer", pon: "poner", sal: "salir", ten: "tener", ven: "venir", ve: "ir", sé: "ser", da: "dar" },
  it: { da: "dare", di: "dire", fa: "fare", sta: "stare", va: "andare" },
  fr: {},
  // (Portuguese: the stems the future is built on, which pronouns can come inside: dir-lhe-ei.)
  pt: { dir: "dizer", far: "fazer", trar: "trazer", dá: "dar", vê: "ver" },
  ca: { fes: "fer", digues: "dir", vés: "anar", ves: "anar", vine: "venir", pren: "prendre", dona: "donar" },
};

const VERB = { es: /(ar|er|ir|ír)$/, it: /(are|ere|ire|rre)$/, fr: /(er|ir|re|oir)$/, pt: /(ar|er|ir|ôr)$/, ca: /(ar|er|ir|re)$/ };

// Words the tables get wrong. Their pronouns fold one person into another (French nous -> le,
// je -> il; Spanish nos -> no, os -> o; Portuguese nós -> nó, "knot"; Catalan nosaltres -> jo, us ->
// tu): each person's pronoun is its own word here. A preposition joined with the article (della, nel,
// du, do, pelo, del, pels) is the preposition, which the tables leave out or confuse (pelo -> pelar).
// And some everyday spellings: Catalan soc (the spelling since 2017) is ser, Brazilian tô and tá are estar.
const OWN = {
  es: { nos: "nosotros", os: "vosotros", usted: "usted", ustedes: "usted", del: "de", al: "a" },
  fr: { je: "je", me: "je", moi: "je", tu: "tu", te: "tu", toi: "tu", elle: "elle", elles: "elle", nous: "nous",
    vous: "vous", leur: "leur", mes: "mon", tes: "ton", des: "des", du: "de", au: "à", aux: "à" },
  it: { col: "con", coi: "con", coll: "con" },
  pt: { nós: "nós", nos: "nós", vós: "vós", vos: "vós", do: "de", da: "de", dos: "de", das: "de", no: "em", na: "em",
    nas: "em", num: "em", numa: "em", nuns: "em", numas: "em", ao: "a", aos: "a", à: "a", às: "a", pelo: "por",
    pela: "por", pelos: "por", pelas: "por", tô: "estar", tá: "estar", tava: "estar" },
  ca: { ens: "nosaltres", nosaltres: "nosaltres", us: "vosaltres", vosaltres: "vosaltres", vostè: "vostè",
    vostès: "vostè", soc: "ser", del: "de", dels: "de", al: "a", als: "a", pel: "per", pels: "per" },
};
// Italian: di, a, da, in, su joined with the article (della, nei, dall', sugli).
for (const [pre, stem] of [["di", "de"], ["a", "a"], ["da", "da"], ["in", "ne"], ["su", "su"]]) {
  for (const end of ["l", "llo", "lla", "i", "gli", "lle", "ll"]) OWN.it[stem + end] = pre;
}

// A command that is also a noun (cuenta "bill", pregunta "question", domanda): with pronouns joined on
// (cuéntamelo, pregúntale, domandami) it is the verb, so the verbs it could be the command of are tried.
const INFINITIVES = { es: { a: ["ar"], e: ["er", "ir"] }, it: { a: ["are"], i: ["ire", "ere"], e: ["ere", "ire"] },
  pt: { a: ["ar"], e: ["er", "ir"] }, ca: { a: ["ar"], e: ["er", "re", "ir"] }, fr: {} };
// The stem's vowel as it is in the infinitive: cuenta -> contar, cierra -> cerrar, pide -> pedir, suona -> sonare.
const UNDIPHTHONG = { es: [["ue", "o"], ["ie", "e"], ["i", "e"]], it: [["uo", "o"], ["ie", "e"]], pt: [], ca: [], fr: [] };
function infinitivesOf(stem, lang) {
  const ends = INFINITIVES[lang][stem.slice(-1)];
  if (!ends) return [];
  const base = stem.slice(0, -1);
  const bases = [base];
  for (const [from, to] of UNDIPHTHONG[lang]) {
    const i = base.lastIndexOf(from);
    if (i > 0) bases.push(base.slice(0, i) + to + base.slice(i + from.length));
  }
  return bases.flatMap((b) => ends.map((e) => b + e));
}

// The absolute superlative: buenísimo -> bueno, buonissime -> buono, lindíssima -> lindo, moltíssim -> molt.
const SUPERLATIVE = { es: /ísim[oa]s?$/, it: /issim[oaie]$/, pt: /íssim[oa]s?$/, ca: /íssim(?:a|es|s)?$/, fr: null };

/** The dictionary form of a word the table doesn't know as it is, or null. */
function unknownForm(word, lang, table) {
  // Only a verb takes pronouns on its end, so what is left must look up as a verb.
  for (const stem of withoutPronouns(word, lang)) {
    const base = COMMANDS[lang][stem] || table.lookup(stem);
    if (base && VERB[lang].test(base)) return base;
    const verb = infinitivesOf(stem, lang).find((v) => table.isLemma.has(v) && VERB[lang].test(v));
    if (verb) return verb;
  }
  const sup = SUPERLATIVE[lang] && word.match(SUPERLATIVE[lang]);
  if (sup) {
    const stem = word.slice(0, sup.index);
    for (const c of [`${stem}o`, `${stem}e`, stem]) if (c.length > 1 && table.lookup(c)) return table.lookup(c);
  }
  return null;
}

/** The lexeme of one word: {key, lemma, pos, root}, or null for something that isn't a word. */
export function romanceLexeme(token, lang, table = null) {
  const word = cleanWord(token, lang);
  if (!/\p{L}/u.test(word)) return null;
  let lemma = word;
  const whole = cleanWord(token, lang, false); // quelqu'un, presqu'île: words of their own, not un, île
  if (table && OWN[lang][word]) lemma = OWN[lang][word];
  else if (table && whole !== word && table.lookup(whole)) lemma = table.lookup(whole);
  else if (table) lemma = table.lookup(word) || unknownForm(word, lang, table) || word;
  return { key: `${lang}|${lemma}|x`, lemma, pos: "", root: "" };
}
