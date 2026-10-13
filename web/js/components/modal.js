// A box shown over the page (the first-run questions, the API-key walkthrough, "Words I know").
// Shared by the desktop app and the phone.

import { h } from "../app.js";

/**
 * Open a box. `canClose: false` makes one that must be answered (no ✕, Esc does nothing).
 * Returns { el, body, close }: fill `body`, call `close()` when done.
 */
export function openModal({ title = "", canClose = true, wide = false, onClose } = {}) {
  const wrap = h(`<div class="modal-back"><div class="modal-box${wide ? " wide" : ""}" role="dialog" aria-modal="true">
    <div class="modal-head"><h2></h2>${canClose ? `<button type="button" class="ghost icon" data-close title="Close (Esc)" aria-label="Close">✕</button>` : ""}</div>
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
  // Only the box on top answers Esc, so a walkthrough opened from another box closes first.
  const onKey = (e) => {
    if (e.key !== "Escape" || !canClose) return;
    const open = document.querySelectorAll(".modal-back");
    if (open[open.length - 1] !== wrap) return;
    e.stopPropagation();
    close();
  };
  document.addEventListener("keydown", onKey, true);
  wrap.addEventListener("click", (e) => {
    if (canClose && (e.target === wrap || e.target.closest("[data-close]"))) close();
  });
  document.body.append(wrap);
  return { el: wrap, body: wrap.querySelector(".modal-body"), close, setTitle: (t) => { heading.textContent = t; } };
}
