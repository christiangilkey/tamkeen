// Pasting into "Add words" (web/js/components/wordbuilder.js): text always wins over a picture (a copy from a
// spreadsheet or a document carries a picture of itself too, which used to open Scan), and a pasted list goes into
// the "Paste a list" box to be put right: nothing becomes a card until "Use these" is pressed (the owner, 2026-11-16).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isList } from "../../web/js/addwords.js";

test("a list is more than one line, or a spreadsheet's columns; one word or one line is not", () => {
  assert.equal(isList("كتاب\nقلم"), true);
  assert.equal(isList("hola\r\nadiós\r\n"), true);
  assert.equal(isList("hola\tHello"), true, "one spreadsheet row");
  assert.equal(isList("hola"), false);
  assert.equal(isList("por favor – please"), false, "one card with its meaning stays where it was pasted");
  assert.equal(isList("\n\nhola\n\n"), false, "blank lines don't count");
  assert.equal(isList(""), false);
});

test("pasted text is never scanned, and a list waits in the list box for the button", () => {
  const src = readFileSync(new URL("../../web/js/components/wordbuilder.js", import.meta.url), "utf8");
  const paste = src.slice(src.indexOf("const onPaste = (e) => {"), src.indexOf('document.addEventListener("paste", onPaste);'));
  const textPart = paste.slice(0, paste.indexOf("const files"));
  assert.match(textPart, /getData\("text\/plain"\)/);
  assert.match(textPart, /if \(text\.trim\(\)\) \{[\s\S]*return;/, "text returns before any picture is looked at");
  assert.match(textPart, /isList\(text\)/);
  assert.match(textPart, /setMode\("paste"\);\s*preview\(\);/);
  assert.doesNotMatch(textPart, /useCards|\.cb-use"\)\.click|scanner\(\)/, "nothing is added or scanned by a paste");
  assert.match(src, /Nothing is added until you press the button/);
});
