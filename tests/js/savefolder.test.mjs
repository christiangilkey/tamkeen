// The word popup's Save asks which folder (components/savefolder.js), and New folder is at the top of every folder
// list (the owner, 2026-11-21).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { saveChoices } from "../../web/js/review/folderpicks.js";
import { vocabFromDefinition } from "../../web/js/languages.js";

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const FOLDERS = [{ uid: "d1", name: "Food" }, { uid: "d2", name: "Travel" }];

test("the folder chosen last time comes first and is marked; then Not in a folder and the folders", () => {
  assert.deepEqual(saveChoices(FOLDERS, "d2").map((c) => [c.key, !!c.last]), [["d2", true], ["none", false], ["d1", false]]);
  assert.deepEqual(saveChoices(FOLDERS, "none").map((c) => [c.key, !!c.last]), [["none", true], ["d1", false], ["d2", false]]);
  // never chosen, or a folder since deleted: the plain order, nothing marked
  for (const last of ["", "gone"]) assert.deepEqual(saveChoices(FOLDERS, last).map((c) => [c.key, !!c.last]), [["none", false], ["d1", false], ["d2", false]]);
  assert.deepEqual(saveChoices([], "").map((c) => c.key), ["none"]);
});

test("a card saved from the popup carries the folder it was put in; without one, nothing changes", () => {
  const def = { meaning: "book", provider: "dictionary" };
  assert.deepEqual(vocabFromDefinition({ ...def, save_folders: ["d1"] }, "libro", "es").folders, ["d1"]);
  assert.equal("folders" in vocabFromDefinition(def, "libro", "es"), false);
  assert.equal("folders" in vocabFromDefinition({ ...def, save_folders: [] }, "libro", "es"), false);
  assert.deepEqual(vocabFromDefinition({ save_folders: ["d2"] }, "libro", "es"), { text: "libro", meaning: "", notes: "", translation: "", folders: ["d2"] });
});

test("Save asks the meaning first, then the folder; a word they have already goes in another folder, not saved twice", () => {
  const wb = read("web/js/components/wordbubble.js");
  const meaning = wb.indexOf("await pickDictionaryMeaning(def, ctx)"), folder = wb.indexOf("await askSaveFolder(");
  assert.ok(meaning > 0 && folder > meaning, "meaning, then folder");
  assert.match(wb, /if \(where === null\) \{ b\.disabled = false; break; \}/, "closing the box saves nothing");
  assert.match(wb, /if \(!where\.filed\) await actions\.onSave\(/, "a card they had is filed, not made again");
  const sf = read("web/js/components/savefolder.js");
  assert.match(sf, /cardFor\(/, "one card per word");
  assert.match(sf, /\/vocab\/bulk-folders/);
  assert.match(sf, /platform === "extension"/, "the extension has no folders to ask about");
  // every place a popup saves makes its card with vocabFromDefinition, which carries the folder
  for (const p of ["web/js/pages/player.js", "web/js/pages/reels.js", "web/js/pages/book.js", "web/js/pages/reader.js",
    "web/js/components/conversepanel.js", "web/js/components/coursewords.js"]) assert.match(read(p), /\.\.\.(vocabFromDefinition\(def|card)/, p);
  // both places a card is saved keep the folders it was given (the computer; the phone and the web app)
  assert.match(read("app/api/vocab.py"), /class VocabIn[\s\S]*?folders: list\[str\] = \[\][\s\S]*?class BatchCard/);
  assert.match(read("mobile/src/js/backend.js"), /folders: savedFolders\(body\.folders\)/);
  assert.match(read("mobile/scripts/build-www.mjs"), /"js\/components\/savefolder\.js"/);
});

test("New folder is at the top of every folder list", () => {
  const vocab = read("web/js/pages/vocab.js");
  const sheet = vocab.slice(vocab.indexOf("function folderSheet"), vocab.indexOf("function folderMenu"));
  assert.ok(sheet.indexOf("vf-new") < sheet.indexOf('row("", "All words"'), "the folder sheet");
  assert.match(vocab, /entries\.unshift\(\{ label: "＋ New folder…"/, "the move-to-folder menu");
  const tools = read("web/js/components/wordtools.js");
  const chips = tools.slice(tools.indexOf("function foldersTool"));
  assert.ok(chips.indexOf("New folder") < chips.indexOf("for (const f of folders())"), "a word's folder chips");
  const wb = read("web/js/components/wordbuilder.js");
  assert.ok(wb.indexOf('new Option(t("New folder…"), "+new")') < wb.indexOf('new Option(t("No folder"), "")'), "Add words' folder");
  assert.match(wb, /m\.body\.append\(where, ask, neu, list, buttons\)/, "Add words' “put it in another folder”");
  const sf = read("web/js/components/savefolder.js");
  assert.ok(sf.indexOf('class="sf-new"') < sf.indexOf('class="sf-list"'), "the popup's Which folder?");
});
