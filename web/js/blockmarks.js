// Bold and italic words in imported text (web pages and books), kept with each block.
//
// A page or book is stored as blocks: one segment each, with a `kind` ("h1", "h2", "h3", "p", "li"
// or "q"). Which of a block's words were bold or italic in the source travels in that same kind,
// after a "|":
//     "p"                 a plain paragraph (everything imported before this existed)
//     "p|b0-2,i5,bi9-10"  words 0 to 2 bold, word 5 italic, words 9 and 10 both
// Word numbers count the block's own words (its text split at spaces), from 0. Nothing else had to
// change to store or sync it (the computer's segments.kind column, the phone's `kinds` list, Drive's
// transcript files all carry the string as it is), and an older app reading "p|b0-2" simply shows
// a plain paragraph. app/blockmarks.py is the computer's copy of `cleanKind`; keep the two alike.
// No screen code here: tested on its own (tests/js/readerlayout.test.mjs).

export const BLOCK_KINDS = ["h1", "h2", "h3", "p", "li", "q"];
const MAX_MARKS = 400;
const ITEM = /^(b|i|bi|ib)(\d{1,6})(?:-(\d{1,6}))?$/;
const ZERO_WIDTH = /[​‎‏﻿]/g;

export const BOLD = 1;
export const ITALIC = 2;

/** {base, marks: [[first, last, flags]]} from a stored kind (unknown kinds read as "p"). */
export function decodeKind(kind) {
  const s = String(kind || "");
  const bar = s.indexOf("|");
  const head = bar < 0 ? s : s.slice(0, bar);
  const base = BLOCK_KINDS.includes(head) ? head : "p";
  const marks = [];
  if (bar >= 0) {
    for (const item of s.slice(bar + 1).split(",")) {
      const m = ITEM.exec(item.trim());
      if (!m) continue;
      const a = Number(m[2]);
      const b = m[3] === undefined ? a : Number(m[3]);
      if (b < a) continue;
      marks.push([a, b, (m[1].includes("b") ? BOLD : 0) | (m[1].includes("i") ? ITALIC : 0)]);
      if (marks.length >= MAX_MARKS) break;
    }
  }
  return { base, marks };
}

/** The kind to store: `base` plus the marks that fall inside the block's `count` words. Headings
 * keep no marks (they are bold already). */
export function encodeKind(base, marks, count = Infinity) {
  const kind = BLOCK_KINDS.includes(base) ? base : "p";
  if (!Array.isArray(marks) || !marks.length || /^h/.test(kind)) return kind;
  const flags = new Uint8Array(Math.min(count, 1 + Math.max(0, ...marks.map((m) => Number(m && m[1]) || 0))));
  for (const m of marks) {
    if (!Array.isArray(m) || m.length < 2) continue;
    const a = Math.max(0, Math.floor(Number(m[0])));
    const b = Math.min(flags.length - 1, Math.floor(Number(m[1])));
    const f = m.length > 2 ? Number(m[2]) & 3 : BOLD;
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    for (let k = a; k <= b; k++) flags[k] |= f;
  }
  const items = [];
  for (let k = 0; k < flags.length && items.length < MAX_MARKS;) {
    const f = flags[k];
    let e = k;
    while (e + 1 < flags.length && flags[e + 1] === f) e++;
    if (f) items.push(`${f === BOLD ? "b" : f === ITALIC ? "i" : "bi"}${k}${e > k ? `-${e}` : ""}`);
    k = e + 1;
  }
  return items.length ? `${kind}|${items.join(",")}` : kind;
}

/** A stored or received kind, checked and tidied (marks beyond the block's `count` words dropped). */
export function cleanKind(kind, count = Infinity) {
  const { base, marks } = decodeKind(kind);
  return encodeKind(base, marks, count);
}

/** The kind to store for a block as importers make it: {kind, text, marks?}, or a kind that
 * already carries marks. `count` is how many words the block keeps. */
export function blockKind(block, count = Infinity) {
  const { base, marks } = decodeKind(block && block.kind);
  const extra = Array.isArray(block && block.marks) ? block.marks : [];
  return encodeKind(base, marks.concat(extra), count);
}

/** Each of `count` words' flags (BOLD | ITALIC) from a block's marks. */
export function wordFlags(marks, count) {
  const out = new Uint8Array(Math.max(0, count));
  for (const [a, b, f] of marks || []) for (let k = Math.max(0, a); k <= b && k < count; k++) out[k] |= f;
  return out;
}

/** Runs of text with their style, [{text, b, i}], as one block: {text, marks}. The text is tidied
 * (spaces collapsed, invisible marks dropped) and split into words exactly as storing it splits
 * them; a word counts as bold (or italic) when most of its letters are. */
export function marksFromRuns(runs) {
  const chars = [];
  for (const r of runs || []) {
    const t = String((r && r.text) || "").replace(ZERO_WIDTH, "");
    const f = (r && r.b ? BOLD : 0) | (r && r.i ? ITALIC : 0);
    for (const ch of t) chars.push([ch, f]);
  }
  const words = [];
  let cur = null;
  for (const [ch, f] of chars) {
    if (/\s/.test(ch)) { cur = null; continue; }
    if (!cur) { cur = { text: "", letters: 0, b: 0, i: 0, all: 0, ab: 0, ai: 0 }; words.push(cur); }
    cur.text += ch;
    cur.all++;
    if (f & BOLD) cur.ab++;
    if (f & ITALIC) cur.ai++;
    if (/[\p{L}\p{N}]/u.test(ch)) { cur.letters++; if (f & BOLD) cur.b++; if (f & ITALIC) cur.i++; }
  }
  const marks = [];
  words.forEach((w, k) => {
    const n = w.letters || w.all;
    const b = w.letters ? w.b : w.ab;
    const i = w.letters ? w.i : w.ai;
    const f = (b * 2 > n ? BOLD : 0) | (i * 2 > n ? ITALIC : 0);
    if (f) marks.push([k, k, f]);
  });
  return { text: words.map((w) => w.text).join(" "), marks };
}

const BOLD_TAGS = /^(B|STRONG)$/;
const ITALIC_TAGS = /^(I|EM|CITE|DFN)$/;

/** The styled runs of an element's text (bold from <b>/<strong> or an inline font-weight, italic from
 * <i>/<em> or an inline font-style), leaving out descendants matching `skip`. Works on any DOM,
 * including a DOMParser document. */
export function runsOf(el, skip = "") {
  const runs = [];
  const walk = (node, b, i) => {
    for (const child of node.childNodes) {
      if (child.nodeType === 3) { runs.push({ text: child.nodeValue, b, i }); continue; }
      if (child.nodeType !== 1) continue;
      if (skip && child.matches && child.matches(skip)) continue;
      const tag = String(child.tagName || "").toUpperCase();
      if (tag === "BR") { runs.push({ text: " ", b, i }); continue; }
      const style = String((child.getAttribute && child.getAttribute("style")) || "");
      const weight = /font-weight\s*:\s*(bold|bolder|[6-9]00)/i.test(style);
      const unweight = /font-weight\s*:\s*(normal|lighter|[1-4]00)/i.test(style);
      const italic = /font-style\s*:\s*(italic|oblique)/i.test(style);
      const upright = /font-style\s*:\s*normal/i.test(style);
      walk(child, (b || BOLD_TAGS.test(tag) || weight) && !unweight, (i || ITALIC_TAGS.test(tag) || italic) && !upright);
    }
  };
  walk(el, false, false);
  return runs;
}
