// The controller's highlight inside text: a ring round one word of a transcript, the captions, a
// reel's words or a book's page, moved word by word (left / right, the way the text runs on screen,
// so right-to-left Arabic works as it looks) and line by line (up / down: the nearest word on the
// line above or below). Holding the look-up button while moving takes in more words, like holding a
// word and sliding a finger on (components/phrasepick.js); letting go looks them all up.
// The pages (player.js, reels.js, book.js, reader.js) say where their words are; gamepad.js says
// when to move. Words are counted by their index in the text (`data-i`), as everywhere else.

import { PHRASE_MAX, phraseRange } from "./phrase.js";

/** How far either side of the highlighted word a line above / below is looked for. */
const LOOK = 120;

/**
 * The word on the very next line drawn up or down from `from` (a rectangle) that is nearest across:
 * among `list` ([{ i, rect }]), the line is the nearest row of words that way (a word much lower down
 * straight below doesn't jump the line between). -1 when there is none.
 */
export function nextLine(from, list, dir) {
  const mid = (r) => r.top + r.height / 2;
  const half = from.height / 2;
  const away = (r) => (dir === "up" ? mid(from) - mid(r) : mid(r) - mid(from));
  const that = list.filter((w) => away(w.rect) > half);
  if (!that.length) return -1;
  const gap = Math.min(...that.map((w) => away(w.rect)));
  const line = that.filter((w) => away(w.rect) <= gap + half);
  const x = from.left + from.width / 2;
  let best = -1;
  let far = Infinity;
  for (const w of line) {
    const d = Math.abs(w.rect.left + w.rect.width / 2 - x);
    if (d < far) { far = d; best = w.i; }
  }
  return best;
}

/**
 * @param {{
 *   count: () => number,                    // how many words there are
 *   elsOf: (i: number) => (Element|null|undefined)[],  // word i's elements on screen now (the first is the one to move by)
 *   startAt: () => number,                  // where the highlight first appears (the word being said, the page's first word)
 *   blockOf?: (i: number) => any,           // which line or paragraph word i is in (up / down without a picture of it)
 *   onPick: (i: number, j: number) => void, // look words i..j up
 *   onMove?: (i: number) => void,           // the highlight moved to word i (the page may scroll, stop following, turn a page)
 *   onHide?: () => void,                    // the highlight was put away
 *   reveal?: (el: Element) => void,         // bring a word into view (default: scrollIntoView)
 *   edge?: (dir: string, i: number) => number,  // past the first / last word on screen (a book: the next page); the word to go to, or -1
 *   max?: number,
 * }} opts
 */
