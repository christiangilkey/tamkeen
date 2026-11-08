// Books: splitting into pages (web/js/bookpages.js) and reading plain-text files (web/js/bookfiles.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { pageOf, paginate } from "../../web/js/bookpages.js";
import { decodeText, looksLikeHeading, textBook } from "../../web/js/bookfiles.js";

const book = (paras) => {
  const texts = [], segOf = [], kinds = [];
  paras.forEach(([kind, text], s) => { kinds.push(kind); for (const w of text.split(" ")) { texts.push(w); segOf.push(s); } });
  return { texts, segOf, kinds };
};

test("pages cover every word once, in order, within the budget", () => {
  const { texts, segOf, kinds } = book([["p", "word ".repeat(500).trim()], ["p", "other ".repeat(300).trim()]]);
  const pages = paginate(texts, segOf, kinds, 400);
  assert.equal(pages[0][0], 0);
  assert.equal(pages.at(-1)[1], texts.length);
  for (let k = 1; k < pages.length; k++) assert.equal(pages[k][0], pages[k - 1][1]);
  for (const [a, b] of pages) assert.ok(texts.slice(a, b).join(" ").length <= 400);
});

test("a chapter heading starts a new page", () => {
  const { texts, segOf, kinds } = book([["p", "one two three"], ["h2", "Chapter II"], ["p", "four five"]]);
  const pages = paginate(texts, segOf, kinds, 10000);
  assert.deepEqual(pages, [[0, 3], [3, 7]]);
  assert.equal(pageOf(pages, 0), 0);
  assert.equal(pageOf(pages, 4), 1);
  assert.equal(pageOf(pages, 6), 1);
});

test("plain text: paragraphs by blank lines, chapter lines as headings, the title when there is one", () => {
  const b = textBook("The Old Sea\n\nChapter I\n\nIt was a long\nday at sea.\n\nThe end.");
  assert.deepEqual(b.blocks.map((x) => x.kind), ["p", "h2", "p", "p"]);
  assert.equal(b.blocks[2].text, "It was a long day at sea.");
  assert.equal(b.title, "The Old Sea");
  assert.equal(textBook("Chapter I\n\nText.").title, ""); // a heading isn't the title: the file name is used
  assert.ok(looksLikeHeading("Глава первая") && looksLikeHeading("第一回") && !looksLikeHeading("He said chapter one was long."));
});

test("text files in older encodings are read too", () => {
  assert.equal(decodeText(Uint8Array.from([0x63, 0x61, 0x66, 0xe9])), "café"); // Windows-1252
  assert.equal(decodeText(new TextEncoder().encode("café")), "café");
});

test("a book's language is read from all through it, not from an English notice at the front", async () => {
  const { bookLanguage, languageSample } = await import("../../web/js/bookfiles.js");
  const notice = { kind: "p", text: "This book was produced in EPUB format by the Internet Archive. The book pages were scanned and converted to EPUB format automatically." };
  const contents = Array.from({ length: 120 }, (_, i) => ({ kind: "li", text: `Page ${i}` }));
  const arabic = Array.from({ length: 200 }, () => ({ kind: "p", text: "في أن الجاه مفيد للمال وفي أن السعادة والكسب إنما تحصل غالبا لأهل الخضوع" }));
  const book = { blocks: [notice, notice, notice, ...contents, ...arabic], language: "ar" };
  assert.ok(languageSample(book.blocks).length <= 2000);
  assert.equal(bookLanguage(book, "ar"), "ar");
  assert.equal(bookLanguage({ ...book, language: "" }, "es"), "ar"); // its letters win over the language being learned
  // Latin letters: the language being learned, else the book's own label, else English.
  const spanish = { blocks: Array.from({ length: 50 }, () => ({ kind: "p", text: "Había una vez un pueblo pequeño junto al mar donde vivía una familia." })) };
  assert.equal(bookLanguage({ ...spanish, language: "es" }, "ar"), "es");
  assert.equal(bookLanguage({ ...spanish, language: "" }, "fr"), "fr");
  assert.equal(bookLanguage({ ...spanish, language: "" }, "ar"), "en");
  assert.equal(bookLanguage({ ...spanish, language: "en-US" }, "es"), "es");
});
