// The web app's trip to Google's sign-in page and back (mobile/src/js/app.js goToGoogleSignIn, finishWebSignIn).
// The owner, 2026-11-18: "Sign-in was cancelled." twice each time the web app opened from the home screen. An app
// opened from an Android home screen can come back from Google in a fresh window whose tab storage is empty, so the
// trip is kept in the app's storage too, and a "no" for a trip with no record is never shown.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../../mobile/src/js/app.js", import.meta.url), "utf8");

test("the trip is kept in the tab's storage and the app's, and read back from either", () => {
  assert.match(app, /sessionStorage\.setItem\(WEB_SIGNIN_KEY, trip\)/);
  assert.match(app, /localStorage\.setItem\(WEB_SIGNIN_KEY, trip\)/);
  assert.match(app, /const kept = keptTrip\(answer\.get\("state"\)\);/);
  // the app's copy only for the same trip (its state), only while fresh, and used once
  assert.match(app, /app && app\.state === state && Date\.now\(\) - \(Number\(app\.at\) \|\| 0\) < 15 \* 60 \* 1000 \? app : null/);
  assert.match(app, /localStorage\.removeItem\(WEB_SIGNIN_KEY\)/);
  assert.match(app, /sessionStorage\.removeItem\(WEB_SIGNIN_KEY\)/);
});

test("a “no” from Google for a trip with no record says nothing", () => {
  const at = app.indexOf("async function finishWebSignIn()");
  const body = app.slice(at, app.indexOf("\n}\n", at));
  const silent = body.indexOf('if (answer.get("error") && !kept)');
  const shown = body.indexOf('"Sign-in was cancelled."');
  assert.ok(silent > 0 && shown > silent, "the silent case comes before the red message");
});
