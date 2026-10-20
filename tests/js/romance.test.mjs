// Run with: node --test tests/js/
// Spanish, French and Italian seen words: every form of a word must come out as one lexeme.
// These use a small hand-made word table; tests/js/lexicon.test.mjs checks the real ones.
import { test } from "node:test";
import assert from "node:assert/strict";
import { LemmaTable, cleanWord, romanceLexeme, withoutPronouns } from "../../web/js/lexicon/romance.js";
import { lexemeOf, lexemesFor, usesDictionaries, needsDictionaries } from "../../web/js/lexicon/words.js";

function table(lang, pairs, lemmas = []) {
  const all = [...new Set([...Object.values(pairs), ...lemmas])];
  const forms = Object.fromEntries(Object.entries(pairs).map(([f, l]) => [f, all.indexOf(l)]));
  return new LemmaTable({ format: 1, kind: "lemmas", name: lang, lang, lemmas: all, forms });
}

const es = table("es", {
  hablas: "hablar", hablaste: "hablar", hablemos: "hablar", habla: "hablar", hablando: "hablar",
  da: "dar", di: "dar", comiendo: "comer", libros: "libro", ligas: "liga", liguemos: "ligar", ligaste: "ligar",
  casas: "casa", está: "estar", estás: "estar", sentad: "sentar", sentemos: "sentar", vamos: "ir", come: "comer",
}, ["decir", "pelo", "esta", "liga", "ligar", "hacer", "pedir"]);
const fr = table("fr", { ai: "avoir", est: "être", donne: "donner", dis: "dire", allez: "aller", hommes: "homme" },
  ["homme", "aujourd'hui", "peut-être", "il"]);
const it = table("it", { "po'": "poco", mangiando: "mangiare", parlami: "parlare", parliamo: "parlare" },
  ["mangiare", "dire", "dare", "anno", "porre", "fare", "di", "da"]);
const key = (word, lang, t) => romanceLexeme(word, lang, t).key;

test("Spanish conjugations, subjunctive and imperative are one verb", () => {
  for (const w of ["hablar", "hablas", "Hablaste", "hablemos,", "¡Habla!", "hablando"]) assert.equal(key(w, "es", es), "es|hablar|x", w);
  assert.equal(key("liguemos", "es", es), "es|ligar|x");
  assert.equal(key("ligaste", "es", es), "es|ligar|x");
  assert.equal(key("ligas", "es", es), "es|liga|x", "a spelling with two readings takes the table's choice");
  assert.equal(key("libros", "es", es), "es|libro|x");
  assert.notEqual(key("está", "es", es), key("esta", "es", es), "accents are kept: está is estar, esta is not");
});

test("Spanish pronouns joined to a verb come off: dámelo is dar", () => {
  assert.equal(key("dámelo", "es", es), "es|dar|x");
  assert.equal(key("Decirle", "es", es), "es|decir|x");
  assert.equal(key("comiéndoselo", "es", es), "es|comer|x");
  assert.equal(key("cómetelo", "es", es), "es|comer|x");
  assert.equal(key("díselo", "es", es), "es|decir|x", "di + se + lo is the command of decir, not 'I gave'");
  assert.equal(key("hazlo", "es", es), "es|hacer|x");
  assert.equal(key("vámonos", "es", es), "es|ir|x", "vamos loses its -s before nos");
  assert.equal(key("sentaos", "es", es), "es|sentar|x", "sentad loses its -d before os");
  assert.equal(key("sentémonos", "es", es), "es|sentar|x");
  assert.equal(key("pelo", "es", es), "es|pelo|x", "a word the table knows is never cut up (pe + lo)");
  assert.equal(key("pidiéndoles", "es", es), "es|pedir|x", "a gerund the table lacks is found by its ending");
  assert.equal(key("Marcela", "es", es), "es|marcela|x", "only taken off when what is left can be a verb");
});

test("French: elided words and pronouns after a command", () => {
  assert.equal(key("l'homme", "fr", fr), "fr|homme|x");
  assert.equal(key("L’homme", "fr", fr), "fr|homme|x", "curly apostrophe and capitals");
  assert.equal(key("hommes", "fr", fr), "fr|homme|x");
  assert.equal(key("j'ai", "fr", fr), "fr|avoir|x");
  assert.equal(key("c'est", "fr", fr), "fr|être|x");
  assert.equal(key("qu'il", "fr", fr), "fr|il|x");
  assert.equal(key("donne-moi", "fr", fr), "fr|donner|x");
  assert.equal(key("dis-le", "fr", fr), "fr|dire|x");
  assert.equal(key("allez-vous-en", "fr", fr), "fr|aller|x");
  assert.equal(key("aujourd'hui", "fr", fr), "fr|aujourd'hui|x", "not an elision");
  assert.equal(key("peut-être", "fr", fr), "fr|peut-être|x", "a word with a hyphen that the table knows stays whole");
});

