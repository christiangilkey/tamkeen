// Run with: node --test tests/js/
// The round teal "Import to Tamkeen" button, and "Share → Tamkeen" for the web app.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SHARE_KEYS, firstAddress, sharedPage, withoutShare } from "../../mobile/src/js/share-target.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

test("the first web address in shared text, without trailing punctuation", () => {
  assert.equal(firstAddress("https://www.bbc.com/arabic/articles/c1"), "https://www.bbc.com/arabic/articles/c1");
  // Chrome on Android: the title, then the address, in the text.
  assert.equal(firstAddress("أخبار اليوم - BBC News عربي https://www.bbc.com/arabic/articles/c1?at=1"), "https://www.bbc.com/arabic/articles/c1?at=1");
  assert.equal(firstAddress("Read this (https://example.com/a)."), "https://example.com/a");
  assert.equal(firstAddress("no address here"), "");
  assert.equal(firstAddress(null), "");
});

test("what was shared, from the query the web app is opened with", () => {
  assert.deepEqual(sharedPage(""), { shared: false, url: "" });
  assert.deepEqual(sharedPage("?seed=1"), { shared: false, url: "" });
  const page = "https://www.bbc.com/arabic/articles/c1";
  assert.deepEqual(sharedPage(`?share_url=${encodeURIComponent(page)}`), { shared: true, url: page });
  assert.deepEqual(sharedPage(`?share_title=BBC&share_text=${encodeURIComponent(`BBC ${page}`)}&share_url=`), { shared: true, url: page });
  assert.deepEqual(sharedPage("?share_text=just%20words"), { shared: true, url: "" });
});

test("the app's address without the shared bits", () => {
  assert.equal(withoutShare("https://x.github.io/tamkeen/app/?share_url=https%3A%2F%2Fa.b%2F&share_text=hi"), "/tamkeen/app/");
  assert.equal(withoutShare("https://x.github.io/tamkeen/app/?seed=1&share_url=u#/library"), "/tamkeen/app/?seed=1#/library");
});

test("the web app's manifest offers Share → Tamkeen with the names share-target.js reads", () => {
  const build = read("webapp/build-web.mjs");
  const m = build.match(/share_target: \{ action: "\.\/", method: "GET", params: \{ title: "(\w+)", text: "(\w+)", url: "(\w+)" \} \}/);
  assert.ok(m, "share_target in the manifest");
  assert.deepEqual([m[3], m[2], m[1]], SHARE_KEYS);
});

test("every in-app browser has the round import button, and none still says Import Page", () => {
  const toolbar = read("web/js/browser-toolbar.js");
  assert.match(toolbar, /aria-label", "Import to Tamkeen"/);
  assert.doesNotMatch(toolbar, /"Import Page"/);
  const java = read("mobile/android/app/src/main/java/io/github/christiangilkey/arabicpodcaststudio/InAppBrowser.java");
  assert.match(java, /setContentDescription\("Import to Tamkeen"\)/);
  assert.match(java, /R\.drawable\.ic_tamkeen_import/);
  assert.doesNotMatch(java, /setText\("Import Page"\)/);
  const swift = read("mobile/native-ios/ios/Sources/TamkeenNative/InAppBrowser.swift");
  assert.match(swift, /accessibilityLabel = "Import to Tamkeen"/);
  assert.doesNotMatch(swift, /setTitle\("Import Page"/);
  // No shadow on any of them (the owner's taste: plain solid surfaces).
  assert.doesNotMatch(swift.slice(swift.indexOf("importButton.backgroundColor"), swift.indexOf("importButton.addTarget")), /shadow/);
  assert.doesNotMatch(java.slice(java.indexOf("new ImageButton"), java.indexOf("frame.addView(importButton")), /setElevation\([1-9]/);
});
