// The round "?" in the top bar, on every screen of every version: it shows how to use the screen
// that is open (its page guide, tour.js), as often as wanted. On a computer the ? key does the same,
// except while typing.

import { showGuide } from "./tour.js";

export function helpButton() {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "top-help";
  b.setAttribute("aria-label", "How to use this screen");
  b.title = "How to use this screen";
  b.textContent = "?";
  b.onclick = () => showGuide();
  return b;
}

const typing = (el) => !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

/** Put the button in the top bar, just before `before` (or at its end), and listen for the ? key. */
export function mountHelpButton(bar, before = null) {
  if (!bar || bar.querySelector(".top-help")) return;
  const b = helpButton();
  if (before) before.before(b); else bar.append(b);
  document.addEventListener("keydown", (e) => {
    if (e.key !== "?" || e.ctrlKey || e.metaKey || e.altKey || typing(document.activeElement)) return;
    e.preventDefault();
    showGuide();
  });
}
