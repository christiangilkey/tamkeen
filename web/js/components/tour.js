// The page guides: the page dims and each button is outlined in turn with a line on what it does
// (Back, Next, Skip). Every screen has one, and the round "?" in the top bar (helpbutton.js) shows the
// current screen's guide at any time (the owner: "it plays once and the users get no way of going
// back to see them again"). Home, the Library, Vocab and Friends also show theirs by themselves the
// first time they are opened on a device; Settings → Look & feel can show those again.
// Steps whose button isn't on the screen (another layout, nothing there yet) are left out.
//
// A step can also be:
//  - a picture: no `target`, and `art` (a small drawing made in guideart.js): the card sits in the
//    middle of the dimmed screen with the drawing in it (the word popup, its buttons...);
//  - a demonstration: `demo` "tap", "hold" or "drag" puts a moving fingertip on the outlined word,
//    showing the gesture over and over while the card is up ("drag": from that word across the
//    next ones on its line, as when several words are looked up together).

import { h } from "../app.js";

const KEY = "tamkeenToursSeen";

function seen() {
  try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch { return {}; }
}
function markSeen(page) {
  try { localStorage.setItem(KEY, JSON.stringify({ ...seen(), [page]: 1 })); } catch { /* storage unavailable */ }
}
/** Settings: show every page's guide again on its next visit. */
export function resetTours() {
  try { localStorage.removeItem(KEY); } catch { /* storage unavailable */ }
}

const onScreen = (el) => !!el && el.isConnected && el.getClientRects().length > 0
  && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0;

/** The first match of `selector` on the screen (others may sit in a hidden tab of the page). A list
 * of selectors is tried in order: the first that matches something on the screen wins. */
function find(root, selector) {
  for (const sel of [].concat(selector)) {
    const el = [...root.querySelectorAll(sel)].find(onScreen);
    if (el) return el;
  }
  return null;
}

let open = null; // the guide showing now (one at a time)

// The guides of the screens showing now, newest last (a review over Vocab is above it). The "?"
// shows the newest whose page is still on the screen.
let guides = [];

/**
 * Give a screen its guide, for the "?" button.
 * @param {string} page a name for it ("player", "settings"...)
 * @param {HTMLElement} root the page, where the steps' targets are looked up
 * @param {{target?: string|string[], title: string, text: string, anywhere?: boolean, art?: () => string,
 *   demo?: "tap"|"hold"|"drag"}[]} steps target = a CSS selector (or several, tried in order), looked
 *   up in `root`, or in the whole window with `anywhere` (the top bar's buttons); none: a picture step
 */
export function pageGuide(page, root, steps) {
  if (!root) return;
  guides = guides.filter((g) => g.root.isConnected && g.root !== root && g.page !== page);
  guides.push({ page, root, steps });
}

/** The guide of the screen showing now, or null. */
export function currentGuide() {
  guides = guides.filter((g) => g.root.isConnected);
  for (let i = guides.length - 1; i >= 0; i--) if (guides[i].root.getClientRects().length) return guides[i];
  return null;
}

const usable = (root, steps) => steps.filter((s) => !s.target || find(s.anywhere ? document : root, s.target));

/** The "?" button: this screen's guide, now. */
export function showGuide() {
  if (open) return;
  const g = currentGuide();
  const list = g ? usable(g.root, g.steps) : [];
  show(g ? g.root : document.body, list.length ? list : [{ title: "This screen",
    text: "Tap any button to try it: nothing is lost by exploring. The ? at the top shows a guide on the screens that have one." }]);
}

/**
 * Give a screen its guide, and show it if this device hasn't shown it yet.
 * @param {string} page "home" | "library" | "vocab" | "friends" | "review"
 * @param {HTMLElement} root
 * @param {object[]} steps as for pageGuide
 */
export function firstVisitTour(page, root, steps) {
  if (!guides.some((g) => g.root === root)) pageGuide(page, root, steps); // (a fuller guide given to the same screen stays)
  if (seen()[page] || open) return;
  // A moment later: the computer builds a page off screen and then moves it on (route() in app.js).
  setTimeout(() => {
    if (seen()[page] || open || !root.isConnected) return; // (left the page already)
    // Not over another popup or the first-run screens: next visit instead.
    if (document.querySelector(".modal-back")) return;
    const list = usable(root, steps).filter((s) => s.target); // (the pictures wait for the "?")
    if (!list.length) return;
    markSeen(page);
    show(root, list);
  }, 600);
}

/** For "drag": the outlined word and the next ones after it on the same line (up to three in all). */
function wordsFrom(el) {
  const out = [el];
  const top = el.getBoundingClientRect().top;
  let n = el.nextElementSibling;
  while (n && out.length < 3) {
    if (n.matches(".w") && onScreen(n)) {
      if (Math.abs(n.getBoundingClientRect().top - top) > 4) break;
      out.push(n);
    }
    n = n.nextElementSibling;
  }
  return out;
}

