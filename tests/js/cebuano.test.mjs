// Run with: node --test tests/js/
// Bisaya (Cebuano) roots: prefixes, suffixes, repeated syllables, the dropped vowel and the linker come
// off, and the result has to be a word in the Bisaya word list (docs/lexicon/ceb-roots.json.gz).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { LemmaTable } from "../../web/js/lexicon/romance.js";
import { cebuanoLexeme, cebuanoRoot, cebuanoWord } from "../../web/js/lexicon/cebuano.js";
import { lexemesFor, usesDictionaries } from "../../web/js/lexicon/words.js";

const list = new LemmaTable(JSON.parse(gunzipSync(readFileSync(fileURLToPath(new URL("../../docs/lexicon/ceb-roots.json.gz", import.meta.url))))));
const roots = (words) => words.split(" ").map((w) => cebuanoRoot(cebuanoWord(w), list));

test("every form of kaon is kaon: mo-, mi-, nag-, gi-, -on, pag-, the command -a", () => {
  assert.deepEqual(roots("mokaon mikaon nagkaon gikaon kaonon pagkaon kaona"), Array(7).fill("kaon"));
});

test("prefixes, suffixes and their spelling changes", () => {
  assert.deepEqual(roots("moadto miadto nangadto"), ["adto", "adto", "adto"]);
  assert.deepEqual(roots("gihatagan hatagan ihatag hatagi"), ["hatag", "hatag", "hatag", "hatag"]);
  assert.deepEqual(roots("magtutudlo"), ["tudlo"], "a repeated first syllable");
  assert.deepEqual(roots("imnon sudlan"), ["inom", "sulod"], "the last vowel dropped and the consonants swapped");
  assert.deepEqual(roots("nagsugod sugdan"), ["sugod", "sugod"], "the last vowel dropped");
  assert.deepEqual(roots("katawhan"), ["tawo"]);
  assert.deepEqual(roots("mahibal-an nahibal-an"), ["hibalo", "hibalo"], "the glottal stop where the vowel was");
  assert.deepEqual(roots("motan-aw pag-abot nag-ingon"), ["tan-aw", "abot", "ingon"], "a prefix joined with a hyphen");
  assert.deepEqual(roots("nangita mangita gipangita nangutana"), ["pangita", "pangita", "pangita", "pangutana"], "paN- words");
  assert.deepEqual(roots("mamalit gipalit"), ["palit", "palit"], "mam- swallows the root's first consonant");
  assert.deepEqual(roots("usang dakong laing karong"), ["usa", "dako", "lain", "karon"], "the linker -ng / -g");
  assert.deepEqual(roots("adlaw-adlaw"), ["adlaw"], "a word said twice");
});

test("words that only look built from smaller ones stay whole", () => {
  assert.deepEqual(roots("akong imong iyang kinahanglan gihapon kanunay"), ["akong", "imong", "iyang", "kinahanglan", "gihapon", "kanunay"]);
  assert.deepEqual(roots("mosulti nahibalo"), ["sulti", "hibalo"], "sulti is not sulat + -i, hibalo not hi- + balo");
  assert.deepEqual(roots("pamilya mobile problema hunahuna"), ["pamilya", "mobile", "problema", "hunahuna"],
    "verb prefixes need a verb: loanwords and doubled words stay whole");
  assert.deepEqual(roots("makatabang"), ["tabang"], "the linker only ends a whole word: tabang is not taba + -ng");
});

test("Bisaya is analyzed with its list; without it a word is known by its spelling", () => {
  assert.ok(usesDictionaries("ceb"));
  assert.equal(cebuanoLexeme("Mokaon,", list).key, "ceb|kaon|x");
  assert.equal(cebuanoLexeme("ako'y", list).lemma, "ako", "a clipped y comes off");
  assert.equal(cebuanoLexeme("mokaon").key, "ceb|mokaon|x");
  assert.equal(cebuanoLexeme("2024", list), null);
  assert.deepEqual(lexemesFor(["Mikaon", "siya"], "ceb", [list]).map((x) => x.lemma), ["kaon", "siya"]);
});

test("common words that only look built from a smaller one, and the linker's commoner reading", () => {
  assert.deepEqual(roots("daghan daghang panahon baybayon pulong butang"), ["daghan", "daghan", "panahon", "baybayon", "pulong", "butang"],
    "daghan is not daga (rat), baybayon not baboy (pig)");
  assert.deepEqual(roots("tawong unang maong maayong"), ["tawo", "una", "mao", "maayo"], "tawong is tawo + -ng, not tawon + -g");
  assert.deepEqual(roots("naminaw paminawa nanguna nangadto"), ["paminaw", "paminaw", "panguna", "adto"]);
});
