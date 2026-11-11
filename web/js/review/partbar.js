// The Mnemonic maker's part picker: the word in its own script with a highlight in the brand's teal whose two
// ends sit between letters. The owner: "it would be our brand's blue color, but it's selectable and draggable
// across the word and in between letters." (What the choice means in sound is review/wordpart.js.)
//
//   - drag an end to grow or shrink the highlight; drag across the word to highlight from here to there;
//   - keys, with the bar focused: left / right move the end in use, Enter or Space switches ends;
//   - a game controller: the same (gamepad.js sends left / right to an element marked data-pad-step, and its
//     press is a click, which switches ends).
//
// The word stays one piece of text, so Arabic letters keep their joined shapes; the highlight and its ends are
// drawn over it from where the browser says each letter is. Shared by the review card and the Vocab list.

import { buzz, h } from "../app.js";
import { setLang } from "../languages.js";
import { cleanSel, graphemes, moveEdge } from "./wordpart.js";

/**
 * Put the bar in `host` for `text` (in language `lang`), with letters `sel` ({from, to}) highlighted.
 * `onChange(sel)` is told each time the highlight has moved (once a drag ends; at each key). `label` names the
 * bar for a screen reader. Returns {sel(), set(sel), close()}.
 */
export function partBar(host, { text, lang, sel, label = "", onChange = () => {} }) {
  const letters = graphemes(text);
  const n = letters.length;
  const offs = [0];
  for (const g of letters) offs.push(offs[offs.length - 1] + g.length);
  let cur = cleanSel(sel, n);
  let edge = "end";   // the end the keys move
  host.textContent = "";
  const bar = h(`<div class="rv-part-bar" tabindex="0" role="group" data-pad-step>
    <div class="rv-part-fill" aria-hidden="true"></div>
    <span class="rv-part-word" translate="no"></span>
    <i class="rv-part-handle start" aria-hidden="true"></i><i class="rv-part-handle end" aria-hidden="true"></i>
  </div>`);
  const word = bar.querySelector(".rv-part-word"), fill = bar.querySelector(".rv-part-fill");
  const hStart = bar.querySelector(".rv-part-handle.start"), hEnd = bar.querySelector(".rv-part-handle.end");
  word.textContent = text;
  setLang(word, lang);
  if (label) bar.setAttribute("aria-label", label);
  host.append(bar);
  const node = word.firstChild;
  const rtl = () => getComputedStyle(word).direction === "rtl";

  // ----- where the letters are -----
  const rectOf = (a, b) => {
    const r = document.createRange();
    r.setStart(node, offs[a]);
    r.setEnd(node, offs[b]);
    return r;
  };
  let boxes = [];  // each letter's box on screen (null for one with no size, a space at a line's end)
  function measure() {
    boxes = letters.map((_, i) => {
      const r = rectOf(i, i + 1).getBoundingClientRect();
      return r.width > 0.3 && r.height > 0 ? r : null;
    });
  }
  /** The place between letters nearest to a point: 0 (before the first letter) .. n (after the last). */
  function boundaryAt(x, y) {
    let best = -1, far = Infinity;
    boxes.forEach((r, i) => {
      if (!r) return;
      const dy = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
      const dx = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
      const d = dy * 4 + dx;  // (the line first, then the letter on it)
      if (d < far) { far = d; best = i; }
    });
    if (best < 0) return cur.to;
    const r = boxes[best];
    const leftHalf = x < r.left + r.width / 2;
    return best + (leftHalf === rtl() ? 1 : 0);
  }

  // ----- drawing -----
  function paint() {
    const base = bar.getBoundingClientRect();
    if (!base.width || !node) return;
    measure();
    // the highlight: one box a line, from the letters' boxes (a range's own boxes come a glyph at a time)
    const lines = [];
    for (let i = cur.from; i < cur.to; i++) {
      const r = boxes[i];
      if (!r) continue;
      const line = lines.find((l) => Math.abs(l.top - r.top) < r.height / 2);
      if (line) { line.left = Math.min(line.left, r.left); line.right = Math.max(line.right, r.right); line.bottom = Math.max(line.bottom, r.bottom); }
      else lines.push({ top: r.top, bottom: r.bottom, left: r.left, right: r.right });
    }
    fill.textContent = "";
    for (const l of lines) {
      const d = document.createElement("i");
      d.style.cssText = `left:${l.left - base.left - 2}px;top:${l.top - base.top}px;width:${l.right - l.left + 4}px;height:${l.bottom - l.top}px`;
      fill.append(d);
    }
    // its two ends: before the first chosen letter, after the last
    const put = (el, r, leading) => {
      if (!r) { el.hidden = true; return; }
      el.hidden = false;
      const x = (leading === rtl() ? r.right : r.left) - base.left;
      el.style.cssText = `left:${x}px;top:${r.top - base.top}px;height:${r.height}px`;
    };
    const first = boxes.slice(cur.from, cur.to).find(Boolean), last = boxes.slice(cur.from, cur.to).reverse().find(Boolean);
    put(hStart, first, true);
    put(hEnd, last, false);
    hStart.classList.toggle("active", edge === "start");
    hEnd.classList.toggle("active", edge === "end");
    bar.setAttribute("aria-valuetext", letters.slice(cur.from, cur.to).join(""));
  }
  const same = (a, b) => a.from === b.from && a.to === b.to;
  function set(next, tell = false) {
    const s = cleanSel(next, n);
    const moved = !same(s, cur);
    cur = s;
    paint();
    if (moved && tell) onChange({ ...cur });
    return moved;
  }

  // ----- a finger or the mouse -----
  let drag = null;  // {id, mode: "start" | "end" | "new", anchor, was}
  bar.addEventListener("pointerdown", (e) => {
    if (e.button > 0) return;
    e.stopPropagation();  // (the review card under it starts its own swipe on a press)
    e.preventDefault();   // (no text selection, no scrolling)
    try { bar.focus({ preventScroll: true }); } catch { /* fine */ }
    measure();
    const at = boundaryAt(e.clientX, e.clientY);
    const grab = e.target.closest && e.target.closest(".rv-part-handle");
    const mode = grab ? (grab.classList.contains("start") ? "start" : "end") : at === cur.from ? "start" : at === cur.to ? "end" : "new";
    if (mode !== "new") edge = mode;
    drag = { id: e.pointerId, mode, anchor: at, was: { ...cur } };
    try { bar.setPointerCapture(e.pointerId); } catch { /* fine without */ }
    bar.classList.add("dragging");
    paint();
  });
  bar.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    e.stopPropagation();
    const at = boundaryAt(e.clientX, e.clientY);
    if (drag.mode === "start") set({ from: Math.min(at, cur.to - 1), to: cur.to });
    else if (drag.mode === "end") set({ from: cur.from, to: Math.max(at, cur.from + 1) });
    else if (at !== drag.anchor) { edge = at > drag.anchor ? "end" : "start"; set({ from: Math.min(at, drag.anchor), to: Math.max(at, drag.anchor) }); }
  });
  const drop = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    e.stopPropagation();
    const was = drag.was;
    drag = null;
    bar.classList.remove("dragging");
    if (!same(was, cur)) { buzz("tick"); onChange({ ...cur }); }
  };
  bar.addEventListener("pointerup", drop);
  bar.addEventListener("pointercancel", drop);

  // ----- keys, and a game controller -----
  const other = () => { edge = edge === "start" ? "end" : "start"; buzz("tick"); paint(); };
  bar.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      const along = (e.key === "ArrowRight") !== rtl() ? 1 : -1;  // (right moves an end to the right, in any script)
      if (set(moveEdge(cur, edge, along, n), true)) buzz("tick");
    } else if (e.key === "Enter" || e.key === " ") other();
    else return;
    e.preventDefault();
    e.stopPropagation();  // (these keys answer the review card otherwise)
  });
  // (a controller's press arrives as a click made by code: `detail` 0; a mouse's click after a drag is not one)
  bar.addEventListener("click", (e) => { e.stopPropagation(); if (e.detail === 0) other(); });

  // The bar is measured once it is on screen, and again when its size changes (the card opens, the phone turns).
  let watch = null;
  if (typeof ResizeObserver !== "undefined") { watch = new ResizeObserver(() => paint()); watch.observe(bar); }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (bar.isConnected) paint(); }).catch(() => {});
  paint();

  return {
    letters,
    sel: () => ({ ...cur }),
    set: (next) => set(next, false),
    close: () => { if (watch) watch.disconnect(); },
  };
}
