// The web app streams the learner's own audio and video from Google Drive through its offline helper (the owner,
// 2026-11-18: "My audio book is not playing at all": a whole audiobook was downloaded before it could start).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

test("the player gets a ./_drive/ address the helper streams, with the player's Range", () => {
  const app = read("mobile/src/js/app.js");
  assert.match(app, /if \(navigator\.serviceWorker && navigator\.serviceWorker\.controller\) \{\s+await accessToken\(\);[^\n]*\n\s+return new URL\(`_drive\/\$\{encodeURIComponent\(id\)\}`, document\.baseURI\)\.href;/);
  assert.match(app, /e\.data\.tamkeen !== "drive-token"/, "the page hands the helper its Google sign-in");
  const build = read("webapp/sw.js"); // (the service worker's code; build-web.mjs copies it into the build)
  assert.match(build, /const range = e\.request\.headers\.get\("Range"\);/);
  assert.match(build, /range \? \{ Range: range \} : \{\}/);
  assert.match(build, /if \(drive && e\.request\.method === "GET"\) \{ e\.respondWith\(fromDrive\(e, drive\[1\]\)\); return; \}/);
});
