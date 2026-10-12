// Run with: node --test tests/js/
// Trending podcasts: sorting into categories, telling when a podcast is already in the library,
// and which language spellings are asked for.
import { test } from "node:test";
import assert from "node:assert/strict";
import { OTHER, feedKey, groupByCategory, languageQuery } from "../../web/js/trending.js";
import { LANGUAGE_CODES } from "../../web/js/languages.js";

test("every taught language asks for its plain code and its regional spellings", () => {
  for (const code of LANGUAGE_CODES) {
    const asked = languageQuery(code).split(",");
    assert.equal(asked[0], code);
    assert.ok(asked.length > 1, code);
    assert.equal(new Set(asked).size, asked.length, `${code}: no repeats`);
    for (const a of asked) assert.match(a, /^[a-z]{2,3}(-[a-z0-9]{2,8})*$/);
  }
  assert.ok(languageQuery("ar").split(",").includes("ar-sa"));
  assert.equal(languageQuery("xx"), "xx");
});

test("the same feed is recognised however its address is written", () => {
  const key = feedKey("https://feeds.example.com/show/");
  for (const url of ["http://feeds.example.com/show", "HTTPS://WWW.feeds.example.com/show//", "  feeds.example.com/show "]) {
    assert.equal(feedKey(url), key, url);
  }
  assert.notEqual(feedKey("https://feeds.example.com/other"), key);
});

test("podcasts are sorted into categories, the fullest first", () => {
  const a = { url: "a", categories: ["News", "Politics"] };
  const b = { url: "b", categories: ["News", " News ", ""] };
  const c = { url: "c", categories: [] };
  const d = { url: "d" };
  const e = { url: "e", categories: ["Arts"] };
  const groups = groupByCategory([a, b, c, d, e]);
  assert.deepEqual(groups.map((g) => [g.name, g.feeds.map((f) => f.url)]),
    [["News", ["a", "b"]], ["Arts", ["e"]], ["Politics", ["a"]], [OTHER, ["c", "d"]]]);
  assert.deepEqual(groupByCategory([]), []);
  assert.deepEqual(groupByCategory(null), []);
});
