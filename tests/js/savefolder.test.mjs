// The word popup's folder button (components/savefolder.js) in place of its microphone, Save saving into the folder it
// shows, and New folder at the top of every folder list (the owner, 2026-11-21).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { vocabFromDefinition } from "../../web/js/languages.js";

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

test("a card saved from the popup carries the folder it was put in; without one, nothing changes", () => {
  const def = { meaning: "book", provider: "dictionary" };
  assert.deepEqual(vocabFromDefinition({ ...def, save_folders: ["d1"] }, "libro", "es").folders, ["d1"]);
  assert.equal("folders" in vocabFromDefinition(def, "libro", "es"), false);
  assert.equal("folders" in vocabFromDefinition({ ...def, save_folders: [] }, "libro", "es"), false);
  assert.deepEqual(vocabFromDefinition({ save_folders: ["d2"] }, "libro", "es"), { text: "libro", meaning: "", notes: "", translation: "", folders: ["d2"] });
});

test("the popup has a folder button beside Save, not the microphone; Save saves into its folder with no question", () => {
  const wb = read("web/js/components/wordbubble.js");
  assert.doesNotMatch(wb, /data-act="add-audio"|icon\("mic"/, "no microphone (Add audio) in the popup");
  assert.match(wb, /data-act="save"[^\n]*\n\s*\$\{folderButton\(\)\}/, "the folder button right after Save");
  assert.match(wb, /case "folder": \{[\s\S]*?await pickFolder\(/);
  assert.doesNotMatch(wb, /askSaveFolder/, "Save asks no folder question");
  const meaning = wb.indexOf("await pickDictionaryMeaning(def, ctx)"), save = wb.indexOf("save_folders: [into]");
  assert.ok(meaning > 0 && save > meaning, "Which meaning? still first, then the save into the button's folder");
  assert.match(wb, /target: lastFolder\(context\.lang \|\| "ar"\)/, "the folder is remembered for the next word");
  // a word they have already: the button shows its folders and Save says Saved (one card per word)
  assert.match(wb, /const haveCard = \(\) => !!shelf\.card && !shelf\.second;/);
  const sf = read("web/js/components/savefolder.js");
  assert.match(sf, /cardFor\(/, "one card per word");
  assert.match(sf, /\/vocab\/bulk-folders/);
  assert.match(sf, /platform !== "extension"/, "the extension has no folders: no button");
  assert.ok(sf.indexOf('class="sf-new"') < sf.indexOf('class="sf-list"'), "New folder at the top of its menu");
  assert.ok(sf.indexOf('["", t("Not in a folder")]') > 0, "then Not in a folder, then the folders");
  // a tap in the menu doesn't close the popup behind it
  for (const p of ["web/js/pages/player.js", "web/js/pages/reels.js", "web/js/pages/book.js", "web/js/pages/reader.js"]) {
    assert.match(read(p), /!e\.target\.closest\("\.modal-back"\)/, p);
  }
  for (const p of ["extension/src/js/ext/panel.js", "extension/src/js/ext/prime-panel.js"]) assert.doesNotMatch(read(p), /onAddAudio/, p);
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
});
