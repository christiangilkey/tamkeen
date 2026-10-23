// How each block of an imported page or book is shown: one standard look for everything read in
// the reader (pages/reader.js) and the book reader (pages/book.js), whatever site, file or language
// it came from. Worked out when the text is shown, so pages and books imported before this look the
// same as new ones, with nothing to import again.
//
//   - Headings at three levels at most (1 = largest). A web page's own title is level 1 (reader.js),
//     so its h1/h2 blocks are level 2 and h3 level 3. A book's h1/h2/h3 are levels 1/2/3, with a bare
//     section number ("I.", "IV", "3") as level 3.
//   - Plain text and PDF books often keep their headings as ordinary paragraphs: a short line in
//     capitals ("SI AMBOY, ANG PALAHUBOG") or a chapter line ("Chapter 3", "第三章", "บทที่ 2")
//     is taken for a level-2 heading.
//   - A book's title page (the short lines at its very start: title, author, "Bili: P 1.00", the
//     printer, the year) becomes one small centred title block: the title large, the rest as
//     small grey lines, instead of a screenful of separate paragraphs.
//   - A short paragraph that is all bold on a web page ("<p><strong>Las críticas</strong></p>") is
//     a small heading.
//   - Bold and italic words (blockmarks.js) come along with each block.
// No screen code here: tested on its own (tests/js/readerlayout.test.mjs).

import { decodeKind, wordFlags, BOLD, ITALIC } from "./blockmarks.js";

const FRONT_MAX_WORDS = 12;
const FRONT_MAX_CHARS = 90;
const FRONT_MAX_BLOCKS = 24;

// A chapter line in the languages Tamkeen teaches. (Not \b after the word: in JavaScript that only knows Latin letters.)
const CHAPTER = new RegExp([
  "^(chapter|capítulo|capitulo|chapitre|capitolo|kapitel|kabanata|kapitulo|libro|livre|book|part|parte|partie|teil|глава|часть|книга",
  "|باب|الفصل|الجزء|فصل|بخش|अध्याय|भाग|prologue|prólogo|prologo|epilogue|épilogue|epílogo|epilogo)(?=[\\s.:,\\d]|$)",
  "|^บทที่|^ตอนที่|^제\\s*[\\d一二三四五六七八九十百]+\\s*[장부편]|^第[一二三四五六七八九十百千零〇\\d]+[回章話节節篇卷部]",
].join(""), "i");
const NUMBER_ONLY = /^[(\[]?([IVXLCDM]+|\d{1,3})[.)\]]?$/i;

const words = (text) => String(text || "").split(/\s+/).filter(Boolean);

/** A section number on its own ("I.", "XII", "3."): the smallest heading. */
export const isNumberHeading = (text) => NUMBER_ONLY.test(String(text || "").trim());

