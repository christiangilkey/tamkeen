// The first-visit guide: the first time someone opens the Library, Vocab or Friends (once signed
// in), the page dims and each button is outlined in turn with a line on what it does: Back, Next,
// Skip. Shown once per page on each device; Settings → Look & feel can show them all again.
// Steps whose button isn't on the screen (another layout, nothing there yet) are left out.

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

/** The first match of `selector` on the screen (others may sit in a hidden tab of the page). */
const find = (root, selector) => [...root.querySelectorAll(selector)].find(onScreen) || null;

let open = null; // the guide showing now (one at a time)

/**
 * Show `page`'s guide if this device hasn't shown it yet.
 * @param {string} page "library" | "vocab" | "friends"
 * @param {HTMLElement} root the page, where the steps' targets are looked up
 * @param {{target: string, title: string, text: string}[]} steps target = a CSS selector
 */
export function firstVisitTour(page, root, steps) {
  if (seen()[page] || open) return;
  // A moment later: the computer builds a page off screen and then moves it on (route() in app.js).
  setTimeout(() => {
    if (seen()[page] || open || !root.isConnected) return; // (left the page already)
    // Not over another popup or the first-run screens: next visit instead.
    if (document.querySelector(".modal-back")) return;
    const list = steps.filter((s) => find(root, s.target));
    if (!list.length) return;
    markSeen(page);
    show(root, list);
  }, 600);
}

function show(root, list) {
  let at = 0;
  // Looked up again each time: a page that redraws (Friends, on live updates) replaces its buttons.
  const target = () => find(root, list[at].target);
  const layer = h(`<div class="tour" role="dialog" aria-modal="true" aria-labelledby="tour-title">
    <div class="tour-hole"></div>
    <div class="tour-card">
      <div class="tour-count small muted"></div>
      <h3 id="tour-title" class="tour-title"></h3>
      <p class="tour-text"></p>
      <div class="tour-buttons">
        <button type="button" class="ghost tour-skip">Skip</button>
        <span class="spacer"></span>
        <button type="button" class="ghost tour-back">Back</button>
        <button type="button" class="primary tour-next">Next</button>
      </div>
    </div></div>`);
  const hole = layer.querySelector(".tour-hole");
  const card = layer.querySelector(".tour-card");
  const next = layer.querySelector(".tour-next");
  const back = layer.querySelector(".tour-back");

  const place = () => {
    const el = target();
    if (!el) return;
    const r = el.getBoundingClientRect();
    const pad = 6;
    Object.assign(hole.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`,
      width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
    // The card under the button when it fits there, else above it, else at the bottom of the screen.
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const w = Math.min(340, vw - 32);
    card.style.width = `${w}px`;
    const ch = card.offsetHeight;
    const gap = 14;
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
    if (!el) { // gone since the guide began: skip it
      list.splice(at, 1);
      if (!list.length) return close();
      return go(Math.min(at, list.length - 1));
    }
    el.scrollIntoView({ block: "center", inline: "nearest" });
    layer.querySelector(".tour-count").textContent = `${at + 1} of ${list.length}`;
    layer.querySelector(".tour-title").textContent = s.title;
    layer.querySelector(".tour-text").textContent = s.text;
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
  function keys(e) {
    if (e.key === "Escape") { e.preventDefault(); close(); }
    else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
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
