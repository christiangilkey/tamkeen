// Run with: node --test tests/js/
// The web app's "add to home screen" button (mobile/src/js/web-install.js). The owner, 2026-11-27: "I already have
// Tamkeen added to my home screen and the purple spinning button on the top is still there." It shows only in a
// browser tab, and goes for good once Tamkeen has run as an app on the device, was installed, or the learner says
// it is on the home screen already; it never spins.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const src = read("mobile/src/js/web-install.js");
const mount = src.slice(src.indexOf("export function mountInstallButton"));

test("the button is never shown in the apps or when Tamkeen opens as an app", () => {
  assert.match(mount, /if \(!isWeb \|\| !topbar\) return;/, "not in the Android, iPhone or desktop apps");
  assert.match(src, /window\.matchMedia\("\(display-mode: standalone\)"\)\.matches \|\| window\.navigator\.standalone === true/);
  assert.match(mount, /if \(standalone\(\)\) \{ remember\(\); return; \}/, "running as an app: remembered for the browser tabs too");
  assert.match(mount, /if \(installed\(\)\) return;/);
});

test("once it is on the home screen the button stays away: installed, or the learner says so", () => {
  assert.match(src, /localStorage\.setItem\(INSTALLED, "1"\)/);
  assert.match(src, /window\.addEventListener\("appinstalled", \(\) => \{ installPrompt = null; remember\(\); \}\);/);
  assert.match(src, /<button type="button" class="ghost" data-have>It's on my home screen already<\/button>/);
  assert.match(src, /box\.querySelector\("\[data-have\]"\)\.addEventListener\("click", \(\) => \{ remember\(\); modal\.close\(\); \}\);/);
});

test("no spinning ring round it (a calm top bar)", () => {
  const css = read("mobile/src/css/mobile.css");
  assert.doesNotMatch(css, /top-install-ring|\.top-install::before/);
});
