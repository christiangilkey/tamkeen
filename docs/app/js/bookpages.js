// Splitting a book into pages for the book reader (pages/book.js). No screen or network code.

/**
 * Pages of a book: [[first word, end word), ...] covering every word. A page holds about
 * `budget` characters (what fits on the screen at the chosen text size); a chapter heading
 * always starts a new page, and a paragraph too long for what is left of a page carries on
 * onto the next one. `texts` are the words, `segOf` each word's segment, `kinds` each segment's kind.
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
