// The Vocab list's open word and its header (2026-11-06): what a card gets (review/vocabedit.js, no screen),
// and that the page, the editor and the shared card tools are wired the way the owner asked: a teal outline
// on the open word, every tool of the review card's back, one folder sheet, one sort-and-filter icon, Select.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ADDS, TOOLS, VIEW_DEFAULTS, canKeepRecording, changedView, folderCount, missingParts, narrowed, readSentence,
         sentenceItem, stepFolder, toolsFor } from "../../web/js/review/vocabedit.js";

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

test("an open word offers only the parts it hasn't got, a translation once it has a sentence", () => {
  assert.deepEqual(ADDS.map(([f]) => f), ["meaning", "sentence", "translation", "notes", "memo"]);
  assert.deepEqual(missingParts({ text: "كتاب" }), ["meaning", "sentence", "notes", "memo"]);
  assert.deepEqual(missingParts({ text: "كتاب", meaning: "book", sentence: "هذا ⟦كتاب⟧" }), ["translation", "notes", "memo"]);
  assert.deepEqual(missingParts({ text: "x", meaning: "y", sentence: "s", translation: "t", notes: "n", memo: "m" }), []);
  assert.deepEqual(missingParts({ text: "x", meaning: "  ", sentence: "⟦⟧" }), ["meaning", "sentence", "notes", "memo"], "blank and marks-only count as missing");
});

test("Record only for a card with no sound of its own (a card keeps its first, like a voice)", () => {
  assert.deepEqual(TOOLS.map(([id]) => id), ["mnemonic", "sentence", "record", "folders"]);
  assert.equal(canKeepRecording({ text: "hola" }), true, "typed in: nothing to hear yet");
  assert.equal(canKeepRecording({ text: "hola", clip: 1 }), false, "a friend's clip");
  assert.equal(canKeepRecording({ text: "hola", voice: JSON.stringify({ start: 0, end: 1.2 }) }), false, "a kept voice");
  assert.equal(canKeepRecording({ text: "hola", episode_id: 3, start: 1, end: 2 }), false, "its episode's recording");
  assert.equal(canKeepRecording(null), false);
  assert.deepEqual(toolsFor({ text: "hola" }), ["mnemonic", "sentence", "record", "folders"]);
  assert.deepEqual(toolsFor({ text: "hola", clip: 1 }), ["mnemonic", "sentence", "folders"]);
});

test("Sentence asks the AI for one sentence and its translation, in the card's sense, and skips ones shown", () => {
  const item = sentenceItem({ text: " banco ", meaning: "⟦bank⟧ (money)" });
  assert.deepEqual(item, { word: "banco", meaning: "bank (money)", sentence: "", want: { meaning: false, sentence: true, translation: true } });
  const answer = JSON.stringify({ cards: [{ word: "banco", meaning: "", sentence: "Fui al banco.", translation: "I went to the ⟦bank⟧." }] });
  assert.deepEqual(readSentence(answer, item), { sentence: "Fui al banco.", translation: "I went to the ⟦bank⟧." });
  assert.equal(readSentence(answer, item, ["Fui al banco."]), null, "already shown: Another one wants a new one");
  assert.equal(readSentence("no json here", item), null);
  assert.equal(readSentence({ cards: [{ word: "banco", sentence: "", translation: "" }] }, item), null);
});

test("the header: the sort icon's dot only when the list is narrowed; Reset when anything differs", () => {
  assert.equal(narrowed(VIEW_DEFAULTS), false);
  assert.equal(narrowed({ ...VIEW_DEFAULTS, sort: "alpha" }), false, "a sort alone doesn't narrow");
  assert.equal(narrowed({ ...VIEW_DEFAULTS, range: "week" }), true);
  assert.equal(narrowed({ ...VIEW_DEFAULTS, range: "custom" }), false, "between dates with no dates yet");
  assert.equal(narrowed({ ...VIEW_DEFAULTS, range: "custom", from: "2026-11-01" }), true);
  assert.equal(changedView(VIEW_DEFAULTS), false);
  assert.equal(changedView({ ...VIEW_DEFAULTS, sort: "alpha" }), true);
  assert.equal(changedView({ ...VIEW_DEFAULTS, dateField: "changed" }), true);
});

