// Looking up several words together, by dragging across them. One helper for every place words can
// be tapped (transcripts, captions, pages, books, reels, the Netflix bar), so they all work alike:
//   - mouse: press on a word and drag over its neighbours; the words covered light up as you go,
//     from the first word to the one under the pointer, either way; letting go looks them up
//     together. A plain click is still the one-word lookup (the page's own click handler).
//   - touch: a tap is still the one-word lookup, and a swipe still scrolls. Press and hold a word
//     (HOLD_MS) and it lights up (and the phone ticks); then slide the finger over the next words;
//     lifting looks them up together. Lifting without sliding off the word is `onHold` (the page's
//     long-press menu), or the one-word lookup where there is none. If the finger moves before the
//     hold has started, it is a scroll and nothing else happens.
// While a hold or a drag is going on the page doesn't scroll, and the system's own text selection,
// magnifier and long-press menu stay away (see .phrase-root in app.css, and the listeners below).
// Which words a drag covers (in the text's order, across lines and sentences, at most PHRASE_MAX) is
// worked out by ../phrase.js. (A phrase used to stop at the end of its line; the owner: "allow me to
// highlight any section or sections together".)

import { buzz } from "../app.js";
import { PHRASE_MAX, phraseRange } from "../phrase.js";

const HOLD_MS = 350;   // touch: how long a finger rests on a word before a phrase starts
const MOVE_PX = 10;    // touch: moving further than this before then is a scroll
const MOUSE_PX = 4;    // mouse: how far it must move before a drag counts
const QUIET_MS = 450;  // after a phrase: the click (and long-press menu) the browser may still send are ignored

/**
 * Let words in `root` be dragged across to look several up together.
 * @param {HTMLElement} root the element the words (`.w` with `data-i`) are in
 * @param {{
 *   onPick: (i: number, j: number, el: HTMLElement) => void,  // words i..j (i <= j) chosen; i === j
 *                       // after a drag that came back to its first word
 *   onHold?: (i: number, x: number, y: number, el: HTMLElement) => void,  // touch: held, not dragged
 *   blockOf?: (i: number) => any,   // which line or paragraph word i is in (no longer limits a phrase)
 *   elOf?: (i: number) => HTMLElement|null,  // word i's element in root (default: looked up)
 *   onStart?: () => void, onEnd?: () => void,  // a press on a word began / the gesture is over
 *   max?: number,
 * }} opts
 * @returns {{ destroy: () => void, readonly busy: boolean }}
 */