/** A short line in capitals: "SI AMBOY, ANG PALAHUBOG", "THE END". Only for scripts with capitals. */
export function isCapsHeading(text) {
  const t = String(text || "").trim();
  if (!t || t.length > 70 || words(t).length > 10) return false;
  const letters = t.match(/\p{L}/gu) || [];
  if (letters.length < 4) return false;
  const cased = letters.filter((c) => c.toLowerCase() !== c.toUpperCase());
  if (cased.length < letters.length * 0.8) return false; // Arabic, Thai, Chinese... have no capitals
  if (t !== t.toUpperCase()) return false;
  // A shout in the story ("¡NO!", «JEANNE.»), or a signature ("CURRER BELL."), not a heading.
  if (/[!?….,;]$/.test(t) || /^\s*(["'«»“”„‘’‹›「『—–-]|--)/.test(t)) return false;
  return true;
}

/** A chapter line: "Chapter 3", "CAPÍTULO II. El viaje", "第三章", "บทที่ ๒", "Глава 1". */
export const isChapterLine = (text) => {
  const t = String(text || "").trim();
  return t.length <= 70 && words(t).length <= 10 && (CHAPTER.test(t) || isNumberHeading(t));
};

/** A heading guessed from a plain paragraph's text (plain-text and PDF books): its level, or 0. */
export function guessHeading(text) {
  if (isNumberHeading(text)) return 3;
  if (isChapterLine(text) || isCapsHeading(text)) return 2;
  return 0;
}

// A line that opens with a quotation mark or a dash is someone speaking, not a title page or a heading.
const SPEECH = /^\s*(["'«»“”„‘’‹›「『—–-]|--)/;

/** Short enough for a title-page line: a dozen words (or, in text written without spaces, 30 characters). */
function isShortLine(text) {
  const t = String(text || "").trim();
  const w = words(t);
  const unspaced = w.some((x) => x.length > 20);
  return w.length <= FRONT_MAX_WORDS && t.length <= (unspaced ? 30 : FRONT_MAX_CHARS);
}

const fold = (s) => String(s || "").normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** Where a book's title page ends (the number of blocks in it), or 0 when it has none. `blocks`
 * are [{base, text}] from the start of the book; `title` is the book's title. */
export function frontMatterEnd(blocks, title = "") {
  let k = 0;
  while (k < blocks.length && k < FRONT_MAX_BLOCKS) {
    const b = blocks[k];
    if (b.base !== "p" || !isShortLine(b.text) || isChapterLine(b.text) || SPEECH.test(b.text)) break;
    k++;
  }
  // Two or more lines like these at the start, then the book itself. So that a story opening with
  // a few short lines of talk isn't taken for a title page: a heading must follow, or one of the
  // lines must be the book's title.
  if (k < 2 || k >= blocks.length) return 0;
  const next = blocks[k];
  const t = fold(title);
  const named = t && blocks.slice(0, k).some((b) => { const f = fold(b.text); return f.length >= 3 && (t.startsWith(f) || f.startsWith(t)); });
  if (!named && next.base === "p" && !guessHeading(next.text)) return 0;
  return k;
}

/** Which of the title page's lines is the title: the one the book's own title starts with or holds,
 * else the first line in capitals, else the first line. */
function titleLine(lines, title) {
  const t = fold(title);
  if (t) {
    const exact = lines.findIndex((line) => fold(line) === t);
    if (exact >= 0) return exact;
    let best = -1, bestLen = 0;
    lines.forEach((line, k) => {
      const f = fold(line);
      if (f.length >= 3 && (t === f || t.startsWith(f + " ") || t.startsWith(f) || f.startsWith(t)) && f.length > bestLen) { best = k; bestLen = f.length; }
    });
    if (best >= 0) return best;
  }
  const caps = lines.findIndex((l) => isCapsHeading(l));
  return caps >= 0 ? caps : 0;
}

/** The element a laid-out block is shown as: {tag, cls}. Level-1 headings are <h2> because a web
 * page's own title above them is the page's <h1>. */
export function blockTag(b) {
  if (b.role === "front-title") return { tag: "h2", cls: "rh rh1 front-title" };
  if (b.role === "front-sub") return { tag: "p", cls: "front-sub" };
  if (b.role === "front") return { tag: "p", cls: "front" };
  if (b.role === "h") return { tag: `h${b.level + 1}`, cls: `rh rh${b.level}` };
  if (b.role === "li") return { tag: "li", cls: "" };
  if (b.role === "q") return { tag: "blockquote", cls: "" };
  return { tag: "p", cls: "" };
}

/** The extra classes of a word with these flags (blockmarks.js): "wb" bold, "wi" italic. */
export const wordStyle = (flags) => (flags & BOLD ? " wb" : "") + (flags & ITALIC ? " wi" : "");

/** (seg, word's stored position) -> its flags, for the blocks of `segments` ({idx, start, end}, as
 * stored: a word's "time" is its position) laid out as `layout`. */
export function marksLookup(segments, layout) {
  const bySeg = new Map();
  (segments || []).forEach((s, k) => {
    const L = layout[k];
    if (!L || !L.marks || !L.marks.length) return;
    const first = Math.round(Number(s.start) || 0);
    const count = Math.max(0, Math.round(Number(s.end) || 0) - first);
    bySeg.set(s.idx, { first, flags: wordFlags(L.marks, count) });
  });
  return (seg, start) => {
    const e = bySeg.get(seg);
    return e ? e.flags[Math.floor(Number(start) + 1e-6) - e.first] || 0 : 0;
  };
}

/**
 * How to show each block. `segments` are the stored blocks ({idx, kind, text}) in order.
 * Returns an array parallel to `segments`: {idx, base, level (0 = not a heading, 1-3),
 * role ("p" | "li" | "q" | "h" | "front" | "front-title" | "front-sub"), marks, breakBefore}.
 * `book`: a book (title page, guessed headings, pages); otherwise a web page.
 */
export function layoutBlocks(segments, { book = false, title = "" } = {}) {
  const segs = (segments || []).map((s) => {
    const { base, marks } = decodeKind(s.kind);
    return { idx: s.idx, base, marks, text: String(s.text || "") };
  });
  const out = segs.map((s) => ({ idx: s.idx, base: s.base, level: 0, role: s.base === "li" || s.base === "q" ? s.base : "p", marks: s.marks, breakBefore: false }));
  if (book) {
    const front = frontMatterEnd(segs, title);
    if (front) {
      const t = titleLine(segs.slice(0, front).map((s) => s.text), title);
      for (let k = 0; k < front; k++) out[k].role = k === t ? "front-title" : "front";
      // The line straight after the title, when the book's title goes on with it, is its subtitle.
      if (t + 1 < front && fold(title).includes(fold(segs[t + 1].text)) && fold(segs[t + 1].text).length >= 3) out[t + 1].role = "front-sub";
      out[0].breakBefore = true;
      if (front < out.length) out[front].breakBefore = true;
    } else if (segs.length && /^(h[123]|p)$/.test(segs[0].base) && title && fold(segs[0].text) === fold(title)) {
      out[0].role = "front-title"; // a book that opens with its own title, on a line of its own
    }
    // Headings guessed from plain paragraphs. In a play, every speaker's name is a line in capitals:
    // when guesses come that thick, they are not headings at all.
    const guessed = segs.map((s, k) => (s.base === "p" && !(front && k < front) ? guessHeading(s.text) : 0));
    const many = guessed.filter(Boolean).length > Math.max(30, segs.length / 12);
    segs.forEach((s, k) => {
      if (out[k].role !== "p" || front && k < front) return;
      let level = 0;
      if (s.base === "h1") level = 1;
      else if (s.base === "h2") level = isNumberHeading(s.text) ? 3 : 2;
      else if (s.base === "h3") level = 3;
      else if (s.base === "p" && !many) level = guessed[k];
      if (level) { out[k].level = level; out[k].role = "h"; out[k].marks = []; if (level <= 2) out[k].breakBefore = true; }
    });
  } else {
    segs.forEach((s, k) => {
      let level = s.base === "h1" || s.base === "h2" ? 2 : s.base === "h3" ? 3 : 0;
      if (!level && s.base === "p") {
        // A short paragraph that is all bold, not a sentence: a heading set as bold text.
        const n = words(s.text).length;
        const flags = wordFlags(s.marks, n);
        if (n && n <= 12 && flags.every((f) => f & BOLD) && !/[.:;,!?…]$/.test(s.text.trim())) level = 3;
      }
      if (level) { out[k].level = level; out[k].role = "h"; out[k].marks = []; }
    });
  }
  return out;
}
