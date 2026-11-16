// Library tabs that need a key not added yet show a small purple note: what is needed, why, and a button to the
// setting (web/js/pages/library.js keyNote, web/js/components/conversepanel.js). YouTube has none: it explains its
// own key where it is needed (components/geminicaptions.js). The owner's wish, 2026-11-16.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

test("the tabs heard from their sound ask for a transcription key on the phones and the web app, not on the computer", () => {
  const lib = read("web/js/pages/library.js");
  assert.match(lib, /const HEARD_KINDS = \["podcasts", "audiobooks", "reels", "videos", "audio"\];/);
  const fn = lib.slice(lib.indexOf("function keyNote("), lib.indexOf("/** Kinds with a panel of their own"));
  assert.match(fn, /platform === "desktop"\) return null/, "the computer writes transcripts itself");
  assert.match(fn, /if \(cfg\.on \|\| cfg\.blocked\) return null/);
  assert.match(fn, /class="key-note"/);
  assert.match(fn, /settingsHref\("listening", "sttkey"\)/);
  assert.doesNotMatch(lib.match(/const HEARD_KINDS = [^;]*;/)[0], /"(youtube|netflix|pages|books|courses)"/);
  assert.match(lib, /const note = keyNote\(kind\);\n\s*if \(note\) head\.append\(note\);/);
});

test("Conversation's AI key note is the same purple note, shown only without a key", () => {
  const cv = read("web/js/components/conversepanel.js");
  assert.match(cv, /<aside class="key-note cv-need" role="note" hidden>/);
  assert.match(cv, /href="#\/settings\?s=words&amp;show=key"/);
  assert.match(cv, /querySelector\("\.cv-need"\)\.hidden = aiReady\(\)/);
  const css = read("web/css/app.css");
  assert.match(css, /\.key-note \{[^}]*background: #8f1d84; color: #fff;/);
  assert.match(css, /\.key-note\[hidden\] \{ display: none; \}/);
});

test("Get the app says what the app adds", () => {
  const phone = read("mobile/src/js/pages/settings.js");
  const sec = phone.slice(phone.indexOf("async function getapp("), phone.indexOf("function data(body)"));
  assert.match(sec, /What you get with the app/);
  assert.match(sec, /<ul class="getapp-gains">/);
  assert.ok((sec.match(/<li>/g) || []).length >= 5);
});
