// Run with: node --test tests/js/
// The in-app browser's start page: news sites for every language the app teaches, and a
// Google search box.
import { test } from "node:test";
import assert from "node:assert/strict";
import { HOME_CSS, NEWS, hasNews, homeBody, homeHtml, newsFor } from "../../web/js/browser-home.js";
import { LANGUAGE_CODES, LANGUAGES } from "../../web/js/languages.js";

test("every taught language has its own news sites", () => {
  assert.deepEqual(Object.keys(NEWS).sort(), [...LANGUAGE_CODES].sort());
  for (const code of LANGUAGE_CODES) {
    const sites = newsFor(code);
    assert.ok(sites.length >= 12, `${code} has a good handful of sites`);
    assert.equal(new Set(sites.map((s) => s.url)).size, sites.length, `${code}: no site twice`);
    assert.equal(new Set(sites.map((s) => s.name)).size, sites.length, `${code}: no name twice`);
    for (const s of sites) {
      assert.match(s.url, /^https?:\/\/[a-z0-9.-]+\.[a-z]{2,}(\/|$)/, `${code} ${s.name}`);
      assert.ok(s.name.trim() && s.note.trim(), `${code} ${s.url} has a name and a note`);
    }
  }
});

test("news written for learners comes first and is marked", () => {
  assert.ok(newsFor("ja")[0].easy && newsFor("ja")[0].url.includes("/easy"));
  assert.ok(newsFor("fr")[0].easy);
  assert.ok(newsFor("ja").slice(1).every((s) => !s.easy));
  assert.match(homeBody("ja"), /<span class="easy">Easier<\/span>NHK news in simple Japanese/);
});

test("the page has a Google search box and a link for every site", () => {
  for (const code of LANGUAGE_CODES) {
    const body = homeBody(code);
    assert.match(body, /<form action="https:\/\/www\.google\.com\/search" method="get"/);
    assert.match(body, /<input type="search" name="q"/);
    assert.ok(body.includes(`News in ${LANGUAGES[code].name}`), code);
    for (const s of newsFor(code)) assert.ok(body.includes(`href="${s.url}"`), `${code} ${s.url}`);
    assert.equal((body.match(/<a class="site"/g) || []).length, newsFor(code).length);
  }
  assert.match(homeBody("ar"), /lang="ar" dir="rtl">الجزيرة</, "Arabic names read right to left");
  assert.match(homeBody("es"), /lang="es" dir="ltr">El País</);
});

test("an unknown or missing language falls back instead of showing an empty page", () => {
  assert.equal(hasNews("klingon"), false);
  assert.deepEqual(newsFor("klingon"), []);
  assert.equal(homeBody("klingon"), homeBody("ar"));
  assert.equal(homeBody(""), homeBody("ar"));
});

test("the phone's version is one self-contained page", () => {
  const html = homeHtml("fr");
  assert.ok(html.startsWith("<!doctype html>") && html.trim().endsWith("</html>"));
  assert.ok(html.includes(HOME_CSS) && html.includes(homeBody("fr")));
  assert.ok(!/<script/i.test(html), "no script: it must work with nothing else loaded");
  assert.ok(!/<link /i.test(html) && !/src="\//.test(html), "nothing is loaded from the app's own files");
});
