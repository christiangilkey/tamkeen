// A box shown over the page (the first-run questions, the API-key walkthrough, "Words I know").
// Shared by the desktop app and the phone.

import { h } from "../app.js";

/**
 * Open a box. `canClose: false` makes one that must be answered (no ✕, Esc does nothing).
 * `beforeClose` (optional) is asked first when the learner closes it (✕, Esc, a click beside it):
 * it resolves to true to let it close (the "Add words" builder asks first when something typed would
 * be lost). `cls` is another class for the dimmed back; `cross: false` leaves out the ✕ of a box that
 * has its own way out (the fix popup's Dismiss). Returns { el, body, close }: fill `body`, call
 * `close()` when done (that never asks).
 */
export function openModal({ title = "", canClose = true, wide = false, onClose, beforeClose, cls = "", cross = true } = {}) {
  const wrap = h(`<div class="modal-back${cls ? ` ${cls}` : ""}"><div class="modal-box${wide ? " wide" : ""}" role="dialog" aria-modal="true">
    <div class="modal-head"><h2></h2>${canClose && cross ? `<button type="button" class="ghost icon" data-close title="Close (Esc)" aria-label="Close">✕</button>` : ""}</div>
    <div class="modal-body"></div>
  </div></div>`);
  const heading = wrap.querySelector("h2");
  heading.textContent = title;
  const close = () => {
    if (!wrap.isConnected) return;
    document.removeEventListener("keydown", onKey, true);
    wrap.remove();
    if (onClose) onClose();
  };
  let asking = false;
  const tryClose = async () => {
    if (!beforeClose) { close(); return; }
    if (asking) return;
    asking = true;
    let ok = false;
    try { ok = await beforeClose(); } catch { ok = false; } finally { asking = false; }
    if (ok) close();
  };
  // Only the box on top answers Esc, so a walkthrough opened from another box closes first.
  const onKey = (e) => {
    if (e.key !== "Escape" || !canClose) return;
    const open = document.querySelectorAll(".modal-back");
    if (open[open.length - 1] !== wrap) return;
    e.stopPropagation();
    tryClose();
  };
  document.addEventListener("keydown", onKey, true);
  wrap.addEventListener("click", (e) => {
    if (canClose && (e.target === wrap || e.target.closest("[data-close]"))) tryClose();
  });
  document.body.append(wrap);
  return { el: wrap, body: wrap.querySelector(".modal-body"), close, setTitle: (t) => { heading.textContent = t; } };
}

/**
 * A sleek in-app yes/no box instead of the browser's plain one (which a game controller can't
 * answer, and which stops the whole page while it is open). Resolves to true or false.
 */
export function confirmBox(title, text, { ok = "OK", danger = false } = {}) {
  return new Promise((resolve) => {
    let answer = false;
    const m = openModal({ title, onClose: () => resolve(answer) });
    const p = h(`<p class="muted confirm-text"></p>`);
    p.textContent = text;
    p.hidden = !text;
    const row = h(`<div class="confirm-buttons"><button type="button" class="ghost">Cancel</button>
      <button type="button" class="${danger ? "danger-solid" : "primary"}"></button></div>`);
    row.lastElementChild.textContent = ok;
    row.firstElementChild.onclick = () => m.close();
    row.lastElementChild.onclick = () => { answer = true; m.close(); };
    m.body.append(p, row);
    row.lastElementChild.focus();
  });
}