export function phrasePicker(root, opts) {
  const max = opts.max || PHRASE_MAX;
  const elOf = opts.elOf || ((i) => root.querySelector(`.w[data-i="${i}"]`));
  const wordAt = (x, y) => {
    const hit = document.elementFromPoint(x, y);
    const w = hit && hit.closest ? hit.closest(".w") : null;
    return w && root.contains(w) && w.dataset.i != null ? w : null;
  };
  root.classList.add("phrase-root");

  let g = null;     // the gesture: {id, touch, start, el, x, y, phase: "press"|"hold"|"drag", range, timer}
  let painted = []; // elements lit up now
  let quietUntil = 0;

  function paint(range) {
    for (const el of painted) el.classList.remove("phr", "phr-a", "phr-z");
    painted = [];
    if (!range) return;
    const [a, b] = range;
    for (let k = a; k <= b; k++) {
      const el = elOf(k);
      if (!el) continue;
      el.classList.add("phr");
      if (k === a) el.classList.add("phr-a");
      if (k === b) el.classList.add("phr-z");
      painted.push(el);
    }
  }

  function end() {
    if (!g) return;
    clearTimeout(g.timer);
    g = null;
    paint(null);
    root.classList.remove("phrase-picking");
    window.removeEventListener("pointermove", onMove, true);
    window.removeEventListener("pointerup", onUp, true);
    window.removeEventListener("pointercancel", onCancel, true);
    window.removeEventListener("keydown", onKey, true);
    window.removeEventListener("blur", onCancel);
    if (opts.onEnd) opts.onEnd();
  }

  function startHold() {
    if (!g || g.phase !== "press") return;
    g.phase = "hold";
    g.range = [g.start, g.start];
    root.classList.add("phrase-picking");
    paint(g.range);
    buzz("tick");
  }

  function extend(x, y) {
    const w = wordAt(x, y);
    if (!w) return; // between words or outside: the phrase stays as it was
    const to = Number(w.dataset.i);
    const range = phraseRange(g.start, to, { max });
    if (to !== g.start && g.phase !== "drag") {
      g.phase = "drag";
      root.classList.add("phrase-picking");
      window.getSelection()?.removeAllRanges();
    }
    if (g.phase !== "drag") return;
    if (!g.range || range[0] !== g.range[0] || range[1] !== g.range[1]) {
      g.range = range;
      paint(range);
    }
  }

  function onDown(e) {
    if (g) end();
    if (!e.isPrimary) return;
    const touch = e.pointerType !== "mouse";
    if (!touch && (e.button !== 0 || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey)) return;
    const el = e.target && e.target.closest ? e.target.closest(".w") : null;
    if (!el || !root.contains(el) || el.dataset.i == null) return;
    g = { id: e.pointerId, touch, start: Number(el.dataset.i), el, x: e.clientX, y: e.clientY, phase: "press", range: null, timer: 0 };
    if (touch) g.timer = setTimeout(startHold, HOLD_MS);
    window.addEventListener("pointermove", onMove, true);
    window.addEventListener("pointerup", onUp, true);
    window.addEventListener("pointercancel", onCancel, true);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("blur", onCancel);
    if (opts.onStart) opts.onStart();
  }

  function onMove(e) {
    if (!g || e.pointerId !== g.id) return;
    const far = Math.hypot(e.clientX - g.x, e.clientY - g.y);
    if (g.phase === "press") {
      if (g.touch) { if (far > MOVE_PX) end(); return; } // a scroll or a swipe
      if (far < MOUSE_PX) return;
    }
    extend(e.clientX, e.clientY);
  }

  function onUp(e) {
    if (!g || e.pointerId !== g.id) return;
    const { phase, start, el, range } = g;
    if (phase === "press") { end(); return; } // a tap or a click: the page's own click handler
    // A hold or a drag: the browser's click (and anything else this release would do) is not wanted.
    e.stopImmediatePropagation();
    quietUntil = Date.now() + QUIET_MS;
    const x = e.clientX, y = e.clientY;
    end();
    if (phase === "hold" && opts.onHold) opts.onHold(start, x, y, el);
    else if (phase === "hold") opts.onPick(start, start, el);
    else {
      const [i, j] = range || [start, start];
      opts.onPick(i, j, elOf(i) || el);
    }
  }

  function onCancel(e) { if (g && (!e || e.type === "blur" || e.pointerId === g.id)) end(); }
  function onKey(e) {
    if (e.key === "Escape" && g && g.phase !== "press") { e.stopImmediatePropagation(); e.preventDefault(); end(); }
  }

  // While holding or dragging: no scrolling, no system menu, no text selection.
  const busy = () => !!g && g.phase !== "press";
  const onTouchMove = (e) => {
    if (!busy()) return;
    if (e.cancelable) e.preventDefault();
    e.stopImmediatePropagation(); // (and the page doesn't take it for the user scrolling)
  };
  const onContextMenu = (e) => {
    if ((g && g.touch) || busy() || Date.now() < quietUntil) { e.preventDefault(); e.stopImmediatePropagation(); }
  };
  const onSelectStart = (e) => { if (g) e.preventDefault(); };
  // (The click a drag ends with lands on the words' block, or on whatever holds both its ends.)
  const onClick = (e) => {
    if (Date.now() >= quietUntil || !e.target || !(root.contains(e.target) || e.target.contains(root))) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    quietUntil = 0;
  };

  root.addEventListener("pointerdown", onDown);
  root.addEventListener("touchmove", onTouchMove, { passive: false, capture: true });
  root.addEventListener("contextmenu", onContextMenu, true);
  root.addEventListener("selectstart", onSelectStart, true);
  root.addEventListener("dragstart", onSelectStart, true);
  window.addEventListener("click", onClick, true);

  return {
    get busy() { return busy(); },
    destroy() {
      end();
      root.removeEventListener("pointerdown", onDown);
      root.removeEventListener("touchmove", onTouchMove, { capture: true });
      root.removeEventListener("contextmenu", onContextMenu, true);
      root.removeEventListener("selectstart", onSelectStart, true);
      root.removeEventListener("dragstart", onSelectStart, true);
      window.removeEventListener("click", onClick, true);
      root.classList.remove("phrase-root");
    },
  };
}
