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

test("What is Tamkeen: three pages every version carries, the studies linked", () => {
  const read = (f) => readFileSync(new URL(f, root), "utf8");
  const howto = read("web/whatis-howto.md"), special = read("web/whatis-special.md"), studies = read("web/whatis-studies.md");
  assert.ok(howto.includes("## Getting started") && howto.includes("## Everything Tamkeen can do") && howto.length > 5000, "the guide, then the feature list");
  assert.ok(special.includes("### ") && special.length > 5000, "Tamkeen's own solutions");
  assert.ok(/doi\.org\//.test(studies) && studies.includes("Every study cited"), "the studies are listed with their links");
  const www = read("mobile/scripts/build-www.mjs");
  for (const f of ["whatis-howto.md", "whatis-special.md", "whatis-studies.md", "js/components/whatis.js"]) assert.ok(www.includes(`"${f}"`), `the phone and web builds carry ${f}`);
  for (const f of ["web/js/pages/settings.js", "mobile/src/js/pages/settings.js"]) {
    const s = read(f);
    for (const p of ["howto", "special", "studies"]) assert.ok(s.includes(`data-whatis="${p}"`), `${f} has the ${p} button`);
  }
});

test("What makes Tamkeen special: each part opens and closes, the opening lines stay open", async () => {
  const { foldSections, WHATIS_PAGES } = await import("../../web/js/components/whatis.js");
  assert.equal(WHATIS_PAGES.special.fold, true);
  const html = foldSections(changelogHtml("Intro line.\n\n### One\n- a\n- b\n\n### Two\nText\n\n## Part 2\n- c"));
  assert.ok(html.startsWith("<p>Intro line.</p>"), "the intro is not folded");
  assert.equal((html.match(/<details class="whatis-fold">/g) || []).length, 2);
  assert.ok(html.includes("<summary>One</summary><div class=\"whatis-fold-body\"><ul><li>a</li>"));
  assert.ok(/<\/details><h3>Part 2<\/h3>/.test(html), "a fold ends at the next bigger heading");
  const special = changelogHtml(readFileSync(new URL("web/whatis-special.md", root), "utf8"));
  const folded = foldSections(special);
  for (const head of ["Learning from what you already love", "Your data, kept safe", "Free and private by design", "The creature game"]) {
    assert.ok(folded.includes(`<summary>${head}</summary>`), `"${head}" is a section that opens`);
  }
});

test("headings, lists, bold and italic are drawn; nothing else gets through as HTML", () => {
  const html = changelogHtml("# Title\n\n## v1.0 — 2026-01-01\n\n- **New:** a thing *(web app)*\n- <b>x</b>\n\n---\nText");
  assert.ok(html.includes("<h3>v1.0 — 2026-01-01</h3>"));
  assert.ok(html.includes("<li><strong>New:</strong> a thing <em>(web app)</em></li>"));
  assert.ok(html.includes("&lt;b&gt;x&lt;/b&gt;"));
  assert.ok(html.includes("<hr>") && html.includes("<p>Text</p>"));
  assert.ok(!html.includes("Title"), "the file's own title is left to the box");
});
