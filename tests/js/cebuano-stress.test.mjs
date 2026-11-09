// Bisaya stress with no AI, from Wolff's dictionary: the Mnemonic maker reads a Bisaya word with no Wiktionary IPA in
// Wolff's spelling (lexicon/meaningdata.js wolffSpelling, through examples.js freePronunciation) and puts the stress
// where his rule says (review/soundout.js wolffStress): an acute marks the long, stressed vowel; else a closed penult
// is stressed, an open short one isn't. Against the real Wolff file (docs/lexicon/ceb-wolff-meanings.json.gz).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { pronunciationOf } from "../../web/js/review/soundout.js";
import { marksOnto, wolffSpelling } from "../../web/js/lexicon/meaningdata.js";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const wolff = JSON.parse(gunzipSync(readFileSync(new URL("../../docs/lexicon/ceb-wolff-meanings.json.gz", import.meta.url))));
// "pa-ˈlit": the syllables as the Mnemonic maker shows them, the stressed one marked
const shown = (p) => p.syllables.map((s, i) => (i === p.stress ? "ˈ" : "") + s.text).join("-");
// as freePronunciation does it for a word with no Wiktionary IPA: Wolff's spelling is the reading
const sayCeb = (word, meaning = "") => pronunciationOf({ word, lang: "ceb", reading: wolffSpelling(wolff, word, meaning) });

test("palit, hatag and tan-aw sound out with Wolff's stress", () => {
  assert.equal(shown(sayCeb("palit")), "pa-ˈlit", "open short penult: the last syllable");
  assert.equal(shown(sayCeb("hatag")), "ˈha-tag", "his acute: hátag's long a");
  assert.equal(shown(sayCeb("tan-aw")), "ˈtan-'aw", "closed penult (the hyphen is a glottal stop)");
  // without his spelling the old rule stays (today's spelling can't show long vowels): palit on the penult
  assert.equal(shown(pronunciationOf({ word: "palit", lang: "ceb" })), "ˈpa-lit");
});

test("Wolff's spelling: the card's letters with his marks, his spelling chosen by the meaning", () => {
  assert.equal(wolffSpelling(wolff, "hatag"), "hátag");
  assert.equal(wolffSpelling(wolff, "palit"), "palit", "no mark where his rule places the stress");
  assert.equal(wolffSpelling(wolff, "kaun"), "káun", "the card's u stays (Wolff writes káon)");
  assert.equal(wolffSpelling(wolff, "Palit!"), "palit!");
  assert.equal(marksOnto("kaon", "káun"), "káon");
  assert.equal(marksOnto("kaon", "kaáyu"), "", "letters that don't line up");
  // two spellings: bása "read", basà "wet"
  assert.equal(wolffSpelling(wolff, "basa", "to read"), "bása");
  assert.equal(wolffSpelling(wolff, "basa", "wet"), "basà");
  assert.equal(wolffSpelling(wolff, "basa", "nabasa"), "bása", "no word in common: his first, as the popup shows");
  assert.equal(shown(sayCeb("basa", "wet")), "ba-ˈsa'");
  assert.equal(shown(sayCeb("balay", "house")), "ba-ˈlay");
  // a prefix keeps the root's stress (Wolff 5.11): mipalít, gihátag
  assert.equal(wolffSpelling(wolff, "mipalit"), "mipalit");
  assert.equal(shown(sayCeb("mipalit")), "mi-pa-ˈlit");
  assert.equal(wolffSpelling(wolff, "gihatag"), "gihátag");
  assert.equal(shown(sayCeb("nagtan-aw")), "nag-ˈtan-'aw");
  // a word he lacks, or marks that aren't his: no reading (the spelling rules alone)
  assert.equal(wolffSpelling(wolff, "kompyuter"), "");
  assert.equal(wolffSpelling(wolff, "palít"), "", "the learner's own accent is kept and read the old way");
  assert.equal(shown(pronunciationOf({ word: "palít", lang: "ceb", reading: wolffSpelling(wolff, "palít") })), "pa-ˈlit");
  assert.equal(wolffSpelling(wolff, "hátag"), "hátag", "his own marks, as the popup shows the word");
  assert.equal(wolffSpelling(wolff, "ang balay"), "ang balay", "a phrase: every word his");
  assert.equal(wolffSpelling(wolff, "ang kompyuter"), "");
  assert.equal(wolffSpelling(null, "hatag"), "");
});

