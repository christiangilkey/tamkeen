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

/** Spanish: the ways a form can be a verb with pronouns joined on, fewest pronouns first:
 * [{stem, raw, pronouns}], `raw` as written, `pronouns` in order (díselo: di + [se, lo]). */
function spanishSplits(form) {
  const out = [];
  // Up to three: díselo = di + se + lo; comiéndoselo = comiendo + se + lo.
  let stem = form;
  const stripped = [];
  for (let k = 0; k < 3; k++) {
    const m = stem.match(ES_CLITIC);
    if (!m || stem.length - m[0].length < 2) break;
    stripped.unshift(m[0]);
    stem = stem.slice(0, -m[0].length);
    const pronouns = [...stripped];
    const raw = stem;
    let base = unaccent(stem); // the written accent was only there because of the added syllables
    // vámonos, sentémonos, digámoselo: the -s of -mos drops before nos and se
    if ((stripped[0] === "nos" || stripped[0] === "se") && /mo$/.test(base)) base += "s";
    if (stripped[0] === "os" && /[aei]$/.test(base)) out.push({ stem: `${base}d`, raw: `${raw}d`, pronouns }); // sentaos = sentad + os
    out.push({ stem: base, raw: base.endsWith("s") && !raw.endsWith("s") ? `${raw}s` : raw, pronouns });
    if (base !== stem) out.push({ stem, raw, pronouns });
  }
  return out;
}