function show(root, list) {
  let at = 0;
  // Looked up again each time: a page that redraws (Friends, on live updates) replaces its buttons.
  const target = () => (list[at].target ? find(list[at].anywhere ? document : root, list[at].target) : null);
  const layer = h(`<div class="tour" role="dialog" aria-modal="true" aria-labelledby="tour-title">
    <div class="tour-hole"></div>
    <div class="tour-sweep" hidden></div>
    <div class="tour-hand" hidden><span class="tour-ring"></span></div>
    <div class="tour-card">
      <div class="tour-count small muted"></div>
      <h3 id="tour-title" class="tour-title"></h3>
      <p class="tour-text"></p>
      <div class="tour-art" hidden></div>
      <div class="tour-buttons">
        <button type="button" class="ghost tour-skip">Skip</button>
        <span class="spacer"></span>
        <button type="button" class="ghost tour-back">Back</button>
        <button type="button" class="primary tour-next">Next</button>
      </div>
    </div></div>`);
  const hole = layer.querySelector(".tour-hole");
  const hand = layer.querySelector(".tour-hand");
  const sweep = layer.querySelector(".tour-sweep");
  const card = layer.querySelector(".tour-card");
  const art = layer.querySelector(".tour-art");
  const next = layer.querySelector(".tour-next");
  const back = layer.querySelector(".tour-back");

  const place = () => {
    const s = list[at];
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const w = Math.min(s.art ? 380 : 340, vw - 32);
    card.style.width = `${w}px`;
    const ch = card.offsetHeight;
    const el = target();
    layer.classList.toggle("tour-picture", !el);
    if (!el) { // a picture: the card in the middle of the dimmed screen
      hole.hidden = true;
      hand.hidden = true;
      sweep.hidden = true;
      Object.assign(card.style, { left: `${(vw - w) / 2}px`, top: `${Math.max(12, (vh - ch) / 2)}px` });
      return;
    }
    hole.hidden = false;
    // The outline: the button, or for a drag the words it crosses.
    const words = s.demo === "drag" ? wordsFrom(el) : [el];
    const rects = words.map((x) => x.getBoundingClientRect());
    const r = { left: Math.min(...rects.map((x) => x.left)), right: Math.max(...rects.map((x) => x.right)),
      top: Math.min(...rects.map((x) => x.top)), bottom: Math.max(...rects.map((x) => x.bottom)) };
    r.width = r.right - r.left;
    r.height = r.bottom - r.top;
    const pad = 6;
    Object.assign(hole.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`,
      width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
    // The fingertip: on the (first) word, and for a drag sliding to the last one, the words lighting up behind it.
    hand.hidden = !s.demo;
    sweep.hidden = s.demo !== "drag";
    if (s.demo) {
      const first = rects[0];
      const last = rects[rects.length - 1];
      const rtl = getComputedStyle(el).direction === "rtl";
      const x0 = first.left + first.width / 2;
      const x1 = last.left + last.width / 2;
      hand.className = `tour-hand ${s.demo}`;
      Object.assign(hand.style, { left: `${x0}px`, top: `${first.top + first.height / 2}px` });
      hand.style.setProperty("--dx", `${x1 - x0}px`);
      if (s.demo === "drag") {
        Object.assign(sweep.style, { top: `${r.top - 2}px`, height: `${r.height + 4}px`,
          left: `${rtl ? r.left : first.left - 2}px`, width: `${r.width + 4}px` });
        sweep.style.transformOrigin = rtl ? "right center" : "left center";
      }
    }
    // The card under the button when it fits there, else above it, else at the bottom of the screen.
    const gap = s.demo ? 30 : 14;
    let top;
    if (r.bottom + pad + gap + ch <= vh - 12) top = r.bottom + pad + gap;
    else if (r.top - pad - gap - ch >= 12) top = r.top - pad - gap - ch;
    else top = vh - ch - 16;
    const left = Math.min(Math.max(16, r.left + r.width / 2 - w / 2), vw - w - 16);
    Object.assign(card.style, { left: `${left}px`, top: `${Math.max(12, top)}px` });
  };

  const go = (i) => {
    at = i;
    const s = list[at];
    const el = target();
    if (s.target && !el) { // gone since the guide began: skip it
      list.splice(at, 1);
      if (!list.length) return close();
      return go(Math.min(at, list.length - 1));
    }
    if (el) el.scrollIntoView({ block: "center", inline: "nearest" });
    layer.querySelector(".tour-count").textContent = `${at + 1} of ${list.length}`;
    layer.querySelector(".tour-title").textContent = s.title;
    layer.querySelector(".tour-text").textContent = s.text;
    art.hidden = !s.art;
    art.innerHTML = s.art ? s.art(root) : "";
    back.hidden = at === 0;
    next.textContent = at === list.length - 1 ? "Done" : "Next";
    place();
    requestAnimationFrame(place); // (once the translated words and the scroll have settled)
    next.focus({ preventScroll: true });
  };

  function close() {
    layer.remove();
    window.removeEventListener("resize", place);
    document.removeEventListener("scroll", place, true);
    window.removeEventListener("hashchange", close);
    document.removeEventListener("keydown", keys, true);
    open = null;
  }
  // (The keys it uses go no further: Esc closes only the guide, not the review card under it.)
  function keys(e) {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.stopPropagation();
      // Forward is right in English and left in Arabic.
      const fwd = (e.key === "ArrowRight") !== (document.documentElement.dir === "rtl");
      if (fwd && at < list.length - 1) go(at + 1);
      else if (!fwd && at > 0) go(at - 1);
    }
  }

  next.onclick = () => (at === list.length - 1 ? close() : go(at + 1));
  back.onclick = () => go(at - 1);
  layer.querySelector(".tour-skip").onclick = close;
  window.addEventListener("resize", place);
  document.addEventListener("scroll", place, true);
  window.addEventListener("hashchange", close); // another page: the guide goes with this one
  document.addEventListener("keydown", keys, true);
  document.body.append(layer);
  open = layer;
  go(0);
}
