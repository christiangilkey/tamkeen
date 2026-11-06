// Run with: node --test tests/js/
// The changelog shown in Settings (web/js/components/changelog.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { changelogHtml } from "../../web/js/components/changelog.js";

const root = new URL("../../", import.meta.url);

test("the app's copy of the changelog is the same as CHANGELOG.md (copy it over after editing)", () => {
  const a = readFileSync(new URL("CHANGELOG.md", root), "utf8").replace(/\r\n/g, "\n");
  const b = readFileSync(new URL("web/changelog.md", root), "utf8").replace(/\r\n/g, "\n");
  assert.equal(b, a, "run: cp CHANGELOG.md web/changelog.md");
});

test("subheadings and web links are drawn; other links stay plain text", () => {
  const html = changelogHtml("### Studies\n\n- Webb (2009). [https://doi.org/10.1/x](https://doi.org/10.1/x)\n- [bad](javascript:alert(1))");
  assert.ok(html.includes("<h4>Studies</h4>"));
  assert.ok(html.includes('<a href="https://doi.org/10.1/x" target="_blank" rel="noopener">https://doi.org/10.1/x</a>'));
  assert.ok(!html.includes("javascript:alert(1)\""), "only http(s) addresses become links");
  assert.ok(!/<a [^>]*javascript/.test(html));
});

test("What is Tamkeen: the page every version carries, with its studies linked", () => {
  const md = readFileSync(new URL("web/whatis.md", root), "utf8");
  assert.ok(md.includes("## ") && md.length > 5000, "the page has its sections");
  assert.ok(/doi\.org\//.test(md), "the studies are listed with their links");
  const www = readFileSync(new URL("mobile/scripts/build-www.mjs", root), "utf8");
  assert.ok(www.includes('"whatis.md"') && www.includes('"js/components/whatis.js"'), "the phone and web builds carry it");
});

test("headings, lists, bold and italic are drawn; nothing else gets through as HTML", () => {
  const html = changelogHtml("# Title\n\n## v1.0 — 2026-01-01\n\n- **New:** a thing *(web app)*\n- <b>x</b>\n\n---\nText");
  assert.ok(html.includes("<h3>v1.0 — 2026-01-01</h3>"));
  assert.ok(html.includes("<li><strong>New:</strong> a thing <em>(web app)</em></li>"));
  assert.ok(html.includes("&lt;b&gt;x&lt;/b&gt;"));
  assert.ok(html.includes("<hr>") && html.includes("<p>Text</p>"));
  assert.ok(!html.includes("Title"), "the file's own title is left to the box");
});
