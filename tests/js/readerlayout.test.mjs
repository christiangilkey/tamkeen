// One standard look for pages and books: bold/italic marks (web/js/blockmarks.js), headings and title
// pages (web/js/readerlayout.js), filled pages (web/js/bookpages.js), the text size (web/js/textsize.js),
// and marks surviving extraction from HTML, Word-style runs and plain text (extract.js, bookfiles.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { blockKind, cleanKind, decodeKind, encodeKind, marksFromRuns, wordFlags, BOLD, ITALIC } from "../../web/js/blockmarks.js";
import { blockTag, frontMatterEnd, guessHeading, isCapsHeading, layoutBlocks, marksLookup, wordStyle } from "../../web/js/readerlayout.js";
import { pageOf, paginateBlocks } from "../../web/js/bookpages.js";
import { isAbsurdPageSize, pageScale, pageSize, PAGE_SIZE_DEFAULT, PAGE_SIZE_MAX } from "../../web/js/textsize.js";
import { textBook } from "../../web/js/bookfiles.js";
import { extractArticle } from "../../web/js/extract.js";

// ---------- a tiny DOM, enough for extract.js and runsOf (no browser in these tests) ----------
class Node_ {
  constructor(type, tag = "", value = "") { this.nodeType = type; this.tagName = tag.toUpperCase(); this.nodeValue = value; this.childNodes = []; this.parentNode = null; this.attrs = {}; }
  get firstChild() { return this.childNodes[0] || null; }
  get nextSibling() { const s = this.parentNode && this.parentNode.childNodes; return s ? s[s.indexOf(this) + 1] || null : null; }
  get parentElement() { return this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null; }
  get children() { return this.childNodes.filter((c) => c.nodeType === 1); }
  get textContent() { return this.nodeType === 3 ? this.nodeValue : this.childNodes.map((c) => c.textContent).join(""); }
  get className() { return this.attrs.class || ""; }
  get id() { return this.attrs.id || ""; }
  getAttribute(n) { return n in this.attrs ? this.attrs[n] : null; }
  append(...cs) { for (const c of cs) { c.parentNode = this; this.childNodes.push(c); } return this; }
  removeChild(c) { this.childNodes.splice(this.childNodes.indexOf(c), 1); c.parentNode = null; }
  cloneNode() { const n = new Node_(this.nodeType, this.tagName, this.nodeValue); n.attrs = { ...this.attrs }; for (const c of this.childNodes) n.append(c.cloneNode()); return n; }
  all() { return this.childNodes.flatMap((c) => (c.nodeType === 1 ? [c, ...c.all()] : [])); }
  matches(sel) { return sel.split(",").some((s) => one(this, s.trim())); }
  closest(sel) { for (let n = this; n && n.nodeType === 1; n = n.parentNode) if (n.matches(sel)) return n; return null; }
  contains(n) { for (; n; n = n.parentNode) if (n === this) return true; return false; }
  querySelectorAll(sel) { return this.all().filter((e) => e.matches(sel)); }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
}
function one(el, s) {
  if (el.nodeType !== 1) return false;
  if (s.startsWith(".")) return (" " + el.className + " ").includes(" " + s.slice(1) + " ");
  if (s.startsWith("[")) return false;
  if (s.startsWith("#")) return el.id === s.slice(1);
  return el.tagName === s.toUpperCase();
}
const E = (tag, attrs = {}, ...kids) => { const n = new Node_(1, tag); n.attrs = attrs; n.append(...kids.map((k) => (typeof k === "string" ? new Node_(3, "", k) : k))); return n; };
const doc = (body) => { const html = E("html", { lang: "es" }, E("head"), body); return { body, documentElement: html, title: "Una página", querySelector: (s) => html.querySelector(s), querySelectorAll: (s) => html.querySelectorAll(s) }; };

