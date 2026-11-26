// Add words (the owner, 2026-11-25): a card's own picture while it is made (prototype add_word_picture), and a pasted
// list in one language, the learner's own or the one being learned (prototype list_kinds).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import zlib from "node:zlib";

import { applyKinds, bareLine, lineLanguage, listKinds, parseList } from "../../web/js/addwords.js";
import { toEnglish, translationsFor } from "../../web/js/voiceask.js";
import { keyedTables } from "../../web/js/lexicon/meaningdata.js";
import { PROTOTYPES } from "../../web/js/prototype.js";

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const dict = (lang) => [keyedTables(JSON.parse(zlib.gunzipSync(readFileSync(new URL(`../../docs/lexicon/${lang}-meanings.json.gz`, import.meta.url))).toString("utf8")))];

test("both are prototypes", () => {
  assert.equal(PROTOTYPES.add_word_picture.released, true, "released for everybody in v0.75.0");
  assert.equal(PROTOTYPES.list_kinds.released, true, "released for everybody in v0.75.0");
});

test("a line alone says its language by its letters, or by the dictionaries; both or neither: can't tell", () => {
  assert.equal(lineLanguage("library", { lang: "ar" }), "native");
  assert.equal(lineLanguage("مكتبة", { lang: "ar" }), "foreign");
  assert.equal(lineLanguage("собака", { lang: "ru" }), "foreign");
  assert.equal(lineLanguage("perro", { lang: "es", study: true, native: false }), "foreign");
  assert.equal(lineLanguage("library", { lang: "es", study: false, native: true }), "native");
  assert.equal(lineLanguage("pan", { lang: "es", study: true, native: true }), "?", "a word in both");
  assert.equal(lineLanguage("xyzzy", { lang: "es", study: false, native: false }), "?", "in neither");
  assert.equal(lineLanguage("dog", { lang: "es" }), "?", "no dictionary here");
  assert.equal(lineLanguage("123", { lang: "es", study: true }), "?", "no letters");
  // the Spanish dictionary tells most lines apart
  const es = dict("es");
  const kind = (w) => lineLanguage(w, { lang: "es", study: toEnglish(es, w, "es").length > 0, native: translationsFor(es, w, "es").length > 0 });
  assert.deepEqual(["perro", "biblioteca", "library", "dog", "to run"].map(kind), ["foreign", "foreign", "native", "native", "native"]);
});

test("lines it can't tell follow the list when the rest agree; a mixed list, or none told: ask once", () => {
  assert.deepEqual(listKinds(["native", "?", "native"]), { kinds: ["native", "native", "native"], ask: false });
  assert.deepEqual(listKinds(["foreign", "?"]), { kinds: ["foreign", "foreign"], ask: false });
  assert.equal(listKinds(["native", "foreign", "?"]).ask, true);
  assert.equal(listKinds(["?", "?"]).ask, true);
  assert.equal(listKinds(["native", "foreign"]).ask, false, "each line told: nothing to ask");
});

test("a line in the learner's own language becomes a card started from its meaning; others stay as they are", () => {
  const { cards } = parseList("library\nperro\ngato = cat", { lang: "es", meaningFirst: true });
  assert.deepEqual(cards.map(bareLine), [true, true, false]);
  const out = applyKinds(cards, ["native", "foreign", ""]);
  assert.deepEqual(out.map((c) => [c.text, c.meaning]), [["", "library"], ["perro", ""], ["gato", "cat"]]);
  assert.deepEqual(applyKinds(cards, ["?", "?", ""], "native").map((c) => c.text), ["", "", "gato"], "the learner's answer, for the lines it couldn't tell");
  assert.deepEqual(applyKinds(cards, ["?", "?", ""], "?").map((c) => c.text), ["library", "perro", "gato"], "the preview: shown as they are until asked");
});

test("Add words: the list's language, asked once; Which meaning? right after Fill in; a picture on each card", () => {
  const wb = read("web/js/components/wordbuilder.js");
  assert.match(wb, /const listKindsOn = feature\("list_kinds"\) && meaningFirst;/);
  assert.match(wb, /await askListLanguage\(\{ own: t\(speaks\(\)\), study: t\(info\.name\)/, "asked once, for the whole list");
  assert.match(wb, /cards = applyKinds\(cards, k\.kinds, rest\);/);
  assert.match(wb, /if \(listKindsOn && feature\("sense_choice"\) && !\(await askMeanings\(addableNow\(\)\)\)\)/, "Fill in asks which meaning");
  assert.match(wb, /if \(feature\("sense_choice"\) && !\(await askMeanings\(list\)\)\)/, "Add asks as before");
  assert.match(wb, /const pictureField = picturesOn\(\) && feature\("add_word_picture"\);/);
  assert.match(wb, /const blob = await shrinkPicture\(file\);/, "made small as the card's own picker does");
  assert.match(wb, /await savePicture\(r\.saved\.id, r\.picture\.blob, cleanMeta\(pictureMeta\(null\)\)\)/, "kept on the card once it is added");
  assert.match(wb, /if \(camera\) input\.setAttribute\("capture", "environment"\);/, "the camera on a phone");
  assert.match(read("web/js/components/wordchoice.js"), /export function askListLanguage\(/);
});
