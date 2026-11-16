// The Vocab page with nothing left to do and a goal that wants new words that aren't there (web/js/pages/vocab.js):
// the Review banner turns the brand's purple and its blue "Get words" button opens the Library's Words course;
// the long-term goal card no longer says it too. And the web app's Settings has "Get the app" as a section of its own.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

test("no new words left for the goal: a purple Review banner with a Get words button to the Library", () => {
  const vocab = read("web/js/pages/vocab.js");
  assert.match(vocab, /getWords = !ready && o\.askable && noneLeft;/);
  assert.match(vocab, /banner\.classList\.toggle\("out", getWords\)/);
  assert.match(vocab, /getWords \? "Get words"/);
  assert.match(vocab, /if \(getWords\) location\.hash = "#\/library\?tab=basics"; else startReview\(\);/);
  const css = read("web/css/review.css");
  assert.match(css, /\.review-banner\.out[^{]*\{ background: #8f1d84; color: #fff;/);
  assert.match(css, /\.review-banner\.out \.rb-go \{ background: #22c7d6;/);
  const goal = read("web/js/review/longgoalview.js");
  assert.doesNotMatch(goal, /No new words are waiting|lg-course|lg-add/, "the goal card leaves it to the banner");
});

test("the web app's Settings: Get the app is a section of its own, with a download for each device", async () => {
  const ui = read("web/js/components/settingsui.js");
  const list = ui.slice(ui.indexOf("export const SECTIONS = ["));
  assert.match(list, /^[^{]*\{ id: "getapp"/, "first in the list");
  assert.match(ui, /\{ s: "getapp", id: "getapp", label: "Get the app"[^}]*on: \["web"\] \}/);
  const phone = read("mobile/src/js/pages/settings.js");
  assert.match(phone, /hide: isWeb \? \[\] : \["getapp"\]/);
  for (const f of ["Windows-Setup.exe", "macOS-AppleSilicon.dmg", "Linux-x86_64.AppImage", "Android.apk", "iPhone.ipa"]) assert.ok(phone.includes(f), f);
  assert.match(read("web/js/pages/settings.js"), /hide: \["getapp"\]/);
  // (the names match the files the release attaches: the desktop updater's and the phone builds')
  const names = read("app/updates.py") + read(".github/workflows/android.yml") + read(".github/workflows/ios.yml");
  for (const f of ["Windows-Setup.exe", "macOS-AppleSilicon.dmg", "Linux-x86_64.AppImage", "Android.apk", "iPhone.ipa"]) assert.ok(names.includes(f), f);
});