// ---------- marks ----------
test("marks are kept in the kind, old plain kinds still read, odd ones are dropped", () => {
  assert.equal(encodeKind("p", [[0, 2, BOLD], [5, 5, ITALIC], [9, 10, BOLD | ITALIC]], 20), "p|b0-2,i5,bi9-10");
  assert.deepEqual(decodeKind("p|b0-2,i5,bi9-10"), { base: "p", marks: [[0, 2, BOLD], [5, 5, ITALIC], [9, 10, BOLD | ITALIC]] });
  assert.deepEqual(decodeKind("li"), { base: "li", marks: [] });
  assert.deepEqual(decodeKind("weird|x1,b3"), { base: "p", marks: [[3, 3, BOLD]] });
  assert.equal(cleanKind("p|b0-9", 3), "p|b0-2"); // beyond the block's words: cut
  assert.equal(cleanKind("h2|b0"), "h2"); // headings are bold already
  assert.equal(blockKind({ kind: "q", marks: [[1, 1, ITALIC]] }, 4), "q|i1");
  assert.equal(blockKind({ kind: "p" }, 4), "p");
  assert.deepEqual([...wordFlags([[1, 2, BOLD]], 4)], [0, 1, 1, 0]);
});

test("styled runs become words with marks, split exactly as stored", () => {
  const r = marksFromRuns([{ text: "Después de " }, { text: "casi veinte años", b: true }, { text: ",  el​ tren " }, { text: "llegó", i: true }, { text: "." }]);
  assert.equal(r.text, "Después de casi veinte años, el tren llegó.");
  assert.deepEqual(r.marks, [[2, 2, BOLD], [3, 3, BOLD], [4, 4, BOLD], [7, 7, ITALIC]]);
  assert.equal(encodeKind("p", r.marks, r.text.split(" ").length), "p|b2-4,i7");
});

test("a web page's bold, italic, headings, lists and quotes survive extraction", () => {
  const article = E("article", {},
    E("h1", {}, "El tren llega"),
    E("p", {}, E("strong", {}, "Después de veinte años"), ", el tren ha ", E("em", {}, "salido"), " hoy."),
    E("h2", {}, "Un viaje corto"),
    E("p", {}, "Cuesta ", E("span", { style: "font-weight: 700" }, "treinta euros"), " por trayecto, nada más."),
    E("blockquote", {}, E("p", {}, "Es un día histórico para todos nosotros aquí.")),
    E("ul", {}, E("li", {}, "Jóvenes: un 40 % menos en todos los trenes.")),
  );
  const a = extractArticle(doc(E("body", {}, article)), "https://example.com/tren");
  assert.equal(a.title, "El tren llega"); // (the page's own h1 is its title, not a block)
  assert.deepEqual(a.blocks.map((b) => b.kind), ["p", "h2", "p", "q", "li"]);
  assert.equal(a.blocks[0].text, "Después de veinte años, el tren ha salido hoy.");
  assert.deepEqual(a.blocks[0].marks, [[0, 0, 1], [1, 1, 1], [2, 2, 1], [3, 3, 1], [7, 7, 2]]);
  assert.equal(blockKind(a.blocks[0], a.blocks[0].text.split(" ").length), "p|b0-3,i7");
  assert.equal(blockKind(a.blocks[2], a.blocks[2].text.split(" ").length), "p|b1-2");
  assert.equal(a.blocks[1].marks, undefined);
});

test("plain text keeps Gutenberg's _italics_, Markdown's **bold**, and finds headings", () => {
  const b = textBook("LARAWAN\n\nIt was _very_ late.\n\nCHAPTER IV\n\nIV.\n\nThe end.");
  assert.deepEqual(b.blocks.map((x) => x.kind), ["h2", "p", "h2", "h3", "p"]);
  assert.equal(b.blocks[1].text, "It was very late.");
  assert.deepEqual(b.blocks[1].marks, [[2, 2, ITALIC]]);
  const md = textBook("# Title\n\n## Part one\n\nSome **bold words** and *one* more.", true);
  assert.deepEqual(md.blocks.map((x) => x.kind), ["h1", "h2", "p"]);
  assert.equal(md.blocks[2].text, "Some bold words and one more.");
  assert.equal(blockKind(md.blocks[2], 6), "p|b1-2,i4");
});