test("Italian: elided words and pronouns joined to a verb", () => {
  assert.equal(key("dell'anno", "it", it), "it|anno|x");
  assert.equal(key("l'anno", "it", it), "it|anno|x");
  assert.equal(key("po'", "it", it), "it|poco|x", "po' keeps its apostrophe: it is the word");
  assert.equal(key("mangiarlo", "it", it), "it|mangiare|x");
  assert.equal(key("mangiandolo", "it", it), "it|mangiare|x");
  assert.equal(key("porlo", "it", it), "it|porre|x");
  assert.equal(key("dimmi", "it", it), "it|dire|x");
  assert.equal(key("dammelo", "it", it), "it|dare|x");
  assert.equal(key("fallo", "it", it), "it|fare|x");
  assert.equal(key("parlami", "it", it), "it|parlare|x");
  assert.equal(key("di", "it", it), "it|di|x", "on its own, di is the word 'of'");
});

test("without the table a word is its spelling, as before, but elisions still come off", () => {
  assert.equal(key("Hablas", "es"), "es|hablas|x");
  assert.equal(key("dámelo", "es"), "es|dámelo|x");
  assert.equal(key("l'homme", "fr"), "fr|homme|x");
  assert.equal(romanceLexeme("2024", "es"), null, "numbers aren't words");
  assert.equal(romanceLexeme("—", "fr"), null);
  // A word already in its dictionary form keeps the key it had before tables existed, so words
  // seen back then still count.
  assert.equal(key("hablar", "es", es), key("hablar", "es"));
});

test("the language plumbing", () => {
  assert.deepEqual(["ar", "es", "fr", "it", "ru", "ja", "zh", "xx"].map(usesDictionaries), [true, true, true, true, true, true, true, false]);
  assert.deepEqual(["ar", "es"].map(needsDictionaries), [true, false], "only Arabic waits for its dictionaries");
  assert.deepEqual(lexemesFor(["Hablas", "dámelo"], "es", [es]).map((x) => x.key), ["es|hablar|x", "es|dar|x"]);
  assert.deepEqual(lexemesFor(["Hablas"], "es", null).map((x) => x.key), ["es|hablas|x"]);
  assert.equal(lexemeOf("comiéndoselo", "es", [es]).lemma, "comer");
  assert.equal(cleanWord("«¿Qué?»", "es"), "qué");
  assert.ok(withoutPronouns("dámelo", "es").includes("da"), "dá + me + lo, accent dropped");
  assert.throws(() => new LemmaTable({ format: 2, kind: "lemmas" }));
});

// ---------- the real tables (docs/lexicon/<lang>-lemmas.json.gz, made by tools/build_lemmas.py) ----------
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const real = (lang) => new LemmaTable(JSON.parse(gunzipSync(readFileSync(fileURLToPath(new URL(`../../docs/lexicon/${lang}-lemmas.json.gz`, import.meta.url))))));
const lemmas = (lang, words) => { const t = real(lang); return words.split(" ").map((w) => romanceLexeme(w, lang, t).lemma); };

test("real Spanish table: conjugations, subjunctive, pronouns, plurals and gender", () => {
  assert.deepEqual(lemmas("es", "ligar liguemos ligué ligaste"), ["ligar", "ligar", "ligar", "ligar"]);
  assert.deepEqual(lemmas("es", "hable hablemos hablara hablase háblame"), Array(5).fill("hablar"));
  assert.deepEqual(lemmas("es", "dámelo decirle comiéndoselo díselo vámonos hazlo levantándome"),
    ["dar", "decir", "comer", "decir", "ir", "hacer", "levantar"]);
  assert.deepEqual(lemmas("es", "tengo tuve tendré hizo dijeron puedo quise voy íbamos"),
    ["tener", "tener", "tener", "hacer", "decir", "poder", "querer", "ir", "ir"]);
  assert.deepEqual(lemmas("es", "bonita bonitos niña niños perros grandes mejores"),
    ["bonito", "bonito", "niño", "niño", "perro", "grande", "mejor"]);
  assert.deepEqual(lemmas("es", "casa casas caso"), ["casa", "casa", "caso"], "a common word is never swallowed by a rarer verb");
  assert.notEqual(lemmas("es", "está")[0], lemmas("es", "esta")[0]);
});