/** What a form could be once pronouns joined to its end are taken off, best guess first. */
export function withoutPronouns(form, lang) {
  const out = [];
  if (lang === "es") {
    out.push(...spanishSplits(form).map((s) => s.stem));
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
// Spanish also has little words the table reads as a verb's form (como -> comer "to eat", para -> parar,
// entre -> entrar, menos -> me + nos), and common verb forms it reads as another word (pasa -> paso,
// debe -> debe "debit", queda -> queda "curfew", sé -> ser, vete -> vetar, ven -> ver "they see").
const OWN = {
  es: { nos: "nosotros", os: "vosotros", usted: "usted", ustedes: "usted", del: "de", al: "a", las: "el",
    como: "como", para: "para", entre: "entre", menos: "menos", durante: "durante", apenas: "apenas", adelante: "adelante",
    encima: "encima", abajo: "abajo", arriba: "arriba", afuera: "afuera", adentro: "adentro", enfrente: "enfrente",
    acerca: "acerca", salvo: "salvo",
    pasa: "pasar", debe: "deber", debes: "deber", queda: "quedar", resulta: "resultar", basta: "bastar", miras: "mirar",
    sé: "saber", ven: "venir", vete: "ir", des: "dar", sos: "ser", reir: "reír", jamás: "jamás" },
  fr: { je: "je", me: "je", moi: "je", tu: "tu", te: "tu", toi: "tu", elle: "elle", elles: "elle", nous: "nous",
    vous: "vous", leur: "leur", mes: "mon", tes: "ton", des: "des", du: "de", au: "à", aux: "à" },
  it: { col: "con", coi: "con", coll: "con" },
  pt: { nós: "nós", nos: "nós", vós: "vós", vos: "vós", do: "de", da: "de", dos: "de", das: "de", no: "em", na: "em",
    nas: "em", num: "em", numa: "em", nuns: "em", numas: "em", ao: "a", aos: "a", à: "a", às: "a", pelo: "por",
    pela: "por", pelos: "por", pelas: "por", tô: "estar", tá: "estar", tava: "estar" },
  ca: { ens: "nosaltres", nosaltres: "nosaltres", us: "vosaltres", vosaltres: "vosaltres", vostè: "vostè",
    vostès: "vostè", soc: "ser", del: "de", dels: "de", al: "a", als: "a", pel: "per", pels: "per", "pe'l": "per", "pe'ls": "per" },
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
// (Spanish i -> e only in -ir verbs: pide is pedir, but dije is not dejar.)
const UNDIPHTHONG = { es: [["ue", "o"], ["ie", "e"], ["i", "e", "ir"]], it: [["uo", "o"], ["ie", "e"]], pt: [], ca: [], fr: [] };
function infinitivesOf(stem, lang, ends = INFINITIVES[lang][stem.slice(-1)]) {
  const base = stem.slice(0, -1);
  if (!ends || base.length < 2) return []; // (me + nos is not the verb mir)
  const out = ends.map((e) => base + e);
  for (const [from, to, only] of UNDIPHTHONG[lang]) {
    const i = base.lastIndexOf(from);
    if (i > 0) for (const e of ends) if (!only || e === only) out.push(base.slice(0, i) + to + base.slice(i + from.length) + e);
  }
  return out;
}

// The absolute superlative: buenísimo -> bueno, buonissime -> buono, lindíssima -> lindo, moltíssim -> molt.
const SUPERLATIVE = { es: /ísim[oa]s?$/, it: /issim[oaie]$/, pt: /íssim[oa]s?$/, ca: /íssim(?:a|es|s)?$/, fr: null };

// ---------- Spanish verbs the table has no form of ----------
// The table keeps the forms people meet most; a rarer verb's forms (prorrumpió, tamborileaban,
// desperezándose), Argentine "vos" forms (tenés, sabés, vení, decime) and the old future subjunctive
// (hubiere) are found from the verb's regular endings instead: what is left plus -ar, -er or -ir must be
// a verb the table knows. Short endings that nouns and little words have too (-o, -a, -e, -as, -es,
// -an, -en: algo, cinco, que, lucas) are not used on their own; "vos" endings are checked against the
// vosotros form (tenés: tenéis), which the table has for every common verb (jamás: no jamáis).
const ES_AR = "o as a amos áis an é aste ó asteis aron aba abas ábamos abais aban aré arás ará aremos aréis arán aría arías aríamos aríais arían e es és emos éis en ara aras áramos arais aran ase ases ásemos aseis asen are ares áremos areis aren ando ado ada ados adas ad ás á ar";
const ES_ER_IR = "o es e en í iste ió isteis ieron ía ías íamos íais ían a as ás amos áis an iera ieras iéramos ierais ieran iese ieses iésemos ieseis iesen iere ieres iéremos iereis ieren iendo ido ida idos idas yó yeron yera yeras yéramos yerais yeran yese yeses yésemos yeseis yesen yere yendo";
const ES_ER = "emos éis eré erás erá eremos eréis erán ería erías eríamos eríais erían ed és é er";
const ES_IR = "imos ís iré irás irá iremos iréis irán iría irías iríamos iríais irían id ir";
const ES_ENDINGS = new Map();
for (const [list, infs] of [[ES_AR, ["ar"]], [ES_ER_IR, ["er", "ir"]], [ES_ER, ["er"]], [ES_IR, ["ir"]]]) {
  for (const e of list.split(" ")) ES_ENDINGS.set(e, [...new Set([...(ES_ENDINGS.get(e) || []), ...infs])]);
}
const ES_ENDINGS_LONGEST = [...ES_ENDINGS.keys()].sort((a, b) => b.length - a.length);
const ES_SHORT = new Set(["o", "a", "e", "as", "es", "an", "en", "ar", "er", "ir"]); // not on their own
// "vos": the vosotros form that must be known for the ending to count (tenés: tenéis, vení: venid).
const ES_VOS = { ás: "áis", és: "éis", ís: "imos", á: "ad" };
// After pronouns only an infinitive, a gerund or a command can be left (decir-le, diciendo-le, di-le,
// diga-le, digamos-le, digan-le).
const ES_HOST = new Set(["ar", "er", "ir", "ando", "iendo", "yendo", "a", "e", "emos", "amos", "en", "an"]);

/** The stem as it is in the infinitive, with the infinitive endings it can take (null: any):
 * busqu-é busc-ar, empec-é empez-ar, coj-o cog-er, sig-o segu-ir, conozc-o conoc-er, construy-o
 * constru-ir; and its vowel: duerm-o dorm-ir, pid-o ped-ir, jueg-o jug-ar, quier-o quer-er. */
function spanishStems(stem, ending) {
  const out = [[stem, null]];
  const swap = (from, to) => { if (stem.endsWith(from)) out.push([stem.slice(0, -from.length) + to, null]); };
  if (/^[eé]/.test(ending)) { swap("qu", "c"); swap("gu", "g"); swap("gü", "gu"); swap("c", "z"); }
  if (/^[aáoó]/.test(ending)) { swap("zc", "c"); swap("z", "c"); swap("j", "g"); swap("g", "gu"); }
  swap("uy", "u");
  for (const [s] of [...out]) {
    for (const [from, to, only] of [["ue", "o"], ["ie", "e"], ["ue", "u", "ar"], ["ie", "i", "ir"], ["i", "e", "ir"], ["u", "o", "ir"]]) {
      const i = s.lastIndexOf(from);
      if (i > 0) out.push([s.slice(0, i) + to + s.slice(i + from.length), only]);
    }
  }
  return out.filter(([s]) => s.length >= 2);
}

// How many forms of each dictionary form the table keeps: the more, the commoner the word
// (pide: pedir "to ask for", not peder, an old word for "to fart").
const formCounts = new WeakMap();
function commonest(verbs, table) {
  if (verbs.length < 2) return verbs[0] || null;
  if (!formCounts.has(table)) {
    const n = new Map();
    for (const i of Object.values(table.forms)) n.set(i, (n.get(i) || 0) + 1);
    formCounts.set(table, new Map(table.lemmas.map((l, i) => [l, n.get(i) || 0])));
  }
  const counts = formCounts.get(table);
  return verbs.reduce((best, v) => ((counts.get(v) || 0) > (counts.get(best) || 0) ? v : best));
}

// Dictionary forms that end like a verb but aren't one (ayala is not a command of ayer, Lugo not lugar).
const ES_NOT_VERBS = new Set(("ayer lugar mar mujer hogar collar altar azar bar militar familiar particular popular similar " +
  "escolar polar lunar dólar pilar taller menester cráter alfiler éter láser nadir elixir faquir emir visir sir").split(" "));
const isSpanishVerb = (v, table) => table.isLemma.has(v) && !ES_NOT_VERBS.has(v);

/** The infinitive a Spanish verb form the table doesn't know comes from, by its ending, or null.
 * `endings`: only these (after pronouns); otherwise any but the short ones. */
function spanishVerb(form, table, endings = null) {
  for (const ending of ES_ENDINGS_LONGEST) {
    if (!form.endsWith(ending) || (endings ? !endings.has(ending) : ES_SHORT.has(ending))) continue;
    const stem = form.slice(0, -ending.length);
    // (one-letter endings need a longer stem: encabroné, prorrumpí; not olé, aló)
    if (stem.length < (ending.length === 1 ? 3 : 2)) continue;
    const found = spanishStems(stem, ending)
      .flatMap(([s, only]) => ES_ENDINGS.get(ending).filter((inf) => !only || inf === only).map((inf) => s + inf))
      .filter((v) => isSpanishVerb(v, table))
      .filter((v) => !ES_VOS[ending] || endings || table.lookup(stem + ES_VOS[ending]) === v);
    if (found.length) return commonest(found, table);
  }
  return null;
}

// A command before pronouns: te goes with tú (siéntate: sienta, of sentar; vístete: viste, of vestir),
// se on its own with usted (siéntese: siente, sentar's subjunctive), and others with either (dígame,
// dime). tú's command ends in -a for an -ar verb, usted's in -e; for -er and -ir verbs the other way round.
const TU = { a: ["ar"], e: ["er", "ir"] };
const USTED = { a: ["er", "ir"], e: ["ar"] };

// A written accent marks the verb's own stressed syllable, which pronouns don't move: cómetelo is
// come + te + lo (CO-me), not comete (co-ME-te, of cometer) + lo. So the verb part must be stressed
// there: on its last syllable if it ends in a consonant other than n or s (decír-selo) or has one
// syllable (dá-melo), else on the one before (siénta-te, sentí-a-se, vámo(s)-nos). Without an accent
// the pronouns must not have pushed the stress back that far: the verb part has one syllable or ends
// in -r or -d (dime, decirle, sentaos), or is an Argentine command, stressed on its end (decime).
// (An accented í or ú is a syllable of its own, sen-tí-a, and so is each of two of a, e, o: ma-e.)
const syllables = (s) => (s.match(/[íú]|[aeiouáéóü]+/g) || []).length + (s.match(/[aeoáéó](?=[aeoáéó])/g) || []).length;
function stressFits(raw, accent) {
  const penult = /[aeiouáéíóúns]$/.test(raw) && syllables(raw) > 1;
  if (accent < 0) return !penult;
  if (accent >= raw.length) return false;
  return syllables(raw.slice(accent)) - 1 === (penult ? 1 : 0);
}

/** The verb a Spanish form with pronouns joined on belongs to, or null. */
function spanishWithPronouns(word, table) {
  const accent = word.search(/[áéíóú]/);
  for (const { stem, raw, pronouns } of spanishSplits(word)) {
    // Argentine vos commands, stressed on their last syllable: decime (decí + me), contame, decímelo
    const lastSyllable = accent < 0 || syllables(raw.slice(accent)) === 1;
    if (/[aei]$/.test(stem) && lastSyllable && isSpanishVerb(`${stem}r`, table) && table.lookup(`${stem}d`) === `${stem}r`) return `${stem}r`;
    // A verb form with its own accent on its end keeps it (old writing: llegóse, preguntóle, díjole).
    const own = accent >= 0 && lastSyllable && syllables(raw) > 1 && table.lookup(raw);
    if (own && VERB.es.test(own)) return own;
    if (!stressFits(raw, accent)) continue;
    if (COMMANDS.es[stem]) return COMMANDS.es[stem];
    const base = table.lookup(stem);
    const isVerb = base && VERB.es.test(base) && !ES_NOT_VERBS.has(base);
    // (the table's own reading wins among the verbs a command could be of: pide is pedir)
    const pick = (verbs) => (verbs.includes(base) ? base : commonest(verbs, table));
    const last = stem.slice(-1);
    if (/^[ae]$/.test(last)) {
      const readings = pronouns[0] === "te" ? [TU] : pronouns.length === 1 && pronouns[0] === "se" ? [USTED, TU] : [TU, USTED];
      for (const r of readings) {
        const verb = pick(infinitivesOf(stem, "es", r[last]).filter((v) => isSpanishVerb(v, table)));
        if (verb) return verb;
        // usted's irregular commands are the table's: véngase is venir (venga), not vengar; dígame, hágalo
        if (r === USTED && isVerb) return base;
      }
    }
    // ustedes: siéntense (sienten: sentar's subjunctive, not sentir's present), váyanse, dénselo
    if (/[ae]n$/.test(stem) && pronouns[0] === "se") {
      const verb = pick(infinitivesOf(stem.slice(0, -1), "es", USTED[stem.slice(-2, -1)]).filter((v) => isSpanishVerb(v, table)));
      if (verb) return verb;
    }
    if (isVerb) return base;
    const guess = spanishVerb(stem, table, ES_HOST);
    if (guess) return guess;
  }
  return null;
}

/** The dictionary form of a word the table doesn't know as it is, or null. */
function unknownForm(word, lang, table) {
  if (lang === "es") {
    const verb = spanishWithPronouns(word, table) || spanishVerb(word, table);
    if (verb) return verb;
  }
  // Only a verb takes pronouns on its end, so what is left must look up as a verb.
  for (const stem of lang === "es" ? [] : withoutPronouns(word, lang)) {
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
  // The Spanish table gives ordinals as numbers (primera -> 1): the word is the ordinal itself, primero.
  if (/^\d+$/.test(lemma) && /\p{L}/u.test(word)) lemma = word.replace(/s$/, "").replace(/a$/, "o").replace(/^(prim|terc)er$/, "$1ero");
  return { key: `${lang}|${lemma}|x`, lemma, pos: "", root: "" };
}