// ---------- headings and the title page ----------
test("headings guessed from plain lines: capitals, chapter lines, section numbers", () => {
  assert.ok(isCapsHeading("SI AMBOY, ANG PALAHUBOG"));
  assert.ok(!isCapsHeading("¡NO!") && !isCapsHeading("«JEANNE.»") && !isCapsHeading("CURRER BELL.") && !isCapsHeading("Just a line"));
  assert.ok(!isCapsHeading("كان يا ما كان")); // no capitals in Arabic
  assert.equal(guessHeading("Chapter 3"), 2);
  assert.equal(guessHeading("第三章"), 2);
  assert.equal(guessHeading("บทที่ 2"), 2);
  assert.equal(guessHeading("Глава первая"), 2);
  assert.equal(guessHeading("IV."), 3);
  assert.equal(guessHeading("He said chapter one was long."), 0);
});

const larawan = [
  ["p", "Bili: P 1.00"], ["p", "LARAWAN"], ["p", "(MGA SUGILANON UG DINALÍDALÍ)"], ["p", "Sinulat ni VICENTE RAMA"],
  ["p", "Pangulo Sa \"Bag-ong Kusog\""], ["p", "Unang patik: 3,000"], ["p", "Sugbo."], ["p", "1921."],
  ["h2", "UPAT KA PULONG"], ["p", "(Alang sa Magbabasa)"],
  ["p", "Kining basahon nga karon akong itugyan sa imong mga kamut ug nga nganlan kog LARAWAN timaan nga ang tagsulat igo lang nanguhag hulagway akong gisulat."],
  ["p", "SI AMBOY, ANG PALAHUBOG"], ["h2", "I."], ["p", "Si Amboy maoy usa ka tawo nga walay pagbalhin sa iyang batasan."],
].map(([kind, text], idx) => ({ idx, kind, text }));

test("a book's title page becomes one small title block, with the title found in it", () => {
  assert.equal(frontMatterEnd(larawan.map((s) => ({ base: s.kind, text: s.text })), "Larawan: Mga Sugilanon ug Dinalídalí"), 8);
  const L = layoutBlocks(larawan, { book: true, title: "Larawan: Mga Sugilanon ug Dinalídalí" });
  assert.deepEqual(L.slice(0, 8).map((b) => b.role), ["front", "front-title", "front-sub", "front", "front", "front", "front", "front"]);
  assert.equal(blockTag(L[1]).tag, "h2");
  assert.equal(blockTag(L[0]).cls, "front");
  assert.ok(L[0].breakBefore && L[8].breakBefore); // the title page is a page of its own
  assert.deepEqual([L[8].level, L[11].level, L[12].level], [2, 2, 3]); // h2, a line in capitals, a bare number
  assert.equal(L[11].role, "h");
  assert.ok(!L[12].breakBefore); // "I." doesn't start a page
});

test("a story opening with short lines of talk is not a title page", () => {
  const segs = [["p", "—Hola."], ["p", "—¿Qué tal?"], ["p", "Bien, gracias, dijo ella mientras miraba por la ventana el largo camino hacia el pueblo."]]
    .map(([kind, text], idx) => ({ idx, kind, text }));
  assert.equal(layoutBlocks(segs, { book: true, title: "Una novela" }).filter((b) => b.role.startsWith("front")).length, 0);
});

test("a play's speakers in capitals are not all taken for headings", () => {
  const segs = [];
  for (let k = 0; k < 60; k++) { segs.push({ idx: segs.length, kind: "p", text: k % 2 ? "XEIXA" : "PEPA" }); segs.push({ idx: segs.length, kind: "p", text: "Una frase que dice el personaje en la obra de teatro." }); }
  assert.equal(layoutBlocks(segs, { book: true }).filter((b) => b.level).length, 0);
});

test("web pages: h1/h2 under the page title, h3 smaller, a short all-bold line is a heading, marks come along", () => {
  const segs = [{ idx: 0, kind: "h2", text: "Un viaje" }, { idx: 1, kind: "h3", text: "Precio" }, { idx: 2, kind: "p|b0-1", text: "Las críticas" },
    { idx: 3, kind: "p|b0-1,i4", text: "Muy pronto el tren llega.", start: 10, end: 15 }, { idx: 4, kind: "li", text: "Uno" }, { idx: 5, kind: "q", text: "Dijo." }];
  const L = layoutBlocks(segs, { book: false });
  assert.deepEqual(L.map((b) => [b.role, b.level]), [["h", 2], ["h", 3], ["h", 3], ["p", 0], ["li", 0], ["q", 0]]);
  assert.deepEqual(L.map((b) => blockTag(b).tag), ["h3", "h4", "h4", "p", "li", "blockquote"]);
  const flagsOf = marksLookup(segs, L);
  assert.deepEqual([10, 11, 12, 14].map((pos) => wordStyle(flagsOf(3, pos))), [" wb", " wb", "", " wi"]);
  assert.equal(flagsOf(4, 0), 0); // a block without marks
});

