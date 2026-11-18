// Prototype "key_fallback" (web/js/components/wordbuilder.js): the owner, 2026-11-18: "If my key is rejected don't
// give me a warning just generate it without the key, have a popup show saying the key was rejected ... but have a
// button to say use without key on the popup as well to switch it to not needing the key".
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../../web/js/components/wordbuilder.js", import.meta.url), "utf8");

test("a refused key: the rows are filled in again without AI, then the popup", () => {
  assert.match(src, /if \(err && err\.kind === "key" && feature\("key_fallback"\)\) \{ refusedKey = cfg\.key; refusedProvider = err\.provider; refused\.push\(\.\.\.group\); return; \}/);
  assert.match(src, /const aiReady = \(\) => !noAi\(\) && !!definerConfig\(\)\.key && !refusedHere\(definerConfig\(\)\.key\);/, "that key isn't used again");
  assert.match(src, /if \(refused\.length\) \{\s+await fill\(refused\);\s+keyRefusedPopup\(refusedProvider\);/);
});

test("the popup: keep the key, or use without one (No AI)", () => {
  const at = src.indexOf("function keyRefusedPopup(");
  const body = src.slice(at, src.indexOf("\n}\n", at));
  assert.match(body, /t\("Keep my key"\)/);
  assert.match(body, /t\("Use without a key"\)/);
  assert.match(body, /saveSettings\(\{ definer_mode: "dictionary" \}\)/);
  assert.match(body, /if \(refusedTold === refusedKey\) return;/, "said once for a key");
});

test("a prototype: everyone else keeps the red note", async () => {
  const { PROTOTYPES } = await import("../../web/js/prototype.js");
  assert.equal(PROTOTYPES.key_fallback.released, false);
});
