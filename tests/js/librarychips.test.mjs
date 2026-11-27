// The Library's chips under a tab's heading as one row of on/off chips (prototype "library_chips"; the owner, 2026-11-27:
// "Why is this bar doubled in podcast?" … "Same in YouTube."): "Not listened to" (Not watched / Not read) and, where
// things are transcribed, "Transcribed", with no "All" chips. The page needs a browser, so this reads its source.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PROTOTYPES } from "../../web/js/prototype.js";

const library = readFileSync(new URL("../../web/js/pages/library.js", import.meta.url), "utf8");
const block = library.slice(library.indexOf('if (feature("library_chips")) {'), library.indexOf('group(t("Finished or not"), ['));

test("released for everybody in v0.78.0; the old two rows remain only behind the switch", () => {
  assert.equal(PROTOTYPES.library_chips.released, true, "released for everybody in v0.78.0");
  assert.ok(block.length > 0 && block.includes("return;"), "with it on, the old rows aren't drawn");
  assert.match(library, /group\(t\("Finished or not"\), \[\s*chip\(t\("All"\)/, "the old rows stay for everyone else");
});

test("one row: the kind's own 'not finished' chip, and Transcribed only where things are transcribed; no All", () => {
  assert.doesNotMatch(block, /t\("All"\)/);
  assert.match(block, /chip\(notDoneWord\(kind\), p\.progress \+ p\.new, notDone,/);
  assert.match(block, /if \(transcribable\(kind\)\) chips\.push\(chip\(t\("Transcribed"\), statusCount\("done"\), done,/);
  assert.match(block, /group\(t\("Show only"\), chips\)/);
});

test("each chip toggles; none on shows everything; the choices are kept as before (per tab, and in the address)", () => {
  assert.match(block, /setShow\(notDone \? \[\.\.\.STATES\] : \["progress", "new"\]\)/, "Not listened to: on and off, kept per tab");
  assert.match(block, /goStatus\(done \? "" : "done"\)/, "Transcribed: on and off, in the address so Back undoes it");
  assert.match(block, /const notDone = played === "not", done = filter === "done";/);
});