test("folders: counts for the sheet, and the controller's shoulder buttons go round them", () => {
  const words = [{ folders: ["a"] }, { folders: ["a", "b"] }, { folders: [] }, {}];
  assert.equal(folderCount(words, ""), 4);
  assert.equal(folderCount(words, "none"), 2);
  assert.equal(folderCount(words, "a"), 2);
  assert.equal(folderCount(words, "b"), 1);
  const folders = [{ uid: "a" }, { uid: "b" }];
  assert.equal(stepFolder("", folders, 1), "none");
  assert.equal(stepFolder("none", folders, 1), "a");
  assert.equal(stepFolder("b", folders, 1), "", "round to every word");
  assert.equal(stepFolder("", folders, -1), "b");
  assert.equal(stepFolder("gone", folders, 1), "none", "a folder no longer there counts as every word");
});

test("the Vocab page: one folder sheet, one sort-and-filter icon, Select; the open word is the editor", () => {
  const page = read("web/js/pages/vocab.js");
  for (const id of ["folder-pick", "sort-pick", "select-mode", "bulk-add", "bulk-remove", "bulk-send", "bulk-delete", "select-all"]) {
    assert.match(page, new RegExp(`id="${id}"`), id);
  }
  assert.doesNotMatch(page, /id="folders"|id="sort"|id="range"|id="date-field"|class="row vocab-filters"/, "the old chips and drop-downs are gone");
  assert.doesNotMatch(page, /(^|[^.\w])prompt\(/m, "folder names asked in the app's own box (modal.js askName)");
  assert.match(page, /openWordEditor\(el, v, editorDeps\(v\)\)/);
  assert.match(page, /addEventListener\("folderstep"/, "the controller's folder buttons");
  assert.match(read("web/js/padscreens.js"), /dispatchEvent\(new CustomEvent\("folderstep", \{ detail: step \}\)\)/);
  assert.match(read("web/js/components/modal.js"), /export function askName/);
  assert.doesNotMatch(read("web/js/components/wordbuilder.js"), /function askName/, "one askName, shared");
  // the phone and web app builds carry the new files
  const shared = read("mobile/scripts/build-www.mjs");
  assert.ok(shared.includes('"js/components/wordeditor.js"'));
  assert.ok(shared.includes('"js/review"'), "review/cardtools.js, sentencefind.js and vocabedit.js go with the review folder");
});

test("the open word has every tool of the review card's back, from the same code", () => {
  const editor = read("web/js/components/wordeditor.js");
  const review = read("web/js/pages/review.js");
  const tools = read("web/js/components/wordtools.js");
  for (const tool of ["textBox", "drawLitLine", "partSeconds", "pastedInto"]) {
    assert.match(review, new RegExp(`\\b${tool}\\b`), `review card: ${tool}`);
    assert.match(editor, new RegExp(`\\b${tool}\\b`), `open word: ${tool}`);
  }
  // the row of tools (Mnemonic, Sentence, Record, Folders) is one piece of code that both draw
  assert.match(editor, /const tools = wordTools\(\$\("\.vi-tools"\), panel, v, \{/, "open word: the tools");
  assert.match(review, /tools = wordTools\(face\.querySelector\("\.rv-tools"\), face\.querySelector\("\.rv-tool-panel"\), v, \{/, "review card: the tools");
  assert.match(review, /<div class="vi-tools rv-tools" role="toolbar"/, "review card: the row of tiles on the back");
  for (const tool of ["mnemonicMaker", "mnemonicHtml", "findSentence\\(", "startRecording\\(", "toolsFor\\(v\\)"]) {
    assert.match(tools, new RegExp(`\\b${tool}`), `the tools: ${tool}`);
  }
  assert.doesNotMatch(editor + review, /function (mnemonicTool|sentenceTool|recordTool|foldersTool)\b/, "no second copy of a tool left");
  assert.match(editor, /holdWords\(/, "hold a word of the sentence to light it up");
  assert.match(editor, /practiseButton\(\)/, "Say it");
  assert.doesNotMatch(review, /function mnemonicMaker|function copyText|const HOLD_MS/, "no second copy left in the reviewer");
  assert.ok(read("mobile/scripts/build-www.mjs").includes('"js/components/wordtools.js"'), "the phone and web app carry the tools");
  // in the reviewer's own colours (the owner: light blue on the brand's dark teal, like its other buttons)
  assert.match(read("web/css/review.css"), /\.rv \.vi-tool \{[^}]*background: var\(--accent-soft\); color: var\(--accent\);/);
  // the Vocab page lends the reviewer its folders
  assert.match(read("web/js/pages/vocab.js"), /setFolder: \(w, uid, on\) => applyFolder\(\[w\], uid, on, \{ redraw: false \}\),\s+newFolder,\s+onClose:/);
  const css = read("web/css/app.css");
  assert.match(css, /\.vocab-page \.vocab-item\.open \{ border-color: var\(--accent\); box-shadow: 0 0 0 1px var\(--accent\); \}/, "the brand-teal outline");
});
