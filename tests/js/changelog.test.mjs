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

test("headings, lists, bold and italic are drawn; nothing else gets through as HTML", () => {
  const html = changelogHtml("# Title\n\n## v1.0 — 2026-01-01\n\n- **New:** a thing *(web app)*\n- <b>x</b>\n\n---\nText");
  assert.ok(html.includes("<h3>v1.0 — 2026-01-01</h3>"));
  assert.ok(html.includes("<li><strong>New:</strong> a thing <em>(web app)</em></li>"));
  assert.ok(html.includes("&lt;b&gt;x&lt;/b&gt;"));
  assert.ok(html.includes("<hr>") && html.includes("<p>Text</p>"));
  assert.ok(!html.includes("Title"), "the file's own title is left to the box");
});
