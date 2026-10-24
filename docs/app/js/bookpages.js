// Splitting a book into pages for the book reader (pages/book.js). No screen or network code.

/**
 * Pages of a book: [[first word, end word), ...] covering every word, each page filled like a
 * printed one. `texts` are the words, `segOf` each word's block. `blockOf(seg)` says how a block is
 * set, as the reader measured it on screen:
 *   {lineH: px per line, cpl: characters per line, extra: px of space around it (top: of which above it),
 *    breakBefore: starts a new page (a chapter heading, the end of the title page),
 *    keep: a heading (never left alone at the foot of a page)}
 * `pageH` is the page's height in px; `space` is 1 where words are written with spaces between them,
 * 0 in Chinese, Japanese and Thai; `from` is the word to start at (the pages before it are already
 * settled). Lines are laid out a word at a time, the way the screen wraps
 * them, so short lines (a title page, verse, dialogue) count as the whole lines they take.
 */
export function paginateBlocks(texts, segOf, blockOf, pageH, space = 1, from = 0) {
  const pages = [];
  const n = texts.length;
  let start = from;
  let used = 0;
  const newPage = (at) => {
    if (at > start) pages.push([start, at]);
    start = at;
    used = 0;
  };
  let a = from;
  while (a < n) {
    const seg = segOf[a];
    let b = a;
    while (b < n && segOf[b] === seg) b++;
    const m = blockOf(seg) || {};
    const lineH = Math.max(1, m.lineH || 24);
    const cpl = Math.max(4, m.cpl || 40);
    if (m.breakBefore && used > 0) newPage(a);
    // A heading needs room for itself and two lines of what follows.
    if (m.keep && used > 0) {
      const need = (m.extra || 0) + lineH * Math.ceil(chars(texts, a, b, space) / cpl) + 2 * lineH;
      if (used + need > pageH) newPage(a);
    }
    // (The space above a block is left out at the top of a page, as the screen does.)
    const extra = Math.max(0, (m.extra || 0) - (used === 0 ? m.top || 0 : 0));
    let w = a;
    let first = true;
    while (w < b) {
      const room = pageH - used - (first ? extra : 0);
      const lines = Math.floor(room / lineH);
      if (lines < 1 && used > 0) { newPage(w); continue; }
      // Wrap words into at most `lines` lines (at least one line, so a page always moves on).
      let line = 0;
      let count = 1;
      let k = w;
      while (k < b) {
        const len = String(texts[k]).length;
        const add = line ? len + space : len;
        if (line && line + add > cpl) {
          if (count + 1 > Math.max(1, lines)) break;
          count++;
          line = len;
        } else {
          line += add;
        }
        k++;
      }
      if (k === w) k = w + 1; // a single word longer than a page's lines: give it the page
      used += (first ? extra : 0) + count * lineH;
      first = false;
      w = k;
      if (w < b) newPage(w); // the block goes on over the page
    }
    a = b;
  }
  if (n > start) pages.push([start, n]);
  return pages;
}

function chars(texts, a, b, space) {
  let total = 0;
  for (let k = a; k < b; k++) total += String(texts[k]).length + (k > a ? space : 0);
  return total;
}

/**
 * The older, simpler split (kept for anything still calling it): a page holds about `budget`
 * characters; a chapter heading ("h2") always starts a new page, and a paragraph too long for what
 * is left of a page carries on onto the next one.
 */
export function paginate(texts, segOf, kinds, budget) {
  const pages = [];
  let start = 0;
  let used = 0;
  let seg = -1;
  for (let i = 0; i < texts.length; i++) {
    const s = segOf[i];
    const newSeg = s !== seg;
    const heading = newSeg && kinds[s] === "h2";
    // A new paragraph costs a little extra (its line break); a heading takes a line of its own.
    const cost = String(texts[i]).length + 1 + (newSeg ? (heading ? 60 : 30) : 0);
    if (i > start && (used + cost > budget || (heading && used > 0))) {
      pages.push([start, i]);
      start = i;
      used = 0;
    }
    used += cost;
    seg = s;
  }
  if (texts.length) pages.push([start, texts.length]);
  return pages;
}

/** The page holding word `w`. */
export function pageOf(pages, w) {
  let lo = 0, hi = pages.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (pages[mid][0] <= w) lo = mid; else hi = mid - 1;
  }
  return Math.max(0, lo);
}
