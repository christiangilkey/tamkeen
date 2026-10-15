// Run with: node --test tests/js/
// The app's own words in the user's language (web/js/i18n.js) and the dictionaries in web/i18n/.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { UI_LANGUAGES, UI_LANGUAGE_CODES, SPEAK_QUESTION, lookup, setDictionary, t, norm } from "../../web/js/i18n.js";
import { LANGUAGE_CODES } from "../../web/js/languages.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const strings = JSON.parse(readFileSync(join(root, "tools", "i18n", "strings.json"), "utf8"));
const dictionary = (code) => JSON.parse(readFileSync(join(root, "web", "i18n", `${code}.json`), "utf8"));

test("every language the app teaches can also be the language the app is shown in", () => {
  for (const code of LANGUAGE_CODES) assert.ok(UI_LANGUAGES[code], code);
  assert.ok(UI_LANGUAGES.en);
  for (const code of UI_LANGUAGE_CODES) assert.ok(SPEAK_QUESTION[code], `the first box asks in ${code}`);
  assert.equal(UI_LANGUAGES.ar.dir, "rtl");
});

test("words are looked up whole, with values, in brackets, and with English plurals", () => {
  setDictionary({
    "Spanish": "Español",
    "Save": "Guardar",
    "No lookups yet today.": "Hoy aún no hay búsquedas.",
    "Have you already started learning {0}?": "¿Ya has empezado a aprender {0:lower}?",
    "{0} word{1} due": "{0} palabras pendientes",
    "Step {0} of 4": "Paso {0} de 4",
  });
  assert.equal(lookup("Save"), "Guardar");
  assert.equal(lookup("Step 2 of 4"), "Paso 2 de 4");
  assert.equal(lookup("Have you already started learning Spanish?"), "¿Ya has empezado a aprender español?");
  assert.equal(lookup("3 words due"), "3 palabras pendientes");
  assert.equal(lookup("1 word due"), "1 palabras pendientes");
  assert.equal(lookup("(No lookups yet today.)"), "(Hoy aún no hay búsquedas.)");
  assert.equal(lookup("Save:"), "Guardar:");
  // a plural ending is only ever "s": a pattern can't swallow the rest of another sentence
  assert.equal(lookup("12 wordy things due"), null);
  assert.equal(lookup("Something else entirely"), null);
  assert.equal(t("Step {0} of 4", 3), "Paso 3 de 4");
  // a short pattern doesn't take over a long sentence that happens to contain its words
  setDictionary({ "{0} and {1}": "{0} y {1}", "{0} {1}": "{1:upper} de {0}" });
  assert.equal(lookup("Cats and dogs"), "Cats y dogs");
  assert.equal(lookup("Good for clear speech; more mistakes on dialects, accents and fast talk."), null);
  // "{0} {1}" is only for t(), where the translation may reorder and capitalise
  assert.equal(t("{0} {1}", "Brasa", "blob"), "Blob de Brasa");
  assert.equal(lookup("Two words"), null);
  setDictionary(null);
  assert.equal(t("Save"), "Save", "no dictionary: English");
});

test("every dictionary keeps each translation's tags and values, and covers every string", () => {
  const tags = (s) => (s.match(/<\/?\d+\/?>/g) || []).sort().join();
  const holes = (s) => (s.match(/\{\d+(?::lower|:upper)?\}/g) || []).map((h) => h.replace(/:\w+/, ""));
  const files = readdirSync(join(root, "web", "i18n")).filter((f) => f.endsWith(".json"));
  assert.deepEqual(files.map((f) => f.replace(".json", "")).sort(), UI_LANGUAGE_CODES.filter((c) => c !== "en").sort());
  for (const f of files) {
    const code = f.replace(".json", "");
    const d = dictionary(code);
    for (const [k, v] of Object.entries(d)) {
      assert.equal(tags(v), tags(k), `${code}: tags of "${k}"`);
      for (const h of holes(v)) assert.ok(k.includes(h), `${code}: ${h} is not in "${k}"`);
      assert.equal(k, norm(k), `${code}: "${k}" is written as the screen shows it`);
    }
    const missing = strings.filter((s) => !(s.k in d)).map((s) => s.k);
    assert.deepEqual(missing.slice(0, 5), [], `${code}: ${missing.length} strings not translated (run tools/i18n/build.mjs --todo ${code})`);
  }
});