// The forms the owner asked about ("subjunctive, conjugations, words with attached pronouns"), checked
// one tense at a time; HANDOFF.md has the before/after table.
const each = (lang, pairs, note = "") => {
  const t = real(lang);
  for (const pair of pairs.trim().split(/\s+/)) {
    const [form, want] = pair.split("=");
    assert.equal(romanceLexeme(form, lang, t).lemma, want, note ? `${form}: ${note}` : form);
  }
};

test("real Spanish table: every tense, regular, stem-changing and irregular", () => {
  each("es", `hablo=hablar comes=comer vivimos=vivir tengo=tener digo=decir conozco=conocer duermo=dormir pido=pedir
    juegan=jugar vuelvo=volver salgo=salir oigo=oír sigo=seguir cojo=coger construyo=construir
    hablé=hablar comió=comer hizo=hacer tuvo=tener estuvo=estar dijo=decir trajo=traer pidió=pedir durmió=dormir
    sintió=sentir pude=poder puso=poner supe=saber quiso=querer anduvo=andar condujo=conducir leyó=leer cayó=caer
    busqué=buscar llegué=llegar empecé=empezar construyeron=construir
    hablaba=hablar comíamos=comer iba=ir era=ser veía=ver
    hablaré=hablar tendré=tener saldrá=salir habrá=haber diré=decir haremos=hacer querrán=querer cabré=caber
    hablaría=hablar tendría=tener haría=hacer diría=decir podríamos=poder saldrían=salir
    hablando=hablar durmiendo=dormir pidiendo=pedir diciendo=decir yendo=ir leyendo=leer oyendo=oír
    hablado=hablar dicho=decir visto=ver puesto=poner vuelto=volver abierto=abrir roto=romper`);
});

test("real Spanish table: present and imperfect subjunctive, -ra and -se, and the old future subjunctive", () => {
  each("es", `hable=hablar coma=comer viva=vivir tenga=tener haga=hacer diga=decir vaya=ir sea=ser esté=estar sepa=saber
    quepa=caber duerma=dormir pida=pedir juegue=jugar busque=buscar llegue=llegar empiece=empezar conozca=conocer
    oiga=oír quiera=querer pueda=poder haya=haber dé=dar vuelva=volver
    hablara=hablar hablase=hablar comiera=comer comiese=comer tuviera=tener tuviese=tener fuera=ser fuéramos=ser
    hiciera=hacer dijera=decir pudiera=poder quisiera=querer supiera=saber estuviera=estar durmiera=dormir
    pidiera=pedir viniera=venir trajera=traer hubiera=haber hubiese=haber hubiere=haber`);
});

test("real Spanish table: commands, and pronouns joined on (one, two or three, with the accent they add)", () => {
  each("es", `habla=hablar hablad=hablar ven=venir pon=poner sal=salir ten=tener haz=hacer di=decir id=ir hagan=hacer
    dámelo=dar dímelo=decir díselo=decir diciéndole=decir acomodarnos=acomodar vámonos=ir dáselo=dar hazlo=hacer
    ponte=poner levántate=levantar cállate=callar dime=decir dame=dar tráemelo=traer cómpralo=comprar
    explícamelo=explicar decírselo=decir dárselas=dar haciéndolo=hacer preguntándose=preguntar mirándonos=mirar
    quedaos=quedar idos=ir sentaos=sentar irse=ir irnos=ir hacerlo=hacer verte=ver verla=ver conocerla=conocer
    despertarme=despertar durmiéndose=dormir póntelo=poner quítatelo=quitar acuérdate=acordar déjame=dejar
    escúchame=escuchar ayúdanos=ayudar mírala=mirar llámame=llamar cuéntaselo=contar dígame=decir hágalo=hacer
    digámoselo=decir sírvase=servir mándenmelo=mandar dénselo=dar váyanse=ir fíjate=fijar divirtiéndonos=divertir
    vistiéndose=vestir riéndose=reír oírte=oír reírse=reír pidiéndoles=pedir sentémonos=sentar duérmete=dormir
    hazme=hacer tenlo=tener ponlo=poner vente=venir cómetelo=comer tráigamelo=traer ríete=reír pónganselo=poner`);
});

test("real Spanish table: the pronouns tell tú, usted and ustedes apart (siéntate is sentar, not sentir)", () => {
  // te goes with tú's command (-a for -ar verbs), se alone with usted's (-e for -ar verbs)
  each("es", `siéntate=sentar siéntese=sentar siéntense=sentar siéntase=sentir vístete=vestir vístanse=vestir
    pídeselo=pedir escúcheme=escuchar cállense=callar véngase=venir vete=ir`);
  each("es", "cómetelo=comer díjole=decir", "the written accent marks the verb's own stress: come-te-lo, not comete-lo");
});