// ---------- filled pages ----------
const words = (blocks) => {
  const texts = [], segOf = [];
  blocks.forEach((text, s) => { for (const w of text.split(" ")) { texts.push(w); segOf.push(s); } });
  return { texts, segOf };
};

test("pages are filled with several paragraphs, cover every word once, and keep within the page", () => {
  const paras = Array.from({ length: 40 }, (_, k) => `Paragraph ${k} ` + "word ".repeat(30).trim());
  const { texts, segOf } = words(paras);
  const m = { lineH: 30, cpl: 40, extra: 15 };
  const pages = paginateBlocks(texts, segOf, () => m, 600);
  assert.equal(pages[0][0], 0);
  assert.equal(pages.at(-1)[1], texts.length);
  for (let k = 1; k < pages.length; k++) assert.equal(pages[k][0], pages[k - 1][1]);
  // ~170 characters a paragraph is 5 lines (150 px + 15): 3 or more paragraphs a page, never 1.
  const perPage = pages.map(([a, b]) => new Set(segOf.slice(a, b)).size);
  assert.ok(perPage.slice(0, -1).every((c) => c >= 3), perPage.join(","));
  assert.ok(pages.length <= 15 && pages.length >= 10, String(pages.length));
});

test("short lines count as whole lines; a title page and chapter headings start pages", () => {
  const { texts, segOf } = words(["Bili: P 1.00", "LARAWAN", "1921.", "UPAT KA PULONG", "word ".repeat(50).trim(), "II", "word ".repeat(20).trim()]);
  const info = [{ front: true, breakBefore: true }, { front: true }, { front: true }, { breakBefore: true, keep: true }, {}, { keep: true }, {}];
  const pages = paginateBlocks(texts, segOf, (s) => ({ lineH: 30, cpl: 40, extra: 10, ...info[s] }), 1000);
  assert.deepEqual(pages[0], [0, 5]); // the three title-page lines alone
  assert.equal(segOf[pages[1][0]], 3); // then the chapter heading
  assert.equal(pageOf(pages, 6), 1);
});

test("a heading is never left alone at the foot of a page", () => {
  const { texts, segOf } = words(["word ".repeat(70).trim(), "Heading", "word ".repeat(30).trim()]);
  const pages = paginateBlocks(texts, segOf, (s) => ({ lineH: 30, cpl: 40, extra: 0, keep: s === 1 }), 300);
  const headingPage = pageOf(pages, 70);
  assert.equal(pages[headingPage][0], 70); // the heading opens its page
});

test("an unspaced language (Chinese, Japanese, Thai) is laid out without spaces", () => {
  const texts = Array.from({ length: 400 }, () => "字");
  const segOf = texts.map(() => 0);
  const pages = paginateBlocks(texts, segOf, () => ({ lineH: 30, cpl: 20, extra: 0 }), 300, 0);
  assert.equal(pages[0][1], 200); // 10 lines of 20
});

// ---------- the text size ----------
test("text size: a scale on the standard sizes, sensible limits, an absurd old size goes back to the standard", () => {
  assert.equal(pageScale(PAGE_SIZE_DEFAULT), 1);
  assert.equal(pageSize(undefined), PAGE_SIZE_DEFAULT);
  assert.equal(pageSize(40), PAGE_SIZE_DEFAULT); // the owner's 40 px from the old slider
  assert.ok(isAbsurdPageSize(40) && !isAbsurdPageSize(24) && !isAbsurdPageSize(17) && !isAbsurdPageSize(undefined));
  assert.equal(pageSize(99 / 4), PAGE_SIZE_MAX);
  assert.equal(pageSize(5), 13);
});
