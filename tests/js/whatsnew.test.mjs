// Run with: node --test tests/js/
// The web app's "What's new" list (web/js/whatsnew.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { compareVersions, whatsNew } from "../../web/js/whatsnew.js";

test("versions compare as numbers", () => {
  assert.ok(compareVersions("0.35.10", "0.35.9") > 0);
  assert.equal(compareVersions("0.36.0", "0.36.0"), 0);
});

test("the list covers every version since the last one seen, newest first", () => {
  const both = whatsNew("0.34.2", "0.36.0", 99);
  const only36 = whatsNew("0.35.0", "0.36.0", 99);
  assert.ok(both.length > only36.length);
  assert.deepEqual(both.slice(0, only36.length), only36, "the newest version's lines come first");
  assert.ok(whatsNew("0.34.2", "0.36.0").length <= 8, "kept short");
  assert.deepEqual(whatsNew("0.36.0", "0.36.0"), []);
});