test("real Spanish table: Argentine vos forms, and rarer verbs the table has no forms of", () => {
  each("es", `tenés=tener sabés=saber querés=querer podés=poder decís=decir sos=ser decime=decir contame=contar
    vení=venir mirá=mirar fijate=fijar andá=andar comé=comer
    prorrumpió=prorrumpir desperezándose=desperezar tamborileó=tamborilear contoneándose=contonear holgaba=holgar`);
});

test("real Spanish table: little words stay themselves, common verb forms are verbs, ordinals are words", () => {
  each("es", `como=como para=para entre=entre menos=menos apenas=apenas durante=durante abajo=abajo encima=encima
    que=que algo=algo cinco=cinco siete=siete cien=cien jamás=jamás ojalá=ojalá maese=maese marte=marte
    pasa=pasar debe=deber debes=deber queda=quedar basta=bastar sé=saber
    primera=primero primer=primero primeros=primero tercer=tercero segundas=segundo cuarto=cuarto
    la=el las=el lo=el`);
});

test("real Portuguese and Catalan tables: conjugations, and pronouns joined with hyphens and apostrophes", () => {
  assert.deepEqual(lemmas("pt", "falei falamos estou fiz vou tinha casas meninas"),
    ["falar", "falar", "estar", "fazer", "ir", "ter", "casa", "menino"]);
  assert.deepEqual(lemmas("pt", "fazê-lo chamá-la pô-lo parti-lo dá-me deu-lhe sentar-se dir-lhe-ei far-se-á"),
    ["fazer", "chamar", "pôr", "partir", "dar", "dar", "sentar", "dizer", "fazer"]);
  assert.deepEqual(lemmas("ca", "vaig parlem tinc fem feia llibres gats dones l'home d'aquí s'ha"),
    ["anar", "parlar", "tenir", "fer", "fer", "llibre", "gat", "dona", "home", "aquí", "haver"]);
  assert.deepEqual(lemmas("ca", "dona-m'ho digues-m'ho agafa'l menjar-se-la anar-se'n fes-ho"),
    ["donar", "dir", "agafar", "menjar", "anar", "fer"]);
});

test("real French and Italian tables", () => {
  assert.deepEqual(lemmas("fr", "suis était été allée beaux yeux j'ai c'est donne-moi mangeons chevaux aujourd'hui"),
    ["être", "être", "être", "aller", "beau", "oeil", "avoir", "être", "donner", "manger", "cheval", "aujourd'hui"]);
  assert.deepEqual(lemmas("it", "sono stata belle begli mangiarlo dimmi dammelo andiamo uomini dell'anno po' amiche"),
    ["essere", "essere", "bello", "bello", "mangiare", "dire", "dare", "andare", "uomo", "anno", "poco", "amico"]);
});

test("real tables: each person's pronoun is its own word, and contractions are their preposition", () => {
  assert.deepEqual(lemmas("fr", "je me moi nous vous elle leur mes du aux quelqu'un"),
    ["je", "je", "je", "nous", "vous", "elle", "leur", "mon", "de", "à", "quelqu'un"], "nous is not le, quelqu'un is not un");
  assert.deepEqual(lemmas("es", "nos os ustedes del al"), ["nosotros", "vosotros", "usted", "de", "a"], "nos is not no");
  assert.deepEqual(lemmas("pt", "nós nos do na pelo tô"), ["nós", "nós", "de", "em", "por", "estar"], "nós is not nó, pelo is not pelar");
  assert.deepEqual(lemmas("ca", "ens nosaltres us vosaltres soc del pels"),
    ["nosaltres", "nosaltres", "vosaltres", "vosaltres", "ser", "de", "per"], "nosaltres is not jo, soc is not societat");
  assert.deepEqual(lemmas("it", "della nel dalla sugli col"), ["di", "in", "da", "su", "con"]);
});

test("real tables: a command that is also a noun, and the superlative", () => {
  assert.deepEqual(lemmas("es", "cuéntamelo pregúntale cuenta buenísimo"), ["contar", "preguntar", "cuenta", "bueno"]);
  assert.deepEqual(lemmas("it", "domandami buonissime"), ["domandare", "buono"]);
  assert.deepEqual(lemmas("pt", "lindíssima"), ["lindo"]);
});