export function wordCursor(opts) {
  const max = opts.max || PHRASE_MAX;
  let at = -1;
  let anchor = null;  // where taking in more words began, or null
  let painted = [];

  const n = () => Math.max(0, Number(opts.count()) || 0);
  const clamp = (i) => Math.max(0, Math.min(n() - 1, i));
  const els = (i) => (i >= 0 ? (opts.elsOf(i) || []).filter((e) => e && e.isConnected) : []);
  const first = (i) => els(i)[0] || null;
  const rtl = (el) => {
    try { return getComputedStyle(el).direction === "rtl"; } catch { return false; }
  };

  function paint() {
    for (const el of painted) el.classList.remove("pad-word", "phr", "phr-a", "phr-z");
    painted = [];
    if (at < 0) return;
    const [a, b] = range();
    if (b > a) {
      for (let k = a; k <= b; k++) {
        for (const el of els(k)) {
          el.classList.add("phr");
          if (k === a) el.classList.add("phr-a");
          if (k === b) el.classList.add("phr-z");
          painted.push(el);
        }
      }
    }
    for (const el of els(at)) { el.classList.add("pad-word"); painted.push(el); }
  }

  function reveal() {
    const el = first(at);
    if (!el) return;
    if (opts.reveal) opts.reveal(el);
    else el.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  function place(i) {
    if (!n()) return false;
    at = clamp(i);
    paint();
    if (opts.onMove) opts.onMove(at);
    paint();  // (onMove may have drawn the words again: the captions, a book's page)
    reveal();
    return true;
  }

  /** The word up or down from word i: the nearest one on the next line drawn that way, else the next line's (block's) first word. */
  function vertical(i, dir) {
    const from = first(i);
    if (from) {
      const box = from.getBoundingClientRect();
      const list = [];
      const lo = dir === "up" ? Math.max(0, i - LOOK) : i + 1;
      const hi = dir === "up" ? i - 1 : Math.min(n() - 1, i + LOOK);
      for (let k = lo; k <= hi; k++) {
        const el = first(k);
        if (!el || el.parentElement === null) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width || rect.height) list.push({ i: k, rect });
      }
      const got = nextLine(box, list, dir);
      if (got >= 0) return got;
    }
    if (!opts.blockOf) return dir === "up" ? i - 1 : i + 1;
    const here = opts.blockOf(i);
    if (dir === "down") {
      for (let k = i + 1; k < n(); k++) if (opts.blockOf(k) !== here) return k;
      return -1;
    }
    let k = i - 1;
    while (k >= 0 && opts.blockOf(k) === here) k--;
    if (k < 0) return -1;
    const prev = opts.blockOf(k);
    while (k > 0 && opts.blockOf(k - 1) === prev) k--;
    return k;
  }

  function range() {
    if (at < 0) return [-1, -1];
    if (anchor === null) return [at, at];
    return phraseRange(anchor, at, { max });
  }

  return {
    get on() { return at >= 0; },
    get at() { return at; },
    get taking() { return anchor !== null; },
    range,
    /** Show the highlight (where it starts, or on word `i`) without moving it. */
    show(i = null) {
      if (!n()) return false;
      return place(i === null ? Math.max(0, Number(opts.startAt()) || 0) : i);
    },
    /**
     * Move one word (left / right) or one line (up / down). The first press only shows the highlight.
     * `taking`: the look-up button is held, so the words passed over are taken in as well.
     */
    move(dir, taking = false) {
      if (!n()) return false;
      if (at < 0) {
        this.show();
        if (!taking) return true;
      }
      if (taking && anchor === null) anchor = at;
      if (!taking && anchor !== null) anchor = null;
      let next;
      if (dir === "left" || dir === "right") {
        const el = first(at);
        const forward = (dir === "right") !== (el ? rtl(el) : false);
        next = at + (forward ? 1 : -1);
      } else next = vertical(at, dir);
      if (next < 0 || next >= n()) {
        // past the first or last word of the text: nowhere to go (a book may say otherwise)
        next = opts.edge ? opts.edge(dir, at) : -1;
        if (next < 0) return false;
      } else if (!first(next) && opts.edge) {
        // a word that isn't on screen (a book's next page): the page may turn to it
        const turned = opts.edge(dir, next);
        if (turned >= 0) next = turned;
      }
      return place(next);
    },
    /**
     * From words i..j (the popup's word, or words looked up together), one word on the way `dir` goes,
     * past the end of them. The word popup's ← / →. False when there is nothing more that way.
     */
    stepOut(i, j, dir) {
      if (!n() || !this.show(i)) return false;
      anchor = null;
      if (!this.move(dir)) return false;
      while (at > i && at <= j) if (!this.move(dir)) return false;
      return true;
    },
    /** Look the highlighted word (or the words taken in) up. Without a highlight: the word it would start on. */
    pick() {
      if (at < 0 && !this.show()) return false;
      const [a, b] = range();
      anchor = null;
      paint();
      opts.onPick(a, b);
      return true;
    },
    /** Put the highlight away. */
    hide() {
      if (at < 0) return false;
      at = -1;
      anchor = null;
      paint();
      if (opts.onHide) opts.onHide();
      return true;
    },
    /** Draw the ring again (the page drew its words again). */
    repaint: paint,
  };
}