test("his other marks: a grave is a glottal stop, a wedge a stressed last syllable", () => {
  const baba = sayCeb("baba");
  assert.equal(baba.ipa, "baʔbaʔ", "bàbà: a glottal stop after each a closes the penult");
  assert.equal(shown(baba), "ˈba'-ba'");
  assert.equal(shown(pronunciationOf({ word: "wala", lang: "ceb", reading: "walà" })), "wa-ˈla'");
  assert.equal(shown(pronunciationOf({ word: "mugbu", lang: "ceb", reading: "mugbù" })), "ˈmug-bu'");
  assert.equal(shown(pronunciationOf({ word: "mandar", lang: "ceb", reading: "mandǎr" })), "man-ˈdar");
  // two consonants make a closed syllable, even dl (no Bisaya syllable starts with it, unlike Spanish br, pl)
  assert.equal(shown(sayCeb("tudlo")), "ˈtud-lo'");
  // two vowels side by side have a glottal stop between them, and each is a syllable
  const maayo = pronunciationOf({ word: "maayo", lang: "ceb", reading: "maáyo" });
  assert.equal(maayo.ipa, "maʔajo");
  assert.equal(shown(maayo), "ma-ˈ'a-yo");
  assert.equal(shown(sayCeb("lamisa")), "la-ˈmi-sa");
  assert.equal(shown(sayCeb("ang balay")), "ang-ba-ˈlay", "a phrase: its last word's stress");
});

test("Tagalog and Wiktionary's IPA are as before", () => {
  // Tagalog keeps the penult rule, reading or not
  assert.equal(pronunciationOf({ word: "palit", lang: "tl" }).stress, 0);
  assert.equal(pronunciationOf({ word: "palit", lang: "tl", reading: "palit" }).stress, 0);
  assert.equal(pronunciationOf({ word: "bàbà", lang: "tl" }).ipa, "bàbà");
  // Wiktionary's IPA wins over Wolff's spelling
  const p = pronunciationOf({ word: "hatag", lang: "ceb", ipa: "haˈtaɡ", reading: "hátag" });
  assert.equal(p.from, "wiktionary");
  assert.equal(p.stress, 1);
});

test("the wiring: freePronunciation asks Wolff for Bisaya with no IPA, never downloading; every build has it", () => {
  const examples = read("web/js/examples.js");
  assert.match(examples, /import \{ wolffReading \} from "\.\/meanings\.js";/);
  assert.match(examples, /if \(lang === "ceb" && !ipa && !said\) said = await wolffReading\(c\.core, meaning\)\.catch\(\(\) => ""\);/);
  const meanings = read("web/js/meanings.js");
  const body = meanings.slice(meanings.indexOf("function wolffFile("), meanings.indexOf("// ---------- finding a word"));
  assert.ok(body.length > 100);
  assert.ok(!/lexicon\/download|downloadMeanings|load\(/.test(body), "only a file already on this device");
  assert.match(body, /n === "mean-cebw" && st\.files && st\.files\[n\] && st\.files\[n\]\.installed/);
  // The phone (and so the iPhone and the web app, built from it) copies these files from web/.
  const build = read("mobile/scripts/build-www.mjs");
  for (const f of ["js/meanings.js", "js/examples.js", "js/review", "js/lexicon"]) assert.ok(build.includes(`"${f}"`), f);
});
