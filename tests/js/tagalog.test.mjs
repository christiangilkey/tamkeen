// Run with: node --test tests/js/
// Tagalog roots: prefixes, infixes, suffixes, repeated syllables and the linker come off, and the
// result has to be a word in the Filipino word list (docs/lexicon/tl-roots.json.gz).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { LemmaTable } from "../../web/js/lexicon/romance.js";
import { tagalogLexeme, tagalogRoot, tagalogWord } from "../../web/js/lexicon/tagalog.js";
import { lexemesFor, usesDictionaries } from "../../web/js/lexicon/words.js";

const list = new LemmaTable(JSON.parse(gunzipSync(readFileSync(fileURLToPath(new URL("../../docs/lexicon/tl-roots.json.gz", import.meta.url))))));
const roots = (words) => words.split(" ").map((w) => tagalogRoot(tagalogWord(w), list));

test("every form of kain is kain: -um-, -in-, repeated syllable, pag-", () => {
  assert.deepEqual(roots("kumain kakain kinain kumakain kinakain pagkain"), Array(6).fill("kain"));
});

test("prefixes, suffixes and their spelling changes", () => {
  assert.deepEqual(roots("nagluto magluluto niluto"), ["luto", "luto", "luto"]);
  assert.deepEqual(roots("sinabi sasabihin sabihin"), ["sabi", "sabi", "sabi"]);
  assert.deepEqual(roots("umalis aalis"), ["alis", "alis"], "-um- is a prefix before a vowel");
  assert.deepEqual(roots("basahin binasa nilinis"), ["basa", "basa", "linis"]);
  assert.deepEqual(roots("inumin uminom"), ["inom", "inom"], "o turns to u before a suffix");
  assert.deepEqual(roots("bibilhin gagawin ginawa"), ["bili", "gawa", "gawa"], "a vowel dropped before a suffix");
  assert.deepEqual(roots("tinuturuan"), ["turo"]);
  assert.deepEqual(roots("mamili manalo"), ["bili", "talo"], "mam-, man- swallow the root's first consonant");
  assert.deepEqual(roots("nag-aaral pinag-usapan"), ["aral", "usap"], "a prefix joined with a hyphen");
  assert.deepEqual(roots("maganda magandang walang isang"), ["ganda", "ganda", "wala", "isa"], "the linker -ng");
});

test("words that only look affixed stay whole", () => {
  assert.deepEqual(roots("mahal panahon bata tao hindi"), ["mahal", "panahon", "bata", "tao", "hindi"]);
});

test("cleaning and plumbing", () => {
  assert.equal(tagalogWord("“Kumain!”"), "kumain");
  assert.equal(tagalogWord("ako't"), "ako", "a clipped 't (at) comes off");
  assert.equal(tagalogLexeme("Kumakain,", list).key, "tl|kain|x");
  assert.equal(tagalogLexeme("Kumakain").key, "tl|kumakain|x", "without the list: by spelling");
  assert.equal(tagalogLexeme("2024", list), null);
  assert.equal(usesDictionaries("tl"), true);
  assert.deepEqual(lexemesFor(["kinain", "kumain"], "tl", [list]).map((x) => x.key), ["tl|kain|x", "tl|kain|x"]);
});
